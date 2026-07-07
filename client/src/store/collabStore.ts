import { create } from "zustand";
import type { CollabPeer } from "../api/collab";
import { uid } from "../engine/schema";

export type CollabRole = "edit" | "view";

export interface CollabSession {
  token: string;
  role: CollabRole;
  isGuest: boolean; // 공유 링크로 들어온 참여자 (로컬 자동 저장 안 함)
}

// ===== 세션/신원 (localStorage · sessionStorage) =====

const GUEST_NAME_KEY = "deckgen:guest-name";
const CLIENT_ID_KEY = "deckgen:client-id";

/** 탭 단위 클라이언트 ID (에코 억제·프레즌스 식별) */
export const CLIENT_ID: string = (() => {
  const hit = sessionStorage.getItem(CLIENT_ID_KEY);
  if (hit) return hit;
  const v = uid() + uid();
  sessionStorage.setItem(CLIENT_ID_KEY, v);
  return v;
})();

const PRESENCE_COLORS = ["#0FA968", "#E8853D", "#3B82F6", "#E5484D", "#8B5CF6", "#0EA5E9"];

export const MY_COLOR: string = (() => {
  let h = 0;
  for (let i = 0; i < CLIENT_ID.length; i++) h = (h * 31 + CLIENT_ID.charCodeAt(i)) | 0;
  return PRESENCE_COLORS[Math.abs(h) % PRESENCE_COLORS.length];
})();

export function getGuestName(): string {
  return localStorage.getItem(GUEST_NAME_KEY) ?? "";
}

export function setGuestName(name: string): void {
  localStorage.setItem(GUEST_NAME_KEY, name);
}

/** 소유자 공유 토큰 (localStorage — 공유한 PC에 보관) */
export function saveShareTokens(
  deckId: string,
  tokens: { editToken: string; viewToken: string },
): void {
  localStorage.setItem(`deckgen:share:${deckId}`, JSON.stringify(tokens));
}

export function getShareTokens(
  deckId: string,
): { editToken: string; viewToken: string } | null {
  const raw = localStorage.getItem(`deckgen:share:${deckId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { editToken: string; viewToken: string };
  } catch {
    return null;
  }
}

/** 게스트 참여 세션 (sessionStorage — 탭 단위, 새로고침 유지) */
export function saveGuestSession(deckId: string, sess: CollabSession): void {
  sessionStorage.setItem(`deckgen:collab:${deckId}`, JSON.stringify(sess));
}

/** 이 덱에서 활성화할 협업 세션 — 게스트 세션 우선, 없으면 소유자 공유 토큰 */
export function getCollabSession(deckId: string): CollabSession | null {
  const guest = sessionStorage.getItem(`deckgen:collab:${deckId}`);
  if (guest) {
    try {
      return JSON.parse(guest) as CollabSession;
    } catch {
      /* fallthrough */
    }
  }
  const tokens = getShareTokens(deckId);
  if (tokens) return { token: tokens.editToken, role: "edit", isGuest: false };
  return null;
}

// ===== 런타임 협업 상태 =====

interface CollabState {
  deckId: string | null;
  role: CollabRole | null;
  isGuest: boolean;
  connected: boolean;
  peers: CollabPeer[]; // 나를 제외한 참여자
  sessionVersion: number; // 공유 시작 직후 sync 훅 재실행 트리거
  begin: (p: { deckId: string; role: CollabRole; isGuest: boolean }) => void;
  end: () => void;
  setConnected: (b: boolean) => void;
  setPeers: (peers: CollabPeer[]) => void;
  bumpSession: () => void;
}

export const useCollabStore = create<CollabState>()((set) => ({
  deckId: null,
  role: null,
  isGuest: false,
  connected: false,
  peers: [],
  sessionVersion: 0,
  begin: ({ deckId, role, isGuest }) =>
    set({ deckId, role, isGuest, connected: false, peers: [] }),
  end: () => set({ deckId: null, role: null, isGuest: false, connected: false, peers: [] }),
  setConnected: (connected) => set({ connected }),
  setPeers: (peers) =>
    set({ peers: peers.filter((p) => p.clientId !== CLIENT_ID) }),
  bumpSession: () => set((s) => ({ sessionVersion: s.sessionVersion + 1 })),
}));
