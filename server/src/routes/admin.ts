// 관리자 콘솔 API (§14) — 이메일+비밀번호 → 이메일 OTP 2FA → Bearer 토큰
import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { Request, Response } from "express";
import { mailConfigured, sendMail, verificationEmailHtml } from "../mail.js";
import type { AuditEntry, Banner, TemplateMeta } from "../store/adminStore.js";
import {
  getAudit,
  getBanners,
  getBlocked,
  getErrors,
  getEvents,
  getSettings,
  getTemplates,
  logAudit,
  logEvent,
  patchSettings,
  resolveError,
  setBanners,
  setBlocked,
  setTemplates,
} from "../store/adminStore.js";
import { listDeckSummaries } from "../store/deckRepo.js";
import { listPresence } from "./collab.js";

export const adminRouter = Router();

const env = (k: string): string => (process.env[k] ?? "").trim();

// ===== 인증 =====
const otpCodes = new Map<string, { code: string; expiresAt: number }>();
const tokens = new Map<string, number>(); // token → expiresAt (12h)
const TOKEN_TTL = 12 * 3600_000;

function audit(req: Request, cat: AuditEntry["cat"], action: string, detail: string): void {
  logAudit({ ts: Date.now(), actor: "관리자", cat, action, detail, ip: req.ip ?? "?" });
}

adminRouter.post("/admin/login", async (req: Request, res: Response) => {
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  const adminEmail = env("ADMIN_EMAIL");
  const adminPw = env("ADMIN_PASSWORD");
  if (!adminEmail || !adminPw) {
    res.status(503).json({ error: "관리자 계정이 설정되지 않았습니다 (config.php admin_*)." });
    return;
  }
  if ((email ?? "").trim().toLowerCase() !== adminEmail.toLowerCase() || password !== adminPw) {
    res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    return;
  }
  if (!mailConfigured()) {
    // 메일 미설정 개발 환경: OTP 생략하고 즉시 토큰
    const token = randomBytes(24).toString("hex");
    tokens.set(token, Date.now() + TOKEN_TTL);
    res.json({ token });
    return;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpCodes.set(adminEmail.toLowerCase(), { code, expiresAt: Date.now() + 10 * 60_000 });
  try {
    await sendMail(adminEmail, "[DeckGen Admin] 2단계 인증 코드", verificationEmailHtml(code));
    res.json({
      otpRequired: true,
      message: "관리자 이메일로 인증 코드를 발송했습니다.",
      // config.php auth_debug=true 일 때만 — 개발/자동 테스트용
      ...(env("AUTH_DEBUG") === "true" ? { debugCode: code } : {}),
    });
  } catch (e) {
    console.warn("[admin] OTP 발송 실패:", e);
    res.status(502).json({ error: "인증 메일 발송에 실패했습니다." });
  }
});

adminRouter.post("/admin/verify", (req: Request, res: Response) => {
  const { email, code } = (req.body ?? {}) as { email?: string; code?: string };
  const key = (email ?? "").trim().toLowerCase();
  const entry = otpCodes.get(key);
  if (!entry || Date.now() > entry.expiresAt || entry.code !== (code ?? "").trim()) {
    res.status(401).json({ error: "코드가 올바르지 않거나 만료되었습니다." });
    return;
  }
  otpCodes.delete(key);
  const token = randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL);
  audit(req, "auth", "admin.login", "2FA 통과 · 세션 발급");
  res.json({ token });
});

// 이하 라우트는 토큰 필수
adminRouter.use("/admin", (req, res, next) => {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const exp = tokens.get(token);
  if (!exp || Date.now() > exp) {
    res.status(401).json({ error: "관리자 인증이 필요합니다." });
    return;
  }
  next();
});

