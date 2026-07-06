import { create } from "zustand";

interface UiState {
  currentSlideIndex: number;
  selectedElementId: string | null;
  zoom: number; // 캔버스 실제 줌 배율 (1 = 100%)
  setCurrentSlideIndex: (i: number) => void;
  setSelectedElementId: (id: string | null) => void;
  setZoom: (z: number) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  currentSlideIndex: 0,
  selectedElementId: null,
  zoom: 1,
  setCurrentSlideIndex: (i) => set({ currentSlideIndex: i, selectedElementId: null }),
  setSelectedElementId: (id) => set({ selectedElementId: id }),
  setZoom: (zoom) => set({ zoom }),
}));
