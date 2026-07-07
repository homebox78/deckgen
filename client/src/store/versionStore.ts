// 버전 히스토리 (Demo Act 5) — 덱 스냅샷을 localStorage에 저장/복원 (최근 20개)
import type { Slide } from "../engine/schema";

export interface DeckVersion {
  id: string;
  label: string;
  createdAt: number;
  slides: Slide[];
}

const key = (deckId: string) => `deckgen:versions:${deckId}`;
const MAX = 20;

export function listVersions(deckId: string): DeckVersion[] {
  try {
    return JSON.parse(localStorage.getItem(key(deckId)) ?? "[]") as DeckVersion[];
  } catch {
    return [];
  }
}

export function saveVersion(deckId: string, slides: Slide[], label: string): DeckVersion {
  const v: DeckVersion = {
    id: Math.random().toString(36).slice(2, 10),
    label,
    createdAt: Date.now(),
    slides: JSON.parse(JSON.stringify(slides)) as Slide[],
  };
  const list = [v, ...listVersions(deckId)].slice(0, MAX);
  localStorage.setItem(key(deckId), JSON.stringify(list));
  return v;
}
