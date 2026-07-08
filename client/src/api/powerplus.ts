// powerPlus(PPT 자산 라이브러리) 연동 — 기존 이메일 OTP 인증을 그대로 재사용.
// 운영: DeckGen(hom2box.com/deckGen)과 powerPlus(hom2box.com/powerPlus)는 동일 출처 → CORS 불필요.
// dev: vite 프록시(/powerPlus → hom2box.com)로 동일출처처럼 호출.
const PP = "/powerPlus"; // 앞 슬래시 = 출처 루트 기준(deckGen base와 무관)

export interface PPAsset {
  id: string;
  name: string | null;
  category: string;
  tags: string[];
  tags_ko: string[];
  tags_en: string[];
  image_url: string | null;
  thumb_url: string | null;
  slide_url: string | null;
  views?: number;
  fav_count?: number;
}

export interface PPListResult {
  data: PPAsset[];
  total: number;
  page?: number;
  limit?: number;
}

/** hom2box.com 절대 URL → 동일출처 상대경로(/powerPlus/…)로. dev 프록시·운영 동일출처 모두 안전 */
export function ppRelative(url: string | null): string {
  if (!url) return "";
  return url.replace(/^https?:\/\/[^/]+\/powerPlus/i, PP);
}

async function ppJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(PP + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
  return data as T;
}

/** 인증코드 요청 — POST /api/auth/request { email } */
export async function ppRequestCode(email: string): Promise<{ ok: boolean; dev_code?: string }> {
  return ppJson("/api/auth/request", { method: "POST", body: JSON.stringify({ email }) });
}

/** 인증코드 검증 → 토큰 발급 — POST /api/auth/verify { email, code } */
export async function ppVerifyCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; token: string; email: string; expires_at: string }> {
  return ppJson("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

/** 토큰 유효성 — GET /api/auth/me (Bearer) */
export async function ppMe(token: string): Promise<{ email: string; isAdmin?: boolean }> {
  return ppJson("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
}

/** 공개(인증 불필요) 자산 검색 — GET /api/public/assets. DeckGen 내부에서 로그인 없이 사용 */
export async function ppPublicAssets(
  opts: { category?: string; q?: string; page?: number; sort?: string; limit?: number } = {},
): Promise<PPListResult> {
  const p = new URLSearchParams();
  if (opts.category && opts.category !== "all") p.set("category", opts.category);
  if (opts.q) p.set("q", opts.q);
  p.set("page", String(opts.page ?? 1));
  p.set("limit", String(opts.limit ?? 40));
  p.set("sort", opts.sort ?? "latest");
  return ppJson(`/api/public/assets?${p.toString()}`);
}

/** 자산 검색/목록 — GET /api/assets?category=&q=&page=&sort= (Bearer) */
export async function ppAssets(
  token: string,
  opts: { category?: string; q?: string; page?: number; sort?: string; limit?: number } = {},
): Promise<PPListResult> {
  const p = new URLSearchParams();
  if (opts.category && opts.category !== "all") p.set("category", opts.category);
  if (opts.q) p.set("q", opts.q);
  p.set("page", String(opts.page ?? 1));
  p.set("limit", String(opts.limit ?? 40));
  p.set("sort", opts.sort ?? "latest");
  return ppJson(`/api/assets?${p.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
}

/** 삽입 사용 기록(선택) — POST /api/usage (Bearer). 실패해도 무시 */
export function ppRecordUsage(token: string, assetId: string): void {
  fetch(PP + "/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ asset_id: assetId }),
  }).catch(() => {});
}

/**
 * 자산 원본 이미지를 dataURL로 변환 + 자연 크기 반환.
 * DeckGen ImageElement는 dataURL을 쓰므로 삽입 전에 변환한다(동일출처라 CORS 없음).
 */
export async function ppImageToDataURL(
  imageUrl: string,
): Promise<{ dataUrl: string; w: number; h: number }> {
  const rel = ppRelative(imageUrl);
  const res = await fetch(rel);
  if (!res.ok) throw new Error(`이미지를 불러오지 못했어요 (${res.status})`);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("이미지 변환 실패"));
    r.readAsDataURL(blob);
  });
  const { w, h } = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 720, h: img.naturalHeight || 450 });
    img.onerror = () => resolve({ w: 720, h: 450 });
    img.src = dataUrl;
  });
  return { dataUrl, w, h };
}
