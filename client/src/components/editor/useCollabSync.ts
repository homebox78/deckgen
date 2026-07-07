// §12 협업 동기화 훅 — 로컬 store 변경을 서버로 push, 원격 변경을 store에 반영
import { useEffect, useRef } from "react";
import { connectEvents, pushDeck, pushSlide, sendPresence } from "../../api/collab";
import type { Deck } from "../../engine/schema";
import {
  CLIENT_ID,
  MY_COLOR,
  getCollabSession,
  getGuestName,
  useCollabStore,
} from "../../store/collabStore";
import { useDeckStore } from "../../store/deckStore";
import { useUiStore } from "../../store/uiStore";
import { showToast } from "../ui/toast";

// 원격 반영 중 로컬 변경 감지를 끄는 가드 (에코 루프 방지)
let applyingRemote = false;

/** 제목/테마/슬라이드 순서·개수 변경 = 덱 전체 push 대상 */
function isStructural(prev: Deck, next: Deck): boolean {
  if (prev.title !== next.title || prev.themeId !== next.themeId) return true;
  if (prev.slides.length !== next.slides.length) return true;
  for (let i = 0; i < prev.slides.length; i++) {
    if (prev.slides[i].id !== next.slides[i].id) return true;
  }
  return false;
}

export function useCollabSync(deck: Deck | null): void {
  const deckId = deck?.id ?? null;
  const sessionVersion = useCollabStore((s) => s.sessionVersion);
  const prevDeckRef = useRef<Deck | null>(null);

  useEffect(() => {
    if (!deckId) return;
    const sess = getCollabSession(deckId);
    const collab = useCollabStore.getState();
    if (!sess) {
      if (collab.deckId === deckId) collab.end();
      return;
    }

    collab.begin({ deckId, role: sess.role, isGuest: sess.isGuest });
    const token = sess.token;
    const name = getGuestName() || (sess.isGuest ? "게스트" : "나");

    // ---- 원격 → 로컬 ----
    const applyRemote = (kind: "slide" | "deck", payload: { slide?: Deck["slides"][number]; deck?: Deck }) => {
      const st = useDeckStore.getState();
      if (st.deck?.id !== deckId) return;
      applyingRemote = true;
      try {
        if (kind === "slide" && payload.slide) {
          if (st.deck.slides.some((s) => s.id === payload.slide!.id)) {
            st.replaceSlide(payload.slide.id, payload.slide);
          }
        } else if (kind === "deck" && payload.deck) {
          st.setDeck(payload.deck);
          const ui = useUiStore.getState();
          if (ui.currentSlideIndex >= payload.deck.slides.length) {
            ui.setCurrentSlideIndex(payload.deck.slides.length - 1);
          }
        }
      } finally {
        applyingRemote = false;
      }
    };

    const disconnect = connectEvents(
      deckId,
      {
        token,
        clientId: CLIENT_ID,
        name,
        color: MY_COLOR,
        slideIndex: useUiStore.getState().currentSlideIndex,
      },
      {
        onUpdate: (u) => {
          if (u.origin === CLIENT_ID) return;
          applyRemote(u.kind, u);
        },
        onPresence: (peers) => useCollabStore.getState().setPeers(peers),
        onOpen: () => useCollabStore.getState().setConnected(true),
        onError: () => useCollabStore.getState().setConnected(false),
      },
    );

    // ---- 로컬 → 원격 (편집 권한만) ----
    let unsubDeck: (() => void) | null = null;
    let flushTimer: number | undefined;
    const dirty = new Set<string>();
    let fullPush = false;

    if (sess.role === "edit") {
      prevDeckRef.current = useDeckStore.getState().deck;

      const flush = () => {
        const cur = useDeckStore.getState().deck;
        if (!cur || cur.id !== deckId) return;
        if (fullPush) {
          fullPush = false;
          dirty.clear();
          pushDeck(deckId, token, CLIENT_ID, cur).catch(() =>
            showToast("동기화 실패 — 네트워크를 확인하세요"),
          );
          return;
        }
        const ids = [...dirty];
        dirty.clear();
        for (const id of ids) {
          const sl = cur.slides.find((s) => s.id === id);
          if (sl) {
            pushSlide(deckId, token, CLIENT_ID, sl).catch((e) => {
              // 구조 변경 레이스(409) → 다음 틱에 전체 push로 정리
              if (e instanceof Error && e.message.includes("구조")) {
                fullPush = true;
                schedule();
              }
            });
          }
        }
      };
      const schedule = () => {
        window.clearTimeout(flushTimer);
        flushTimer = window.setTimeout(flush, 350);
      };

      unsubDeck = useDeckStore.subscribe((state) => {
        const next = state.deck;
        const prev = prevDeckRef.current;
        prevDeckRef.current = next;
        if (applyingRemote) return;
        if (!next || next.id !== deckId || !prev || prev.id !== deckId) return;
        if (next === prev) return;
        if (isStructural(prev, next)) {
          fullPush = true;
        } else {
          for (let i = 0; i < next.slides.length; i++) {
            if (next.slides[i] !== prev.slides[i]) dirty.add(next.slides[i].id);
          }
          if (dirty.size === 0 && !fullPush) return;
        }
        schedule();
      });
    }

    // ---- 프레즌스 하트비트 ----
    const beat = () => {
      void sendPresence(deckId, {
        token,
        clientId: CLIENT_ID,
        name,
        color: MY_COLOR,
        slideIndex: useUiStore.getState().currentSlideIndex,
      }).catch(() => {});
    };
    const beatIv = window.setInterval(beat, 10_000);
    let lastBeat = 0;
    const unsubUi = useUiStore.subscribe((s, prev) => {
      if (s.currentSlideIndex === prev.currentSlideIndex) return;
      const now = Date.now();
      if (now - lastBeat < 800) return;
      lastBeat = now;
      beat();
    });

    return () => {
      disconnect();
      unsubDeck?.();
      unsubUi();
      window.clearInterval(beatIv);
      window.clearTimeout(flushTimer);
      useCollabStore.getState().end();
    };
  }, [deckId, sessionVersion]);
}
