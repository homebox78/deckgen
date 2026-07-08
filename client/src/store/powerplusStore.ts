// powerPlus 로그인 세션 — 토큰/이메일을 localStorage에 보관(계정 없는 DeckGen MVP와 별개).
import { useSyncExternalStore } from "react";

const TKEY = "deckgen:pp:token";
const EKEY = "deckgen:pp:email";
const listeners = new Set<() => void>();

interface PPAuth {
  token: string | null;
  email: string | null;
}
let snapshot: PPAuth = read();

function read(): PPAuth {
  return { token: localStorage.getItem(TKEY), email: localStorage.getItem(EKEY) };
}
function emit(): void {
  snapshot = read();
  listeners.forEach((l) => l());
}

export function getPPToken(): string | null {
  return localStorage.getItem(TKEY);
}
export function setPPAuth(token: string, email: string): void {
  localStorage.setItem(TKEY, token);
  localStorage.setItem(EKEY, email);
  emit();
}
export function clearPPAuth(): void {
  localStorage.removeItem(TKEY);
  localStorage.removeItem(EKEY);
  emit();
}

export function usePPAuth(): PPAuth {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}
