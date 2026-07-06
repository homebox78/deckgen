import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { streamOutline } from "../../api/client";
import { beginSlideGeneration } from "../../api/generateDeck";
import type { OutlineSlide, VizType } from "../../engine/schema";
import { useOutlineStore } from "../../store/outlineStore";
import { Dropdown } from "../ui/Dropdown";
import { StatusBadge } from "../ui/StatusBadge";

const VIZ_LABELS: Record<string, string> = {
  "": "시각화 없음",
  bar: "막대 차트",
  line: "선 차트",
  pie: "파이 차트",
  "kpi-cards": "KPI 카드",
  process: "프로세스",
};

const VIZ_BADGES: Record<string, string> = {
  bar: "BAR 차트",
  line: "LINE 차트",
  pie: "PIE 차트",
  "kpi-cards": "KPI 카드",
  process: "프로세스",
};

/** 디자인 시안(1e)의 시각화 미리보기 블록 — 예시 데이터로 형태만 보여준다 */
function VizPreview({ type }: { type: VizType }) {
  if (type === "bar") {
    return (
      <div>
        <div className="flex h-16 items-end gap-2.5 px-1.5">
          {[45, 65, 85, 100].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-[3px]"
              style={{
                height: `${h}%`,
                background: ["#D4CBEF", "#B9A8E8", "#8F73DE", "#6D4AFF"][i],
              }}
            />
          ))}
        </div>
        <div className="flex justify-between border-t border-[#E9E9E5] px-1.5 pt-1">
          {["2023", "2024", "2025", "2026"].map((y) => (
            <span key={y} className="text-[10px] text-app-faint">
              {y}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (type === "line") {
    return (
      <svg viewBox="0 0 300 70" className="block h-16 w-full">
        <line x1="6" y1="62" x2="294" y2="62" stroke="#E4E4E0" strokeWidth="1" />
        <polyline
          points="12,54 84,44 156,28 228,18 290,8"
          fill="none"
          stroke="#6D4AFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {[
          [12, 54],
          [84, 44],
          [156, 28],
          [228, 18],
          [290, 8],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="3" fill="#6D4AFF" />
        ))}
      </svg>
    );
  }
  if (type === "pie") {
    return (
      <div className="flex items-center gap-4 px-1.5 py-0.5">
        <div
          className="h-15 w-15 rounded-full"
          style={{
            background:
              "conic-gradient(#6D4AFF 0 150deg,#9B82FF 150deg 250deg,#C4B5FF 250deg 320deg,#E4E4E0 320deg 360deg)",
          }}
        />
        <div className="flex flex-col gap-1">
          {[
            ["#6D4AFF", "항목 A"],
            ["#9B82FF", "항목 B"],
            ["#C4B5FF", "항목 C"],
          ].map(([c, l]) => (
            <div key={l} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: c }} />
              <span className="text-[10.5px] text-app-muted">{l}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (type === "kpi-cards") {
    return (
      <div className="flex gap-2">
        {[
          ["30%", "METRIC A"],
          ["2배", "METRIC B"],
          ["95%", "METRIC C"],
        ].map(([v, l]) => (
          <div key={l} className="flex-1 rounded-lg border border-app-border bg-white px-3 py-2">
            <div className="mb-1.5 h-[3px] w-2/5 rounded-sm bg-[#D4CBEF]" />
            <div className="text-[15px] font-extrabold">{v}</div>
            <div className="text-[9.5px] tracking-wider text-app-faint">{l}</div>
          </div>
        ))}
      </div>
    );
  }
  // process
  return (
    <div className="flex items-center gap-1.5 px-0.5 py-1.5">
      {["#6D4AFF", "#9B82FF", "#C4B5FF", "#E0D8F9"].map((c, i) => (
        <div
          key={i}
          className="flex h-9 flex-1 items-center justify-center"
          style={{
            background: c,
            clipPath:
              "polygon(0 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,0 100%,12px 50%)",
          }}
        >
          <span
            className="text-[10px] font-bold"
            style={{ color: i === 3 ? "#6D4AFF" : "#fff" }}
          >
            0{i + 1}
          </span>
        </div>
      ))}
    </div>
  );
}

function StepRail({ prompt }: { prompt: string }) {
  return (
    <div>
      <div className="flex gap-2.5">
        <div className="flex flex-col items-center">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-app-accent text-[11px] font-bold text-white">
            1
          </span>
          <span className="h-6 w-[1.5px] bg-app-border" />
        </div>
        <div>
          <div className="pt-0.5 text-[13.5px] font-semibold">아웃라인 확인</div>
          <div className="text-[11.5px] text-app-faint">지금 단계</div>
        </div>
      </div>
      <div className="flex gap-2.5">
        <div className="flex flex-col items-center">
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-app-border-soft text-[11px] font-bold text-app-faint">
            2
          </span>
          <span className="h-6 w-[1.5px] bg-app-border" />
        </div>
        <div className="pt-1 text-[13.5px] text-app-faint">슬라이드 생성</div>
      </div>
      <div className="flex gap-2.5">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-app-border-soft text-[11px] font-bold text-app-faint">
          3
        </span>
        <div className="pt-1 text-[13.5px] text-app-faint">편집 · 내보내기</div>
      </div>
      <div className="mt-5 rounded-[10px] border border-[#E9E9E5] bg-app-bg p-3.5">
        <p className="mb-1 text-[13px] font-semibold">AI가 콘텐츠 구조를 먼저 정리합니다</p>
        <p className="text-[12.5px] leading-relaxed text-app-muted">
          제목·핵심 포인트·시각화를 여기서 수정하면 다음 단계 슬라이드에 그대로
          반영됩니다.
        </p>
      </div>
      <div className="mt-4 rounded-[10px] bg-app-bg p-3 text-[12px]">
        <p className="font-medium">주제</p>
        <p className="mt-1 line-clamp-3 text-app-muted">{prompt}</p>
      </div>
    </div>
  );
}

function OutlineCard({ slide }: { slide: OutlineSlide }) {
  const updateSlide = useOutlineStore((s) => s.updateSlide);
  const viz = slide.viz?.type ?? "";
  return (
    <div className="flex gap-3.5 rounded-xl border border-app-border bg-app-surface p-4">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-app-accent-soft text-[12px] font-bold text-app-accent">
        {slide.index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input
          className="w-full border-b border-dashed border-app-border bg-transparent pb-1.5 text-[14.5px] font-semibold focus:border-app-accent focus:outline-none"
          value={slide.title}
          onChange={(e) => updateSlide(slide.index, { title: e.target.value })}
        />
        <textarea
          className="w-full resize-y text-[13px] leading-relaxed text-[#4A4A45] focus:outline-none"
          rows={Math.max(2, slide.bullets.length)}
          value={slide.bullets.join("\n")}
          placeholder="불릿 (줄바꿈으로 구분)"
          onChange={(e) => updateSlide(slide.index, { bullets: e.target.value.split("\n") })}
        />
        <div className="flex items-center gap-2">
          <Dropdown
            items={Object.entries(VIZ_LABELS).map(([key, name]) => ({ key, name }))}
            activeKey={viz}
            onSelect={(key) =>
              updateSlide(slide.index, {
                viz: key ? { type: key as VizType, note: slide.viz?.note ?? "" } : null,
              })
            }
            triggerClassName={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 bg-white hover:border-app-accent data-open:border-app-accent ${
              viz ? "border-app-accent-border" : "border-app-border"
            }`}
          >
            <span
              className={`text-[12px] font-medium ${viz ? "text-app-accent" : "text-app-text"}`}
            >
              {viz ? "◈ " : ""}
              {VIZ_LABELS[viz]}
            </span>
            <span className="text-[9px] text-app-faint">▾</span>
          </Dropdown>
          {slide.viz && (
            <input
              className="min-w-0 flex-1 rounded-lg border border-app-border px-2.5 py-1.5 text-[12.5px] focus:border-app-accent focus:outline-none"
              placeholder="시각화 지시문 — 예: 연도별 시장 규모 성장 추이를 막대로 비교"
              value={slide.viz.note}
              onChange={(e) =>
                updateSlide(slide.index, { viz: { ...slide.viz!, note: e.target.value } })
              }
            />
          )}
        </div>
        {slide.viz && (
          <div className="mt-1 overflow-hidden rounded-[10px] border border-app-border">
            <div className="flex items-center gap-2 border-b border-app-border bg-app-bg px-3 py-2">
              <span className="rounded-md bg-app-accent-soft px-2 py-0.5 text-[11px] font-bold text-app-accent">
                {VIZ_BADGES[slide.viz.type]}
              </span>
              <span className="truncate text-[12px] text-[#4A4A45]">
                {slide.viz.note || "지시문을 입력하면 여기에 반영됩니다"}
              </span>
              <span className="flex-1" />
              <span className="shrink-0 text-[11px] text-app-faint">미리보기</span>
            </div>
            <div className="bg-[#FBFBFA] px-3.5 py-3">
              <VizPreview type={slide.viz.type} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonCard({ num }: { num: number }) {
  return (
    <div className="flex gap-3.5 rounded-xl border border-dashed border-[#D4D4CE] bg-app-surface p-4">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-app-border-soft text-[12px] font-bold text-[#B4B4AE]">
        {num}
      </span>
      <div className="flex flex-1 flex-col gap-2.5 pt-1">
        <div className="h-3 w-[45%] animate-dg-pulse rounded-md bg-[#EFEFEC]" />
        <div className="h-2.5 w-[85%] animate-dg-pulse rounded-md bg-[#F3F3F0] [animation-delay:.2s]" />
        <div className="h-2.5 w-[70%] animate-dg-pulse rounded-md bg-[#F3F3F0] [animation-delay:.4s]" />
      </div>
      <StatusBadge status="generating">생성 중</StatusBadge>
    </div>
  );
}

export function OutlinePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useOutlineStore();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!id || store.deckId !== id) return;
    if (store.status !== "idle" || startedRef.current) return;
    startedRef.current = true;
    store.setStatus("streaming");
    void streamOutline(
      { prompt: store.prompt, slideCount: store.slideCount },
      {
        onSlide: (slide) => useOutlineStore.getState().appendSlide(slide),
        onDone: () => useOutlineStore.getState().setStatus("done"),
        onError: (message) => useOutlineStore.getState().setStatus("error", message),
      },
    );
    // cleanup에서 abort하면 StrictMode 재마운트 시 스트림이 끊기므로 하지 않는다
  }, [id, store.deckId, store.status, store.prompt, store.slideCount, store.setStatus]);

  if (!id || store.deckId !== id) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-app-muted">아웃라인 세션이 없습니다.</p>
        <button
          onClick={() => navigate("/")}
          className="rounded-[10px] bg-app-text px-4 py-2 text-sm text-white"
        >
          홈으로
        </button>
      </div>
    );
  }

  const pendingCount = Math.max(0, store.slideCount - store.slides.length);
  const title =
    store.prompt.length > 26 ? store.prompt.slice(0, 26) + "…" : store.prompt;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 상단 바 */}
      <header className="flex shrink-0 items-center justify-between border-b border-app-border bg-app-surface px-6 py-3">
        <div className="flex items-center gap-2.5">
          <Link to="/" className="h-5 w-5 rounded-md bg-app-accent" title="홈으로" />
          <span className="text-[14px] font-bold">DeckGen</span>
          <span className="ml-1 truncate text-[12.5px] text-app-faint">/ {title}</span>
        </div>
        {store.status === "streaming" && (
          <StatusBadge status="generating">아웃라인 생성 중</StatusBadge>
        )}
        {store.status === "done" && (
          <StatusBadge status="done">아웃라인 완료 · 수정 가능</StatusBadge>
        )}
        {store.status === "error" && <StatusBadge status="error">오류 · 재시도</StatusBadge>}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 좌측 레일 */}
        <aside className="flex w-70 shrink-0 flex-col border-r border-app-border bg-app-surface p-6">
          <StepRail prompt={store.prompt} />
          {store.status === "error" && (
            <div className="mt-4 rounded-lg border border-app-danger-border bg-app-danger-soft p-3 text-[12.5px] text-app-danger">
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
          <div className="mt-auto flex flex-col gap-2 pt-5">
            <button
              disabled={store.status !== "done" || store.slides.length === 0}
              className="rounded-[10px] bg-app-accent px-4 py-3 text-[13.5px] font-semibold text-white shadow-[0_2px_8px_rgba(109,74,255,.25)] hover:opacity-90 disabled:bg-[#C9C4E8] disabled:shadow-none"
              onClick={() => {
                const deckId = beginSlideGeneration();
                if (deckId) navigate(`/deck/${deckId}/edit`);
              }}
            >
              ✦ 슬라이드 생성 ({store.slides.length || store.slideCount}장)
            </button>
            <button
              onClick={() => navigate("/")}
              className="rounded-[10px] border border-app-border bg-white px-4 py-2.5 text-[13px] font-medium text-app-muted hover:bg-app-bg"
            >
              ← 주제 다시 입력
            </button>
          </div>
        </aside>

        {/* 우측 카드 리스트 */}
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {store.slides.map((slide) => (
              <OutlineCard key={slide.index} slide={slide} />
            ))}
            {store.status === "streaming" &&
              Array.from({ length: pendingCount }).map((_, i) => (
                <SkeletonCard key={i} num={store.slides.length + i + 1} />
              ))}
          </div>
        </main>
      </div>
    </div>
  );
}
