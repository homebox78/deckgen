// §12 공유·협업 클라이언트 — REST + SSE(EventSource)
import type { Deck, Slide } from "../engine/schema";
import { apiUrl } from "./base";

export interface ShareTokens {
  editToken: string;
  viewToken: string;
}

export interface SharedDeckInfo {
  deck: Deck;
  rev: number;
  role: "edit" | "view";
  deckId: string;
}

export interface CollabPeer {
  clientId: string;
  name: string;
  color: string;
  slideIndex: number;
  cursor?: { x: number; y: number };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `요청 실패 (${res.status})`);
  return json;
}

/** 덱을 서버에 등록/갱신하고 공유 토큰을 발급받는다 */
export function publishDeck(deck: Deck): Promise<ShareTokens & { rev: number }> {
  return postJson("/api/share", { deck });
}

/** 이메일 초대 — Invite Email 템플릿으로 발송 (편집 토큰 = 초대 권한 증명) */
export function sendInvite(
  deckId: string,
  token: string,
  email: string,
  role: "edit" | "view",
  inviterName: string,
): Promise<{ ok: boolean; message?: string }> {
  return postJson("/api/share/invite", { deckId, token, email, role, inviterName });
}

/** 공유 링크 토큰으로 덱+권한 조회 */
export async function fetchShared(token: string): Promise<SharedDeckInfo> {
  const res = await fetch(apiUrl(`/api/share/${encodeURIComponent(token)}`));
  const json = (await res.json()) as SharedDeckInfo & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `조회 실패 (${res.status})`);
  return json;
}

export function pushSlide(
  deckId: string,
  token: string,
  clientId: string,
  slide: Slide,
): Promise<{ rev: number }> {
  return postJson(`/api/collab/${encodeURIComponent(deckId)}/slide`, {
    token,
    clientId,
    slide,
  });
}

export function pushDeck(
  deckId: string,
  token: string,
  clientId: string,
  deck: Deck,
): Promise<{ rev: number }> {
  return postJson(`/api/collab/${encodeURIComponent(deckId)}/deck`, {
    token,
    clientId,
    deck,
  });
}

export function sendPresence(
  deckId: string,
  p: {
    token: string;
    clientId: string;
    name: string;
    color: string;
    slideIndex: number;
    cursor?: { x: number; y: number };
  },
): Promise<{ ok: boolean }> {
  return postJson(`/api/collab/${encodeURIComponent(deckId)}/presence`, p);
}

export interface CollabUpdate {
  kind: "slide" | "deck";
  rev: number;
  origin: string;
  slide?: Slide;
  deck?: Deck;
}

export interface CollabEventHandlers {
  onUpdate: (u: CollabUpdate) => void;
  onPresence: (peers: CollabPeer[]) => void;
  onOpen?: () => void;
  onError?: () => void;
}

/** SSE 구독. 반환값은 해제 함수 (EventSource가 재접속을 자동 처리) */
export function connectEvents(
  deckId: string,
  params: { token: string; clientId: string; name: string; color: string; slideIndex: number },
  h: CollabEventHandlers,
): () => void {
  const qs = new URLSearchParams({
    token: params.token,
    clientId: params.clientId,
    name: params.name,
    color: params.color,
    slideIndex: String(params.slideIndex),
  });
  const es = new EventSource(
    apiUrl(`/api/collab/${encodeURIComponent(deckId)}/events?${qs}`),
  );
  const parse = <T>(e: MessageEvent): T => JSON.parse(e.data as string) as T;
  es.addEventListener("update", (e) => h.onUpdate(parse<CollabUpdate>(e)));
  es.addEventListener("presence", (e) =>
    h.onPresence(parse<{ peers: CollabPeer[] }>(e).peers),
  );
  es.addEventListener("hello", (e) =>
    h.onPresence(parse<{ peers: CollabPeer[] }>(e).peers),
  );
  es.onopen = () => h.onOpen?.();
  es.onerror = () => h.onError?.();
  return () => es.close();
}
