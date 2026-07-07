// §12 공유·협업 — 링크 기반 권한(보기/편집) + 슬라이드 단위 LWW 동기화 + 프레즌스
// AI 라우터의 rate limit을 타지 않도록 별도 라우터로 분리해 먼저 마운트한다.
import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { deckSchema, slideSchema } from "../ai/validate.js";
import type { StoredDeck } from "../store/deckRepo.js";
import {
  findByToken,
  getRecord,
  replaceDeck,
  replaceSlide,
  upsertShared,
} from "../store/deckRepo.js";
import { mailConfigured, sendMail } from "../mail.js";
import { getBlocked, logEvent } from "../store/adminStore.js";
import { inviteEmailHtml } from "../templates/inviteEmail.js";
import { initSSE, sendEvent } from "../sse.js";

export const collabRouter = Router();

// ===== 프레즌스/구독 허브 =====
interface Peer {
  clientId: string;
  name: string;
  color: string;
  slideIndex: number;
  ts: number;
}

const subscribers = new Map<string, Set<{ res: Response; clientId: string }>>();
const presence = new Map<string, Map<string, Peer>>();

function broadcast(deckId: string, event: string, data: unknown): void {
  const subs = subscribers.get(deckId);
  if (!subs) return;
  for (const s of subs) {
    try {
      sendEvent(s.res, event, data);
    } catch {
      /* 끊긴 연결은 close 핸들러가 정리 */
    }
  }
}

function peersOf(deckId: string): Peer[] {
  return [...(presence.get(deckId)?.values() ?? [])];
}

/** 관리자 콘솔용 — 전체 프레즌스 스냅샷 (이름·덱·최근 활동) */
export function listPresence(): { name: string; deckId: string; ts: number }[] {
  const out: { name: string; deckId: string; ts: number }[] = [];
  for (const [deckId, peers] of presence) {
    for (const p of peers.values()) out.push({ name: p.name, deckId, ts: p.ts });
  }
  return out;
}

function broadcastPresence(deckId: string): void {
  broadcast(deckId, "presence", { peers: peersOf(deckId) });
}

// 30초 무응답 프레즌스 제거
setInterval(() => {
  const now = Date.now();
  for (const [deckId, peers] of presence) {
    let changed = false;
    for (const [cid, p] of peers) {
      if (now - p.ts > 30_000) {
        peers.delete(cid);
        changed = true;
      }
    }
    if (changed) broadcastPresence(deckId);
  }
}, 15_000).unref();

function requireRole(
  deckId: string,
  token: unknown,
  role: "edit" | "view",
): StoredDeck | null {
  if (typeof token !== "string" || !token) return null;
  const rec = getRecord(deckId);
  if (!rec) return null;
  if (rec.editToken === token) return rec;
  if (role === "view" && rec.viewToken === token) return rec;
  return null;
}

// ===== ① 공유 시작: 덱 등록 → 토큰 발급 =====
const shareBody = z.object({ deck: deckSchema });

collabRouter.post("/share", (req: Request, res: Response) => {
  const parsed = shareBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "유효한 deck이 필요합니다." });
    return;
  }
  const rec = upsertShared(parsed.data.deck);
  res.json({ editToken: rec.editToken, viewToken: rec.viewToken, rev: rec.rev });
});

// ===== ② 토큰으로 덱 조회 (공유 링크 진입) =====
collabRouter.get("/share/:token", (req: Request, res: Response) => {
  const hit = findByToken(req.params.token);
  if (!hit) {
    res.status(404).json({ error: "존재하지 않거나 만료된 공유 링크입니다." });
    return;
  }
  res.json({
    deck: hit.record.deck,
    rev: hit.record.rev,
    role: hit.role,
    deckId: hit.record.deck.id,
  });
});

// ===== ③ 슬라이드 단위 push (LWW) =====
const slidePushBody = z.object({
  token: z.string(),
  clientId: z.string().max(64),
  slide: slideSchema,
});

collabRouter.post("/collab/:deckId/slide", (req: Request, res: Response) => {
  const parsed = slidePushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "유효하지 않은 요청입니다." });
    return;
  }
  const { token, clientId, slide } = parsed.data;
  if (!requireRole(req.params.deckId, token, "edit")) {
    res.status(403).json({ error: "편집 권한이 없습니다." });
    return;
  }
  const rec = replaceSlide(req.params.deckId, slide);
  if (!rec) {
    res.status(409).json({ error: "슬라이드를 찾을 수 없습니다 (구조 변경됨)." });
    return;
  }
  broadcast(req.params.deckId, "update", {
    kind: "slide",
    rev: rec.rev,
    origin: clientId,
    slide,
  });
  res.json({ rev: rec.rev });
});

// ===== ④ 덱 전체 push (구조/제목/테마 변경) =====
const deckPushBody = z.object({
  token: z.string(),
  clientId: z.string().max(64),
  deck: deckSchema,
});

collabRouter.post("/collab/:deckId/deck", (req: Request, res: Response) => {
  const parsed = deckPushBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "유효하지 않은 요청입니다." });
    return;
  }
  const { token, clientId, deck } = parsed.data;
  if (deck.id !== req.params.deckId) {
    res.status(400).json({ error: "deckId가 일치하지 않습니다." });
    return;
  }
  if (!requireRole(req.params.deckId, token, "edit")) {
    res.status(403).json({ error: "편집 권한이 없습니다." });
    return;
  }
  const rec = replaceDeck(req.params.deckId, deck);
  if (!rec) {
    res.status(404).json({ error: "공유되지 않은 덱입니다." });
    return;
  }
  broadcast(req.params.deckId, "update", {
    kind: "deck",
    rev: rec.rev,
    origin: clientId,
    deck,
  });
  res.json({ rev: rec.rev });
});