// ===== 대시보드 메트릭 =====
adminRouter.get("/admin/metrics", (_req: Request, res: Response) => {
  const events = getEvents();
  const now = Date.now();
  const dayMs = 86400_000;
  const today = new Date().toISOString().slice(0, 10);
  const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

  const gens = events.filter((e) => e.kind === "slides");
  const todayGens = gens.filter((e) => dayKey(e.ts) === today);
  const exportsToday = events.filter((e) => e.kind === "export" && dayKey(e.ts) === today);
  const failed = events.filter((e) => !e.ok && dayKey(e.ts) === today);
  const avgMs =
    todayGens.length > 0
      ? Math.round(todayGens.reduce((a, b) => a + b.ms, 0) / todayGens.length)
      : 0;

  // 최근 14일 일별 생성
  const daily: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = dayKey(now - i * dayMs);
    daily.push({ day: d.slice(5), count: gens.filter((e) => dayKey(e.ts) === d).length });
  }

  // 파이프라인 평균 (kind별 평균 ms)
  const avgBy = (kind: string) => {
    const list = events.filter((e) => e.kind === kind && e.ok);
    return list.length ? Math.round(list.reduce((a, b) => a + b.ms, 0) / list.length) : 0;
  };

  const decks = listDeckSummaries();
  res.json({
    kpis: {
      todayGens: todayGens.length,
      failRate: todayGens.length ? Math.round((failed.length / Math.max(1, todayGens.length)) * 100) : 0,
      sharedDecks: decks.length,
      exportsToday: exportsToday.length,
      avgGenMs: avgMs,
    },
    daily,
    pipeline: [
      { name: "아웃라인 생성", ms: avgBy("outline") },
      { name: "슬라이드 생성", ms: avgBy("slides") },
      { name: "AI 수정/재생성", ms: avgBy("edit") },
      { name: "내보내기", ms: avgBy("export") },
    ],
  });
});

// ===== 사용자(협업 참여자) =====
adminRouter.get("/admin/users", (_req: Request, res: Response) => {
  const blocked = getBlocked();
  const presence = listPresence(); // {name, deckId, ts}
  const byName = new Map<string, { name: string; decks: Set<string>; last: number }>();
  for (const p of presence) {
    const cur = byName.get(p.name) ?? { name: p.name, decks: new Set(), last: 0 };
    cur.decks.add(p.deckId);
    cur.last = Math.max(cur.last, p.ts);
    byName.set(p.name, cur);
  }
  res.json({
    users: [...byName.values()]
      .sort((a, b) => b.last - a.last)
      .map((u) => ({
        name: u.name,
        decks: u.decks.size,
        last: u.last,
        blocked: blocked.includes(u.name),
      })),
    blocked,
  });
});

adminRouter.post("/admin/users/block", (req: Request, res: Response) => {
  const { name, blocked } = (req.body ?? {}) as { name?: string; blocked?: boolean };
  if (!name) {
    res.status(400).json({ error: "name이 필요합니다." });
    return;
  }
  const list = getBlocked().filter((n) => n !== name);
  if (blocked) list.push(name);
  setBlocked(list);
  audit(req, "user", blocked ? "user.block" : "user.unblock", name);
  res.json({ ok: true, blocked: list });
});

// ===== 작업 큐 (events 기반 최근 잡) =====
adminRouter.get("/admin/jobs", (_req: Request, res: Response) => {
  const events = getEvents().slice(-60).reverse();
  res.json({
    jobs: events.map((e, i) => ({
      id: `E-${String(events.length - i).padStart(4, "0")}`,
      kind: e.kind,
      meta: e.meta ?? "",
      ms: e.ms,
      ok: e.ok,
      err: e.err ?? "",
      ts: e.ts,
    })),
  });
});

// ===== 오류 로그 =====
adminRouter.get("/admin/errors", (_req: Request, res: Response) => {
  res.json({ errors: getErrors().filter((e) => !e.resolved).sort((a, b) => b.lastAt - a.lastAt) });
});

adminRouter.post("/admin/errors/:id/resolve", (req: Request, res: Response) => {
  resolveError(req.params.id);
  audit(req, "data", "error.resolve", req.params.id);
  res.json({ ok: true });
});

// ===== 감사 로그 =====
adminRouter.get("/admin/audit", (_req: Request, res: Response) => {
  res.json({ logs: getAudit().slice(-500).reverse() });
});

// ===== 공지/배너 =====
adminRouter.get("/admin/banners", (_req: Request, res: Response) => {
  res.json({ banners: getBanners() });
});

