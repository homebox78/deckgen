import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { renderSlideToDataURL } from "../../engine/fabricRenderer";
import { createSampleDeck } from "../../engine/sampleDeck";
import { exportDeckToPptx } from "../../engine/pptxExporter";
import { getTheme, themes } from "../../engine/themes";
import { clearHistory, useDeckStore, useTemporal } from "../../store/deckStore";
import { loadDeck, saveDeck, saveDeckThumbnail } from "../../store/storage";
import { useGenerationStore } from "../../store/generationStore";
import type { SlideGenStatus } from "../../store/generationStore";
import { useUiStore } from "../../store/uiStore";
import { ChatPanel } from "./ChatPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { SlideCanvas } from "./SlideCanvas";
import { SlideThumbnail } from "./SlideThumbnail";

type RightTab = "chat" | "props";

interface ContextMenuState {
  x: number;
  y: number;
  slideId: string;
}

const GEN_BADGE: Partial<Record<SlideGenStatus, { label: string; cls: string }>> = {
  queued: { label: "Queued", cls: "bg-black/50 text-white" },
  generating: { label: "Generating…", cls: "bg-app-accent text-white animate-pulse" },
  failed: { label: "실패", cls: "bg-app-danger text-white" },
};

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const deck = useDeckStore((s) => s.deck);
  const {
    setDeck,
    setDeckTitle,
    setThemeId,
    addSlide,
    duplicateSlide,
    deleteSlide,
  } = useDeckStore.getState();
  const temporal = useTemporal();

  const currentSlideIndex = useUiStore((s) => s.currentSlideIndex);
  const setCurrentSlideIndex = useUiStore((s) => s.setCurrentSlideIndex);
  const selectedElementId = useUiStore((s) => s.selectedElementId);

  const [tab, setTab] = useState<RightTab>("props");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [exporting, setExporting] = useState(false);
  const gen = useGenerationStore();
  const genStatuses = deck && gen.deckId === deck.id ? gen.statuses : null;

  // 덱 로드: localStorage → 없으면 샘플
  useEffect(() => {
    if (!id) return;
    if (deck?.id === id) return;
    const loaded = loadDeck(id) ?? (id === "sample" ? createSampleDeck() : null);
    setDeck(loaded);
    setCurrentSlideIndex(0);
    clearHistory();
    // deck은 의도적으로 deps에서 제외 — id 변경 시에만 로드
  }, [id]);

  // 자동 저장 (debounce 1초) + 홈 목록용 1번 슬라이드 썸네일 갱신
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!deck) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveDeck(deck);
      const first = deck.slides[0];
      if (first) {
        void renderSlideToDataURL(first, getTheme(deck.themeId), 320).then((url) =>
          saveDeckThumbnail(deck.id, url),
        );
      }
    }, 1000);
    return () => window.clearTimeout(saveTimer.current);
  }, [deck]);

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      const { undo, redo } = useDeckStore.temporal.getState();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 컨텍스트 메뉴 닫기
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  if (!deck) {
    return (
      <div className="flex h-full items-center justify-center text-app-muted">
        덱을 찾을 수 없습니다.
      </div>
    );
  }

  const theme = getTheme(deck.themeId);
  const slideIndex = Math.min(currentSlideIndex, deck.slides.length - 1);
  const slide = deck.slides[slideIndex];
  const selectedElement =
    slide.elements.find((el) => el.id === selectedElementId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {/* 상단 바 */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-app-border bg-app-surface px-4">
        <Link
          to="/"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-app-accent text-sm font-bold text-white"
          title="홈으로"
        >
          D
        </Link>
        <input
          className="w-64 rounded-md border border-transparent px-2 py-1 font-semibold hover:border-app-border focus:border-app-accent focus:outline-none"
          value={deck.title}
          onChange={(e) => setDeckTitle(e.target.value)}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={() => useDeckStore.temporal.getState().undo()}
            disabled={temporal.pastStates.length === 0}
            className="rounded-md border border-app-border px-2.5 py-1 text-sm hover:bg-app-bg disabled:opacity-40"
            title="실행 취소 (Ctrl+Z)"
          >
            ↩
          </button>
          <button
            onClick={() => useDeckStore.temporal.getState().redo()}
            disabled={temporal.futureStates.length === 0}
            className="rounded-md border border-app-border px-2.5 py-1 text-sm hover:bg-app-bg disabled:opacity-40"
            title="다시 실행 (Ctrl+Shift+Z)"
          >
            ↪
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <select
            className="rounded-lg border border-app-border bg-white px-3 py-1.5 text-sm"
            value={deck.themeId}
            onChange={(e) => setThemeId(e.target.value)}
          >
            {Object.values(themes).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setExporting(true);
              exportDeckToPptx(deck)
                .catch((e) => alert(`내보내기 실패: ${e instanceof Error ? e.message : e}`))
                .finally(() => setExporting(false));
            }}
            disabled={exporting}
            className="rounded-[10px] bg-app-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? "내보내는 중…" : "PPTX 내보내기"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 좌측: 썸네일 */}
        <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-app-border bg-app-surface p-3">
          <ul className="flex flex-col gap-3">
            {deck.slides.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => setCurrentSlideIndex(i)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, slideId: s.id });
                  }}
                  className={`w-full rounded-lg border-2 p-1 text-left transition-colors ${
                    i === slideIndex
                      ? "border-app-accent"
                      : "border-transparent hover:border-app-border"
                  }`}
                >
                  <div className="relative">
                    <SlideThumbnail slide={s} theme={theme} />
                    {genStatuses && GEN_BADGE[genStatuses[i]] && (
                      <span
                        className={`absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${GEN_BADGE[genStatuses[i]]!.cls}`}
                      >
                        {GEN_BADGE[genStatuses[i]]!.label}
                      </span>
                    )}
                  </div>
                  <span className="mt-1 block px-1 text-xs text-app-muted">
                    {i + 1} · {s.layout}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              addSlide(slideIndex);
              setCurrentSlideIndex(slideIndex + 1);
            }}
            className="mt-3 rounded-lg border border-dashed border-app-border py-2 text-sm text-app-muted hover:border-app-accent hover:text-app-accent"
          >
            + 슬라이드 추가
          </button>
        </aside>

        {/* 중앙: 캔버스 */}
        <main className="min-w-0 flex-1">
          <SlideCanvas slide={slide} theme={theme} />
        </main>

        {/* 우측: 탭 패널 */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-app-border bg-app-surface">
          <div className="flex border-b border-app-border">
            {(
              [
                ["chat", "AI 채팅"],
                ["props", "속성"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2.5 text-sm font-medium ${
                  tab === key
                    ? "border-b-2 border-app-accent text-app-text"
                    : "text-app-muted hover:text-app-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 에이전트 작업 로그 (§6.1) — 생성 진행/실패 시 타임라인 표시 */}
          {genStatuses && (gen.active || gen.error) && (
            <div className="max-h-48 shrink-0 overflow-y-auto border-b border-app-border bg-app-bg/60 px-4 py-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-app-muted uppercase">
                에이전트 작업 로그
              </p>
              <ol className="flex flex-col gap-1.5">
                {gen.logs.map((log, i) => {
                  const isLast = i === gen.logs.length - 1;
                  return (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          isLast && gen.active
                            ? "animate-pulse bg-app-accent"
                            : "bg-app-border"
                        }`}
                      />
                      <span className={isLast && gen.active ? "text-app-text" : "text-app-muted"}>
                        {log}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {gen.error && (
                <p className="mt-2 text-xs text-app-danger">
                  {gen.error} — 아웃라인 화면에서 다시 시도해주세요.
                </p>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "props" ? (
              <PropertiesPanel
                slideId={slide.id}
                element={selectedElement}
                theme={theme}
              />
            ) : (
              <ChatPanel slide={slide} slideIndex={slideIndex} theme={theme} />
            )}
          </div>
        </aside>
      </div>

      {/* 슬라이드 우클릭 메뉴 */}
      {menu && (
        <div
          className="fixed z-50 w-32 overflow-hidden rounded-lg border border-app-border bg-white shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            className="block w-full px-3 py-2 text-left text-sm hover:bg-app-bg"
            onClick={() => {
              duplicateSlide(menu.slideId);
              setMenu(null);
            }}
          >
            복제
          </button>
          <button
            className="block w-full px-3 py-2 text-left text-sm text-app-danger hover:bg-app-bg disabled:opacity-40"
            disabled={deck.slides.length <= 1}
            onClick={() => {
              const i = deck.slides.findIndex((s) => s.id === menu.slideId);
              deleteSlide(menu.slideId);
              if (slideIndex >= deck.slides.length - 1 || i <= slideIndex) {
                setCurrentSlideIndex(Math.max(0, slideIndex - (i <= slideIndex ? 1 : 0)));
              }
              setMenu(null);
            }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}
