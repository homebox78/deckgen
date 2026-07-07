// 에디터 알림 — 댓글/멘션/협업 활동. 덱별 localStorage + useSyncExternalStore.
import { useSyncExternalStore } from "react";

export interface Notif {
  id: string;
  who: string; // 작성자 이름
  color: string; // 아바타 색
  text: string; // 본문
  slideIndex: number; // 클릭 시 점프할 슬라이드
  at: number;
  read: boolean;
}

const KEY = "deckgen:notifs:";
const listeners = new Set<() => void>();
const cache = new Map<string, Notif[]>(); // 안정 스냅샷 (무한루프 방지)

function read(deckId: string): Notif[] {
  try {
    const raw = localStorage.getItem(KEY + deckId);
    return raw ? (JSON.parse(raw) as Notif[]) : [];
  } catch {
    return [];
  }
}
function write(deckId: string, list: Notif[]): void {
  const trimmed = list.slice(0, 50);
  cache.set(deckId, trimmed);
  try {
    localStorage.setItem(KEY + deckId, JSON.stringify(trimmed));
  } catch {
    /* 무시 */
  }
  listeners.forEach((l) => l());
}

function snapshot(deckId: string): Notif[] {
  if (!cache.has(deckId)) cache.set(deckId, read(deckId));
  return cache.get(deckId)!;
}

export function pushNotif(deckId: string, n: Omit<Notif, "id" | "at" | "read">): Notif {
  const notif: Notif = {
    ...n,
    id: crypto.randomUUID().slice(0, 8),
    at: Date.now(),
    read: false,
  };
  write(deckId, [notif, ...snapshot(deckId)]);
  return notif;
}
export function markAllRead(deckId: string): void {
  write(deckId, snapshot(deckId).map((n) => ({ ...n, read: true })));
}
export function markRead(deckId: string, id: string): void {
  write(deckId, snapshot(deckId).map((n) => (n.id === id ? { ...n, read: true } : n)));
}

export function useNotifs(deckId: string): Notif[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot(deckId),
  );
}
