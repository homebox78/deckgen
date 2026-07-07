// 내 템플릿 — 현재 덱을 재사용 템플릿으로 저장 (localStorage, useSyncExternalStore)
import { useSyncExternalStore } from "react";

export interface SavedTemplate {
  id: string;
  name: string;
  coverTitle: string;
  meta: string; // "5장 · Clean Light · 나만"
  prompt: string;
  count: number;
  themeId: string;
  scope: "me" | "ws";
}

const KEY = "deckgen:savedTemplates";
const listeners = new Set<() => void>();
let cache: SavedTemplate[] | null = null;

function read(): SavedTemplate[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedTemplate[];
  } catch {
    cache = [];
  }
  return cache;
}
function write(list: SavedTemplate[]): void {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 무시 */
  }
  listeners.forEach((l) => l());
}

export function addSavedTemplate(t: Omit<SavedTemplate, "id">): SavedTemplate {
  const tpl: SavedTemplate = { ...t, id: "tpl" + crypto.randomUUID().slice(0, 8) };
  write([tpl, ...read()]);
  return tpl;
}
export function removeSavedTemplate(id: string): void {
  write(read().filter((t) => t.id !== id));
}
export function useSavedTemplates(): SavedTemplate[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
  );
}
