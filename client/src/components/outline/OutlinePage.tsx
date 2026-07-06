import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { streamOutline } from "../../api/client";
import { beginSlideGeneration } from "../../api/generateDeck";
import type { OutlineSlide, VizType } from "../../engine/schema";
import { useOutlineStore } from "../../store/outlineStore";

const VIZ_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "시각화 없음" },
  { value: "bar", label: "막대 차트" },
  { value: "line", label: "선 차트" },
  { value: "pie", label: "파이 차트" },
  { value: "kpi-cards", label: "KPI 카드" },
  { value: "process", label: "프로세스" },
];

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-app-border bg-app-surface p-4">
      <div className="h-5 w-2/5 rounded bg-app-border" />
      <div className="mt-3 h-3 w-4/5 rounded bg-app-border" />
      <div className="mt-2 h-3 w-3/5 rounded bg-app-border" />
    </div>
  );
}

function OutlineCard({ slide }: { slide: OutlineSlide }) {
  const updateSlide = useOutlineStore((s) => s.updateSlide);
  return (
    <div className="rounded-xl border border-app-border bg-app-surface p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-app-muted">{slide.index + 1}</span>
        <input
          className="w-full rounded-md border border-transparent px-2 py-1 font-semibold hover:border-app-border focus:border-app-accent focus:outline-none"
          value={slide.title}
          onChange={(e) => updateSlide(slide.index, { title: e.target.value })}
        />
      </div>
      <textarea
        className="mt-2 w-full resize-y rounded-md border border-transparent px-2 py-1 text-sm leading-6 hover:border-app-border focus:border-app-accent focus:outline-none"
        rows={Math.max(2, slide.bullets.length)}
        value={slide.bullets.join("\n")}
        placeholder="불릿 (줄바꿈으로 구분)"
        onChange={(e) =>
          updateSlide(slide.index, {
            bullets: e.target.value.split("\n"),
          })
        }
      />
      <div className="mt-2 flex items-center gap-2">
        <select
          className="rounded-md border border-app-border bg-white px-2 py-1 text-sm"
          value={slide.viz?.type ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            updateSlide(slide.index, {
              viz: v ? { type: v as VizType, note: slide.viz?.note ?? "" } : null,
            });
          }}
        >
          {VIZ_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {slide.viz && (
          <input
            className="w-full rounded-md border border-app-border px-2 py-1 text-sm"
            placeholder="차트가 표현할 내용 (한 문장)"
            value={slide.viz.note}
            onChange={(e) =>
              updateSlide(slide.index, {
                viz: { ...slide.viz!, note: e.target.value },
              })
            }
          />
        )}
      </div>
    </div>
  );
}

export function OutlinePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useOutlineStore();
  const startedRef = useRef(false);

  // 아웃라인 스트리밍 시작
  useEffect(() => {
    if (!id || store.deckId !== id) return;
    if (store.status !== "idle" || startedRef.current) return;
    startedRef.current = true;
    store.setStatus("streaming");
    const abort = new AbortController();
    void streamOutline(
      { prompt: store.prompt, slideCount: store.slideCount },
      {
        signal: abort.signal,
        onSlide: (slide) => useOutlineStore.getState().appendSlide(slide),
        onDone: () => useOutlineStore.getState().setStatus("done"),
        onError: (message) => useOutlineStore.getState().setStatus("error", message),
      },
    );
    // cleanup에서 abort하면 StrictMode 재마운트 시 스트림이 끊기므로 하지 않는다
    // (startedRef로 중복 시작 방지, 페이지 이탈 시 스트림은 자연 종료)
  }, [id, store.deckId, store.status, store.prompt, store.slideCount, store.setStatus]);

  if (!id || store.deckId !== id) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-app-muted">아웃라인 세션이 없습니다.</p>
        <button
          onClick={() => navigate("/")}
          className="rounded-[10px] bg-black px-4 py-2 text-sm text-white"
        >
          홈으로
        </button>
      </div>
    );
  }

  const pendingCount = Math.max(0, store.slideCount - store.slides.length);

  return (
    <div className="flex h-full">
      {/* 좌측 안내 */}
      <aside className="flex w-80 shrink-0 flex-col gap-4 border-r border-app-border bg-app-surface p-6">
        <div>
          <h1 className="text-lg font-bold">콘텐츠 구조 설계</h1>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            AI가 콘텐츠 구조를 먼저 정리합니다. 슬라이드를 만들기 전에 제목·불릿·시각화를
            자유롭게 수정하세요.
          </p>
        </div>
        <div className="rounded-lg bg-app-bg p-3 text-sm">
          <p className="font-medium">주제</p>
          <p className="mt-1 text-app-muted">{store.prompt}</p>
        </div>
        {store.status === "streaming" && (
          <p className="text-sm text-app-accent">
            아웃라인 구성 중… ({store.slides.length}/{store.slideCount})
          </p>
        )}
        {store.status === "error" && (
          <div className="rounded-lg border border-app-danger/40 bg-app-danger/5 p-3 text-sm text-app-danger">
            {store.error}
            <button
              onClick={() => {
                startedRef.current = false;
                useOutlineStore.getState().setStatus("idle");
              }}
              className="mt-2 block rounded-md border border-app-danger px-3 py-1"
            >
              다시 시도
            </button>
          </div>
        )}
        <div className="mt-auto flex gap-2">
          <button
            onClick={() => navigate("/")}
            className="rounded-[10px] border border-app-border px-4 py-2 text-sm hover:bg-app-bg"
          >
            뒤로
          </button>
          <button
            disabled={store.status !== "done" || store.slides.length === 0}
            className="flex-1 rounded-[10px] bg-app-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            onClick={() => {
              const deckId = beginSlideGeneration();
              if (deckId) navigate(`/deck/${deckId}/edit`);
            }}
          >
            슬라이드 생성 →
          </button>
        </div>
      </aside>

      {/* 우측 카드 리스트 */}
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {store.slides.map((slide) => (
            <OutlineCard key={slide.index} slide={slide} />
          ))}
          {store.status === "streaming" &&
            Array.from({ length: pendingCount }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </main>
    </div>
  );
}
