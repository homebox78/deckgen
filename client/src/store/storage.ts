// localStorage 저장 (MVP: 클라우드/DB 없음)
import type { Deck } from "../engine/schema";

const DECK_PREFIX = "deckgen:deck:";

export interface DeckSummary {
  id: string;
  title: string;
  themeId: string;
  updatedAt: number;
  slideCount: number;
  thumbnail?: string;
}

export function saveDeck(deck: Deck): void {
  try {
    localStorage.setItem(DECK_PREFIX + deck.id, JSON.stringify(deck));
  } catch (e) {
    console.warn("[storage] 덱 저장 실패", e);
  }
}

export function loadDeck(id: string): Deck | null {
  const raw = localStorage.getItem(DECK_PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Deck;
  } catch {
    return null;
  }
}

export function deleteDeck(id: string): void {
  localStorage.removeItem(DECK_PREFIX + id);
  localStorage.removeItem(thumbKey(id));
}

function thumbKey(id: string): string {
  return `deckgen:thumb:${id}`;
}

export function saveDeckThumbnail(id: string, dataUrl: string): void {
  try {
    localStorage.setItem(thumbKey(id), dataUrl);
  } catch {
    /* 용량 초과 시 썸네일은 포기 */
  }
}

export function listDecks(): DeckSummary[] {
  const out: DeckSummary[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(DECK_PREFIX)) continue;
    try {
      const deck = JSON.parse(localStorage.getItem(key)!) as Deck;
      out.push({
        id: deck.id,
        title: deck.title,
        themeId: deck.themeId,
        updatedAt: deck.updatedAt,
        slideCount: deck.slides.length,
        thumbnail: localStorage.getItem(thumbKey(deck.id)) ?? undefined,
      });
    } catch {
      /* 손상된 항목 무시 */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
