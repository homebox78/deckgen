// 이메일 인증 (OTP 6자리) — 발송/확인. MVP: 인메모리 코드 저장 (10분 TTL)
import { Router } from "express";
import type { Request, Response } from "express";
import { mailConfigured, sendMail, verificationEmailHtml } from "../mail.js";

export const authRouter = Router();

interface CodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

const codes = new Map<string, CodeEntry>();
const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

// 발송 rate limit: 이메일당 60초 1회
const lastSent = new Map<string, number>();

function normEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

// POST /api/auth/send-code { email }
authRouter.post("/auth/send-code", async (req: Request, res: Response) => {
  const email = normEmail((req.body as { email?: unknown })?.email);
  if (!email) {
    res.status(400).json({ error: "유효한 이메일이 필요합니다." });
    return;
  }
  if (!mailConfigured()) {
    res.status(503).json({ error: "메일 발송이 설정되지 않았습니다 (config.php smtp_*)." });
    return;
  }
  const last = lastSent.get(email) ?? 0;
  if (Date.now() - last < 60_000) {
    res.status(429).json({ error: "잠시 후 다시 요청해주세요 (1분 간격)." });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(email, { code, expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 });
  lastSent.set(email, Date.now());
  try {
    await sendMail(email, "[DeckGen] 이메일 인증 코드", verificationEmailHtml(code));
    res.json({ ok: true, message: "인증 코드를 발송했습니다. 메일함을 확인해주세요." });
  } catch (e) {
    codes.delete(email);
    console.warn("[auth] 메일 발송 실패:", e);
    res.status(502).json({ error: "메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요." });
  }
});

// POST /api/auth/verify { email, code }
authRouter.post("/auth/verify", (req: Request, res: Response) => {
  const body = req.body as { email?: unknown; code?: unknown };
  const email = normEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!email || !/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "이메일과 6자리 코드가 필요합니다." });
    return;
  }
  const entry = codes.get(email);
  if (!entry || Date.now() > entry.expiresAt) {
    codes.delete(email);
    res.status(400).json({ error: "코드가 만료되었습니다. 다시 요청해주세요." });
    return;
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    codes.delete(email);
    res.status(429).json({ error: "시도 횟수를 초과했습니다. 다시 요청해주세요." });
    return;
  }
  entry.attempts++;
  if (entry.code !== code) {
    res.status(400).json({ error: "코드가 일치하지 않습니다." });
    return;
  }
  codes.delete(email);
  res.json({ ok: true, email, verifiedAt: Date.now() });
});
