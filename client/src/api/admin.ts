// 관리자 콘솔 API (§14) — Bearer 토큰은 sessionStorage에 보관
import { apiUrl } from "./base";

const TOKEN_KEY = "deckgen:admin-token";

export function getAdminToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function setAdminToken(token: string): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAdminToken()}`,
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 401) setAdminToken("");
    throw new Error(json.error ?? `요청 실패 (${res.status})`);
  }
  return json;
}

// ── 인증 ──
export async function adminLogin(
  email: string,
  password: string,
): Promise<{ token?: string; otpRequired?: boolean; message?: string }> {
  const res = await fetch(apiUrl("/api/admin/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as { token?: string; otpRequired?: boolean; error?: string; message?: string };
  if (!res.ok) throw new Error(json.error ?? "로그인 실패");
  if (json.token) setAdminToken(json.token);
  return json;
}

export async function adminVerify(email: string, code: string): Promise<void> {
  const res = await fetch(apiUrl("/api/admin/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  const json = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !json.token) throw new Error(json.error ?? "인증 실패");
  setAdminToken(json.token);
}

// ── 데이터 ──
export interface AdminMetrics {
  kpis: { todayGens: number; failRate: number; sharedDecks: number; exportsToday: number; avgGenMs: number };
  themeDist?: { themeId: string; count: number }[];
  daily: { day: string; count: number }[];
  pipeline: { name: string; ms: number }[];
}

export interface AdminUser {
  name: string;
  decks: number;
  last: number;
  blocked: boolean;
  gens?: number; // 이번 달 생성 — 백엔드가 제공하면 사용(프레즌스 기반 응답엔 없음)
  email?: string; // 백엔드가 실제 이메일을 주면 사용(현재 프레즌스 응답엔 없음)
}

export interface AdminJob {
  id: string;
  kind: string;
  meta: string;
  ms: number;
  ok: boolean;
  err: string;
  ts: number;
  user?: string; // 잡을 유발한 사용자 — 이벤트 로그엔 없을 수 있음
  status?: "running" | "queued" | "done" | "failed"; // 있으면 실행/대기 집계에 사용
}

export interface AdminError {
  id: string;
  type: string;
  msg: string;
  count: number;
  lastAt: number;
  severity?: "HIGH" | "MED" | "LOW"; // 있으면 사용, 없으면 count로 추정
  hint?: string; // 있으면 사용, 없으면 메시지 기반
}

export interface AdminAudit {
  ts: number;
  actor: string;
  cat: string;
  action: string;
  detail: string;
  ip: string;
}

export interface AdminBanner {
  id: string;
  type: "info" | "warn" | "maint";
  text: string;
  on: boolean;
  createdAt: number;
}

export interface AdminTemplate {
  id: string;
  name: string;
  on: boolean;
  pro: boolean;
  uses: number;
}

export interface AdminSettings {
  signupAllowed: boolean;
  freeDailyLimit: number;
  maintenance: boolean;
  genModel: string;
}

export interface AdminDeck {
  id: string;
  title: string;
  slides: number;
  rev: number;
  updatedAt: number;
}

export const adminApi = {
  metrics: () => req<AdminMetrics>("/api/admin/metrics"),
  users: () => req<{ users: AdminUser[] }>("/api/admin/users"),
  decks: () => req<{ decks: AdminDeck[] }>("/api/admin/decks"),
  block: (name: string, blocked: boolean) =>
    req("/api/admin/users/block", { method: "POST", body: JSON.stringify({ name, blocked }) }),
  jobs: () => req<{ jobs: AdminJob[] }>("/api/admin/jobs"),
  errors: () => req<{ errors: AdminError[] }>("/api/admin/errors"),
  resolveError: (id: string) => req(`/api/admin/errors/${id}/resolve`, { method: "POST" }),
  audit: () => req<{ logs: AdminAudit[] }>("/api/admin/audit"),
  banners: () => req<{ banners: AdminBanner[] }>("/api/admin/banners"),
  addBanner: (type: string, text: string) =>
    req<{ banner: AdminBanner }>("/api/admin/banners", { method: "POST", body: JSON.stringify({ type, text }) }),
  toggleBanner: (id: string, on: boolean) =>
    req(`/api/admin/banners/${id}`, { method: "PATCH", body: JSON.stringify({ on }) }),
  deleteBanner: (id: string) => req(`/api/admin/banners/${id}`, { method: "DELETE" }),
  templates: () => req<{ templates: AdminTemplate[] }>("/api/admin/templates"),
  saveTemplates: (templates: AdminTemplate[]) =>
    req("/api/admin/templates", { method: "PUT", body: JSON.stringify({ templates }) }),
  settings: () => req<{ settings: AdminSettings }>("/api/admin/settings"),
  patchSettings: (patch: Partial<AdminSettings>) =>
    req<{ settings: AdminSettings }>("/api/admin/settings", { method: "PATCH", body: JSON.stringify(patch) }),
};
