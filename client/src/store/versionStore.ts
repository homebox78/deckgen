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

function isQuota(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

/**
 * 현재 슬라이드를 버전으로 저장. localStorage 용량 초과 시 **가장 오래된 버전부터
 * 밀어내며 재시도**하고, 새 스냅샷 하나조차 안 들어가면 null을 반환한다(호출부가 사용자에게 안내).
 * 슬라이드에 이미지 dataURL이 많으면 스냅샷이 커져 쉽게 초과되므로 조용히 throw하지 않는 게 핵심.
 */
export function saveVersion(deckId: string, slides: Slide[], label: string): DeckVersion | null {
  const v: DeckVersion = {
    id: Math.random().toString(36).slice(2, 10),
    label,
    createdAt: Date.now(),
    slides: JSON.parse(JSON.stringify(slides)) as Slide[],
  };
  let list = [v, ...listVersions(deckId)].slice(0, MAX);
  // newest-first: 초과 시 뒤(가장 오래된)부터 하나씩 버리며 재시도
  while (list.length > 0) {
    try {
      localStorage.setItem(key(deckId), JSON.stringify(list));
      return v;
    } catch (e) {
      if (!isQuota(e)) throw e;
      if (list.length === 1) return null; // 새 스냅샷 하나도 못 담음 → 실패 신호
      list = list.slice(0, list.length - 1); // 가장 오래된 버전 밀어내고 재시도
    }
  }
  return null;
}
