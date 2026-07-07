// 아웃라인 → 슬라이드 생성 오케스트레이션 (§4.1 [생성] 단계)
import { composeSlide } from "../engine/layout";
import type { Deck } from "../engine/schema";
import { uid } from "../engine/schema";
import { getTheme } from "../engine/themes";
import { clearHistory, useDeckStore } from "../store/deckStore";
import { useGenerationStore } from "../store/generationStore";
import { useOutlineStore } from "../store/outlineStore";
import { streamSlides } from "./client";

/** 플레이스홀더 덱을 만들어 store에 넣고 스트리밍 생성을 시작한다. 반환값은 deckId */
export function beginSlideGeneration(): string | null {
  const o = useOutlineStore.getState();
  if (!o.deckId || o.slides.length === 0) return null;

  const theme = getTheme(o.themeId);
  const aspect = o.aspect;
  const now = Date.now();
  const deck: Deck = {
    id: o.deckId,
    title: o.slides[0]?.title.trim() || o.prompt.slice(0, 40),
    themeId: o.themeId,
    aspect,
    slides: o.slides.map(() => ({
      id: uid(),
      layout: "title-bullets" as const,
      elements: [],
    })),
    createdAt: now,
    updatedAt: now,
  };
  useDeckStore.getState().setDeck(deck);
  clearHistory();
  useGenerationStore.getState().start(deck.id, o.slides.length);

  void streamSlides(
    { outline: o.slides, themeId: o.themeId, format: aspect },
    {
      onSpec: (spec) => {
        const st = useDeckStore.getState();
        const target = st.deck?.slides[spec.index];
        if (!target || st.deck?.id !== deck.id) return;
        const composed = composeSlide(spec.layout, spec.content, theme, aspect);
        st.replaceSlide(target.id, { ...composed, id: target.id });
        useGenerationStore.getState().markDone(spec.index);
      },
      onSlideError: (index) => useGenerationStore.getState().markFailed(index),
      onDone: () => {
        useGenerationStore.getState().finish();
        clearHistory(); // 생성 과정은 undo 대상에서 제외
      },
      onError: (msg) => useGenerationStore.getState().fail(msg),
    },
  );
  return deck.id;
}