// ===== ⑤ 프레즌스 하트비트 =====
// ===== 이메일 초대 (Invite Email 템플릿) =====
const inviteBody = z.object({
  deckId: z.string(),
  token: z.string(), // 편집 토큰 = 초대 권한 증명
  email: z.string().email(),
  role: z.enum(["edit", "view"]),
  inviterName: z.string().max(40).default("게스트"),
});

collabRouter.post("/share/invite", async (req: Request, res: Response) => {
  const parsed = inviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "유효하지 않은 초대 요청입니다." });
    return;
  }
  const { deckId, token, email, role, inviterName } = parsed.data;
  const rec = requireRole(deckId, token, "edit"); // 편집 권한자만 초대 가능
  if (!rec) {
    res.status(403).json({ error: "초대 권한이 없습니다." });
    return;
  }
  if (!mailConfigured()) {
    res.status(503).json({ error: "메일 발송이 설정되지 않았습니다." });
    return;
  }
  const base = (process.env.PUBLIC_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) {
    res.status(503).json({ error: "public_base_url이 설정되지 않았습니다 (config.php)." });
    return;
  }
  const inviteToken = role === "edit" ? rec.editToken : rec.viewToken;
  const html = inviteEmailHtml({
    inviterName,
    inviterEmail: "DeckGen 공유",
    deckTitle: rec.deck.title,
    roleLabel: role === "edit" ? "편집 가능" : "보기 전용",
    roleDesc:
      role === "edit"
        ? "아웃라인·슬라이드를 수정하고 실시간 공동 편집할 수 있어요."
        : "열람과 PPTX 다운로드만 가능해요.",
    inviteUrl: `${base}/s/${inviteToken}`,
    deckMeta: `${rec.deck.slides.length}장 · DeckGen`,
    recipientEmail: email,
  });
  try {
    await sendMail(email, `[DeckGen] ${inviterName}님이 '${rec.deck.title}' 덱에 초대했어요`, html);
    logEvent({ ts: Date.now(), kind: "export", ok: true, ms: 0, meta: `초대 메일 · ${email} · ${role}` });
    res.json({ ok: true, message: `${email}로 초대 메일을 보냈어요.` });
  } catch (e) {
    console.warn("[invite] 발송 실패:", e);
    res.status(502).json({ error: "초대 메일 발송에 실패했습니다." });
  }
});

const presenceBody = z.object({
  token: z.string(),
  clientId: z.string().max(64),
  name: z.string().max(40),
  color: z.string().max(16),
  slideIndex: z.number().int().min(0).max(200),
});

collabRouter.post("/collab/:deckId/presence", (req: Request, res: Response) => {
  const parsed = presenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "유효하지 않은 요청입니다." });
    return;
  }
  const { token, clientId, name, color, slideIndex } = parsed.data;
  if (!requireRole(req.params.deckId, token, "view")) {
    res.status(403).json({ error: "권한이 없습니다." });
    return;
  }
  if (getBlocked().includes(name)) {
    res.status(403).json({ error: "차단된 사용자입니다. 관리자에게 문의하세요." });
    return;
  }
  const deckId = req.params.deckId;
  if (!presence.has(deckId)) presence.set(deckId, new Map());
  const prev = presence.get(deckId)!.get(clientId);
  presence.get(deckId)!.set(clientId, { clientId, name, color, slideIndex, ts: Date.now() });
  if (!prev || prev.slideIndex !== slideIndex || prev.name !== name) {
    broadcastPresence(deckId);
  }
  res.json({ ok: true });
});

// ===== ⑥ SSE 구독 (업데이트 + 프레즌스) =====
collabRouter.get("/collab/:deckId/events", (req: Request, res: Response) => {
  const deckId = req.params.deckId;
  const token = String(req.query.token ?? "");
  const clientId = String(req.query.clientId ?? "");
  const rec = requireRole(deckId, token, "view");
  if (!rec || !clientId) {
    res.status(403).json({ error: "권한이 없습니다." });
    return;
  }
  const name = String(req.query.name ?? "게스트").slice(0, 40);
  if (getBlocked().includes(name)) {
    res.status(403).json({ error: "차단된 사용자입니다." });
    return;
  }

  initSSE(res);
  const sub = { res, clientId };
  if (!subscribers.has(deckId)) subscribers.set(deckId, new Set());
  subscribers.get(deckId)!.add(sub);

  // 접속 즉시 프레즌스 등록
  const color = String(req.query.color ?? "#8A8A84").slice(0, 16);
  const slideIndex = Number(req.query.slideIndex ?? 0) || 0;
  if (!presence.has(deckId)) presence.set(deckId, new Map());
  presence.get(deckId)!.set(clientId, { clientId, name, color, slideIndex, ts: Date.now() });

  sendEvent(res, "hello", { rev: rec.rev, peers: peersOf(deckId) });
  broadcastPresence(deckId);

  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* close 핸들러가 정리 */
    }
  }, 20_000);

  req.on("close", () => {
    clearInterval(ping);
    subscribers.get(deckId)?.delete(sub);
    presence.get(deckId)?.delete(clientId);
    broadcastPresence(deckId);
  });
});
