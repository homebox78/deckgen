import { create } from "zustand";
import type { DeckAspect, OutlineSlide } from "../engine/schema";
import { DEFAULT_THEME_ID } from "../engine/themes";

export type OutlineStatus = "idle" | "streaming" | "done" | "error";

interface OutlineState {
  deckId: string | null;
  prompt: string;
  slideCount: number;
  themeId: string;
  aspect: DeckAspect;
  slides: OutlineSlide[];
  status: OutlineStatus;
  error: string | null;
  begin: (p: {
    deckId: string;
    prompt: string;
    slideCount: number;
    themeId: string;
    aspect?: DeckAspect;
    slides?: OutlineSlide[]; // PPTX Reference 등 프리필
    status?: OutlineStatus;
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
  aspect: "16:9",
  slides: [],
  status: "idle",
  error: null,
  begin: ({ deckId, prompt, slideCount, themeId, aspect = "16:9", slides = [], status = "idle" }) =>
    set({
      deckId,
      prompt,
      slideCount,
      themeId,
      aspect,
      slides,
      status,
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
