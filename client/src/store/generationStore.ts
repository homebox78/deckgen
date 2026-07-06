import { create } from "zustand";

export type SlideGenStatus = "queued" | "generating" | "done" | "failed";

interface GenerationState {
  deckId: string | null;
  active: boolean;
  statuses: SlideGenStatus[];
  error: string | null;
  logs: string[]; // 에이전트 작업 로그 (§6.1)
  start: (deckId: string, count: number) => void;
  markDone: (index: number) => void;
  markFailed: (index: number) => void;
  finish: () => void;
  fail: (error: string) => void;
  addLog: (msg: string) => void;
  clear: () => void;
}

/** done/failed가 아닌 가장 앞 슬라이드를 generating으로 승격 */
function promote(statuses: SlideGenStatus[]): SlideGenStatus[] {
  const next = [...statuses];
  const i = next.findIndex((s) => s === "queued" || s === "generating");
  if (i >= 0) next[i] = "generating";
  return next;
}

export const useGenerationStore = create<GenerationState>()((set) => ({
  deckId: null,
  active: false,
  statuses: [],
  error: null,
  logs: [],
  start: (deckId, count) =>
    set({
      deckId,
      active: true,
      statuses: promote(Array.from({ length: count }, () => "queued" as const)),
      error: null,
      logs: ["아웃라인 확정", "슬라이드 스펙 생성 시작"],
    }),
  markDone: (index) =>
    set((s) => {
      const statuses = [...s.statuses];
      statuses[index] = "done";
      return {
        statuses: promote(statuses),
        logs: [...s.logs, `슬라이드 ${index + 1} 렌더링 완료`],
      };
    }),
  markFailed: (index) =>
    set((s) => {
      const statuses = [...s.statuses];
      statuses[index] = "failed";
      return {
        statuses: promote(statuses),
        logs: [...s.logs, `슬라이드 ${index + 1} 생성 실패`],
      };
    }),
  finish: () =>
    set((s) => ({ active: false, logs: [...s.logs, "생성 완료"] })),
  fail: (error) => set((s) => ({ active: false, error, logs: [...s.logs, "생성 중단"] })),
  addLog: (msg) => set((s) => ({ logs: [...s.logs, msg] })),
  clear: () => set({ deckId: null, active: false, statuses: [], error: null, logs: [] }),
}));
