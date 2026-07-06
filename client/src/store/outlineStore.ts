import { create } from "zustand";
import type { OutlineSlide } from "../engine/schema";
import { DEFAULT_THEME_ID } from "../engine/themes";

export type OutlineStatus = "idle" | "streaming" | "done" | "error";

interface OutlineState {
  deckId: string | null;
  prompt: string;
  slideCount: number;
  themeId: string;
  slides: OutlineSlide[];
  status: OutlineStatus;
  error: string | null;
  begin: (p: {
    deckId: string;
    prompt: string;
    slideCount: number;
    themeId: string;
  }) => void;
  setStatus: (status: OutlineStatus, error?: string | null) => void;
  appendSlide: (slide: OutlineSlide) => void;
  updateSlide: (index: number, patch: Partial<OutlineSlide>) => void;
  reset: () => void;
}

export const useOutlineStore = create<OutlineState>()((set) => ({
  deckId: null,
  prompt: "",
  slideCount: 5,
  themeId: DEFAULT_THEME_ID,
  slides: [],
  status: "idle",
  error: null,
  begin: ({ deckId, prompt, slideCount, themeId }) =>
    set({
      deckId,
      prompt,
      slideCount,
      themeId,
      slides: [],
      status: "idle",
      error: null,
    }),
  setStatus: (status, error = null) => set({ status, error }),
  appendSlide: (slide) =>
    set((s) => ({
      slides: [...s.slides.filter((x) => x.index !== slide.index), slide].sort(
        (a, b) => a.index - b.index,
      ),
    })),
  updateSlide: (index, patch) =>
    set((s) => ({
      slides: s.slides.map((sl) => (sl.index === index ? { ...sl, ...patch } : sl)),
    })),
  reset: () =>
    set({
      deckId: null,
      prompt: "",
      slides: [],
      status: "idle",
      error: null,
    }),
}));
