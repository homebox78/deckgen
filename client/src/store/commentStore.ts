// 댓글 (Demo Act 6) — 슬라이드별 댓글/답글. localStorage 기반 (계정 없는 MVP).
import { useSyncExternalStore } from "react";

export interface Reply {
  id: string;
  author: string;
  text: string;
  ts: number;
}
export interface Comment {
  id: string;
  slideId: string;
  author: string;
  text: string;
  ts: number;
  resolved: boolean;
  replies: Reply[];
  x?: number; // 핀 위치 (슬라이드 좌표, 없으면 핀 없는 댓글)
  y?: number;
}

const key = (deckId: string) => `deckgen:comments:${deckId}`;
const listeners = new Set<() => void>();
const snapshots = new Map<string, Comment[]>(); // useSyncExternalStore용 안정 스냅샷

function read(deckId: string): Comment[] {
  if (snapshots.has(deckId)) return snapshots.get(deckId)!;
  let list: Comment[];
  try {
    list = JSON.parse(localStorage.getItem(key(deckId)) ?? "[]") as Comment[];
  } catch {
    list = [];
  }
  snapshots.set(deckId, list);
  return list;
}
function write(deckId: string, list: Comment[]): void {
  snapshots.set(deckId, list);
  localStorage.setItem(key(deckId), JSON.stringify(list));
  listeners.forEach((l) => l());
}

const rid = () => Math.random().toString(36).slice(2, 10);

export function addComment(
  deckId: string,
  slideId: string,
  author: string,
  text: string,
  pos?: { x: number; y: number },
): void {
  write(deckId, [
    ...read(deckId),
    { id: rid(), slideId, author, text, ts: Date.now(), resolved: false, replies: [], x: pos?.x, y: pos?.y },
  ]);
}
export function addReply(deckId: string, commentId: string, author: string, text: string): void {
  write(
    deckId,
    read(deckId).map((c) =>
      c.id === commentId ? { ...c, replies: [...c.replies, { id: rid(), author, text, ts: Date.now() }] } : c,
    ),
  );
}
export function toggleResolve(deckId: string, commentId: string): void {
  write(deckId, read(deckId).map((c) => (c.id === commentId ? { ...c, resolved: !c.resolved } : c)));
}
export function deleteComment(deckId: string, commentId: string): void {
  write(deckId, read(deckId).filter((c) => c.id !== commentId));
}
// 핀 위치 이동 (드래그)
export function moveComment(deckId: string, commentId: string, x: number, y: number): void {
  write(deckId, read(deckId).map((c) => (c.id === commentId ? { ...c, x, y } : c)));
}

export function useComments(deckId: string): Comment[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(deckId),
  );
}
