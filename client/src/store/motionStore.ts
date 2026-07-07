// 슬라이드 모션(요소 등장 애니) 설정 — 덱별 localStorage
export type MotionEffect = "fade" | "rise" | "pop";

export interface MotionConfig {
  effect: MotionEffect;
  stagger: number; // ms (트랙 간 지연)
  tracks: { title: boolean; body: boolean; aux: boolean };
}

const KEY = "deckgen:motion:";
const DEFAULT: MotionConfig = {
  effect: "rise",
  stagger: 200,
  tracks: { title: true, body: true, aux: true },
};

export function getMotion(deckId: string): MotionConfig {
  try {
    const raw = localStorage.getItem(KEY + deckId);
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as MotionConfig) };
  } catch {
    /* 무시 */
  }
  return { ...DEFAULT };
}

export function setMotion(deckId: string, cfg: MotionConfig): void {
  try {
    localStorage.setItem(KEY + deckId, JSON.stringify(cfg));
  } catch {
    /* 무시 */
  }
}

export const MOTION_EFFECTS: { key: MotionEffect; label: string }[] = [
  { key: "fade", label: "페이드" },
  { key: "rise", label: "떠오름" },
  { key: "pop", label: "팝" },
];
