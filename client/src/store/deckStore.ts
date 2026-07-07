import { create } from "zustand";
import { temporal } from "zundo";
import { useStore } from "zustand";
import type { Deck, Slide, SlideElement } from "../engine/schema";
import { uid } from "../engine/schema";

interface DeckState {
  deck: Deck | null;
  setDeck: (deck: Deck | null) => void;
  setDeckTitle: (title: string) => void;
  setThemeId: (themeId: string) => void;
  replaceSlide: (slideId: string, slide: Slide) => void;
  addSlide: (afterIndex: number) => void;
  duplicateSlide: (slideId: string) => void;
  deleteSlide: (slideId: string) => void;
  addElement: (slideId: string, element: SlideElement) => void;
  removeElement: (slideId: string, elementId: string) => void;
  updateElement: (
    slideId: string,
    elementId: string,
    patch: Partial<SlideElement>,
  ) => void;
  /** 요소 1개를 여러 요소로 치환 (차트 분해 등) — 같은 z 위치에 삽입 */
  explodeElement: (slideId: string, elementId: string, parts: SlideElement[]) => void;
  /** z-order 이동 — elements 배열 순서 = z-order (§3) */
  reorderElement: (
    slideId: string,
    elementId: string,
    dir: "front" | "forward" | "backward" | "back",
  ) => void;
}

function touch(deck: Deck): Deck {
  return { ...deck, updatedAt: Date.now() };
}

function mapSlides(deck: Deck, fn: (slides: Slide[]) => Slide[]): Deck {
  return touch({ ...deck, slides: fn(deck.slides) });
}

function cloneSlideWithNewIds(slide: Slide): Slide {
  return {
    ...slide,
    id: uid(),
    elements: slide.elements.map((el) => ({ ...el, id: uid() })),
  };
}

export const useDeckStore = create<DeckState>()(
  temporal(
    (set) => ({
      deck: null,
      setDeck: (deck) => set({ deck }),
      setDeckTitle: (title) =>
        set((s) => (s.deck ? { deck: touch({ ...s.deck, title }) } : s)),
      setThemeId: (themeId) =>
        set((s) => (s.deck ? { deck: touch({ ...s.deck, themeId }) } : s)),
      replaceSlide: (slideId, slide) =>
        set((s) =>
          s.deck
            ? {
                deck: mapSlides(s.deck, (slides) =>
                  slides.map((sl) => (sl.id === slideId ? slide : sl)),
                ),
              }
            : s,
        ),
      addSlide: (afterIndex) =>
        set((s) => {
          if (!s.deck) return s;
          const blank: Slide = { id: uid(), layout: "title-bullets", elements: [] };
          const slides = [...s.deck.slides];
          slides.splice(afterIndex + 1, 0, blank);
          return { deck: mapSlides(s.deck, () => slides) };
        }),
      duplicateSlide: (slideId) =>
        set((s) => {
          if (!s.deck) return s;
          const i = s.deck.slides.findIndex((sl) => sl.id === slideId);
          if (i < 0) return s;
          const slides = [...s.deck.slides];
          slides.splice(i + 1, 0, cloneSlideWithNewIds(slides[i]));
          return { deck: mapSlides(s.deck, () => slides) };
        }),
      deleteSlide: (slideId) =>
        set((s) => {
          if (!s.deck || s.deck.slides.length <= 1) return s;
          return {
            deck: mapSlides(s.deck, (slides) =>
              slides.filter((sl) => sl.id !== slideId),
            ),
          };
        }),
      addElement: (slideId, element) =>
        set((s) =>
          s.deck
            ? {
                deck: mapSlides(s.deck, (slides) =>
                  slides.map((sl) =>
                    sl.id === slideId
                      ? { ...sl, elements: [...sl.elements, element] }
                      : sl,
                  ),
                ),
              }
            : s,
        ),
      removeElement: (slideId, elementId) =>
        set((s) =>
          s.deck
            ? {
                deck: mapSlides(s.deck, (slides) =>
                  slides.map((sl) =>
                    sl.id === slideId
                      ? {
                          ...sl,
                          elements: sl.elements.filter((el) => el.id !== elementId),
                        }
                      : sl,
                  ),
                ),
              }
            : s,
        ),
      updateElement: (slideId, elementId, patch) =>
        set((s) =>
          s.deck
            ? {
                deck: mapSlides(s.deck, (slides) =>
                  slides.map((sl) =>
                    sl.id !== slideId
                      ? sl
                      : {
                          ...sl,
                          elements: sl.elements.map((el) =>
                            el.id === elementId
                              ? ({ ...el, ...patch } as SlideElement)
                              : el,
                          ),
                        },
                  ),
                ),
              }
            : s,
        ),
      reorderElement: (slideId, elementId, dir) =>
        set((s) =>
          s.deck
            ? {
                deck: mapSlides(s.deck, (slides) =>
                  slides.map((sl) => {
                    if (sl.id !== slideId) return sl;
                    const i = sl.elements.findIndex((el) => el.id === elementId);
                    if (i < 0) return sl;
                    const elements = [...sl.elements];
                    const [el] = elements.splice(i, 1);
                    const j =
                      dir === "front"
                        ? elements.length
                        : dir === "back"
                          ? 0
                          : dir === "forward"
                            ? Math.min(elements.length, i + 1)
                            : Math.max(0, i - 1);
                    elements.splice(j, 0, el);
                    return { ...sl, elements };
                  }),
                ),
              }
            : s,
        ),
      explodeElement: (slideId, elementId, parts) =>
        set((s) =>
          s.deck
            ? {
                deck: mapSlides(s.deck, (slides) =>
                  slides.map((sl) => {
                    if (sl.id !== slideId) return sl;
                    const i = sl.elements.findIndex((el) => el.id === elementId);
                    if (i < 0) return sl;
                    const elements = [...sl.elements];
                    elements.splice(i, 1, ...parts);
                    return { ...sl, elements };
                  }),
                ),
              }
            : s,
        ),
    }),
    {
      // §7.3 undo/redo는 slides 변경만 추적 (드래그 중간 상태는 object:modified에만 커밋)
      partialize: (state) => ({ deck: state.deck }),
      equality: (a, b) => a.deck?.slides === b.deck?.slides,
      limit: 100,
    },
  ),
);

/** undo/redo 상태를 리액티브하게 구독 */
export function useTemporal() {
  return useStore(useDeckStore.temporal);
}

export function clearHistory(): void {
  useDeckStore.temporal.getState().clear();
}
