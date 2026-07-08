// 익명(Private) 모드 — 덱별 토글. 켜면 댓글/피드백 작성자가 '익명'으로 기록돼 솔직한 피드백을 유도.
// (Miro의 "공개 전까지 나만 보기"는 사용자별 레이어가 필요 → 2차. 여기서는 익명 작성 MVP.)
import { useSyncExternalStore } from "react";

const key = (deckId: string) => `deckgen:anon:${deckId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, boolean>();

function read(deckId: string): boolean {
  if (cache.has(deckId)) return cache.get(deckId)!;
  const v = localStorage.getItem(key(deckId)) === "1";
  cache.set(deckId, v);
  return v;
}

export function getAnon(deckId: string): boolean {
  return read(deckId);
}
export function setAnon(deckId: string, on: boolean): void {
  cache.set(deckId, on);
  localStorage.setItem(key(deckId), on ? "1" : "0");
  listeners.forEach((l) => l());
}
export function useAnon(deckId: string): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(deckId),
  );
}