adminRouter.post("/admin/banners", (req: Request, res: Response) => {
  const { type, text } = (req.body ?? {}) as { type?: Banner["type"]; text?: string };
  if (!text?.trim()) {
    res.status(400).json({ error: "공지 문구가 필요합니다." });
    return;
  }
  const banner: Banner = {
    id: randomBytes(4).toString("hex"),
    type: type === "warn" || type === "maint" ? type : "info",
    text: text.trim(),
    on: true,
    createdAt: Date.now(),
  };
  setBanners([banner, ...getBanners()]);
  audit(req, "banner", "banner.publish", banner.text.slice(0, 60));
  res.json({ banner });
});

adminRouter.patch("/admin/banners/:id", (req: Request, res: Response) => {
  const { on } = (req.body ?? {}) as { on?: boolean };
  const list = getBanners().map((b) => (b.id === req.params.id ? { ...b, on: !!on } : b));
  setBanners(list);
  audit(req, "banner", on ? "banner.on" : "banner.off", req.params.id);
  res.json({ ok: true });
});

adminRouter.delete("/admin/banners/:id", (req: Request, res: Response) => {
  setBanners(getBanners().filter((b) => b.id !== req.params.id));
  audit(req, "banner", "banner.delete", req.params.id);
  res.json({ ok: true });
});

// ===== 템플릿 관리 =====
adminRouter.get("/admin/templates", (_req: Request, res: Response) => {
  res.json({ templates: getTemplates() });
});

adminRouter.put("/admin/templates", (req: Request, res: Response) => {
  const { templates } = (req.body ?? {}) as { templates?: TemplateMeta[] };
  if (!Array.isArray(templates)) {
    res.status(400).json({ error: "templates 배열이 필요합니다." });
    return;
  }
  setTemplates(templates);
  audit(req, "template", "templates.update", `${templates.length}개 항목`);
  res.json({ ok: true });
});

// ===== 서비스 설정 =====
adminRouter.get("/admin/settings", (_req: Request, res: Response) => {
  res.json({ settings: getSettings() });
});

adminRouter.patch("/admin/settings", (req: Request, res: Response) => {
  const patch = (req.body ?? {}) as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};
  if (typeof patch.signupAllowed === "boolean") allowed.signupAllowed = patch.signupAllowed;
  if (typeof patch.freeDailyLimit === "number")
    allowed.freeDailyLimit = Math.max(1, Math.min(500, patch.freeDailyLimit));
  if (typeof patch.maintenance === "boolean") allowed.maintenance = patch.maintenance;
  if (typeof patch.genModel === "string") allowed.genModel = patch.genModel;
  const next = patchSettings(allowed);
  audit(req, "settings", "settings.update", JSON.stringify(allowed));
  res.json({ settings: next });
});

// ===== 공개 엔드포인트 (사용자 앱) — 인증 불필요 =====
export const publicAppRouter = Router();

/** 활성 배너 (사용자 홈·에디터 상단) */
publicAppRouter.get("/banners", (_req: Request, res: Response) => {
  res.json({ banners: getBanners().filter((b) => b.on) });
});

/** 홈 스토리보드 갤러리 메타 — 비면 클라이언트 기본값 사용 */
publicAppRouter.get("/templates", (_req: Request, res: Response) => {
  res.json({ templates: getTemplates() });
});

/** 클라이언트 주도 작업(내보내기·가져오기) 이벤트 집계 */
publicAppRouter.post("/track", (req: Request, res: Response) => {
  const { kind, ok, ms, meta } = (req.body ?? {}) as {
    kind?: string;
    ok?: boolean;
    ms?: number;
    meta?: string;
  };
  if (kind === "export" || kind === "import") {
    logEvent({
      ts: Date.now(),
      kind,
      ok: ok !== false,
      ms: Math.max(0, Number(ms) || 0),
      meta: String(meta ?? "").slice(0, 80),
    });
  }
  res.json({ ok: true });
});

/** 템플릿 사용 횟수 집계 */
publicAppRouter.post("/templates/:id/use", (req: Request, res: Response) => {
  const list = getTemplates();
  const found = list.find((t) => t.id === req.params.id);
  if (found) {
    found.uses++;
    setTemplates(list);
  }
  res.json({ ok: true });
});
