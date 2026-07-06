import { create } from "zustand";

interface UiState {
  currentSlideIndex: number;
  selectedElementId: string | null;
  setCurrentSlideIndex: (i: number) => void;
  setSelectedElementId: (id: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  currentSlideIndex: 0,
  selectedElementId: null,
  setCurrentSlideIndex: (i) => set({ currentSlideIndex: i, selectedElementId: null }),
  setSelectedElementId: (id) => set({ selectedElementId: id }),
}));
