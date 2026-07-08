// 인터랙티브 워크숍 위젯의 HTML 오버레이 — Fabric 정적 렌더 위에 얹어 실동작(투표·타이머·스피너·정렬).
// 상태는 스키마에 저장 → deckStore.updateElement 로 협업 동기화. 타이머 눈금은 로컬 interval(스토어 쓰기 없음).
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { WidgetElement } from "../../engine/schema";

export interface ScreenRect {
  l: number;
  t: number;
  w: number;
  h: number;
}

// 절대 패치 또는 최신 상태 기반 함수형 업데이트(빠른 연속 투표에도 누적되도록)
export type WidgetUpdater =
  | Partial<WidgetElement>
  | ((el: WidgetElement) => Partial<WidgetElement>);

const DOT_COLORS = ["#2563EB", "#1E9C5B", "#E0701F", "#D6336C", "#8B5CF6", "#0EA5E9"];

export function WidgetOverlay({
  widget,
  rect,
  readOnly,
  onUpdate,
}: {
  widget: WidgetElement;
  rect: ScreenRect;
  readOnly?: boolean;
  onUpdate: (patch: WidgetUpdater) => void;
}) {
  // 논리(1920) → 화면 스케일. 폰트/패딩을 스케일에 맞춰 위젯이 확대/축소돼도 비율 유지.
  const s = rect.w / Math.max(1, widget.w);
  const px = (v: number) => `${v * s}px`;

  return (
    <div
      className="absolute overflow-hidden rounded-[18px] bg-white shadow-[0_2px_10px_rgba(0,0,0,.06)] ring-1 ring-black/10"
      style={{ left: rect.l, top: rect.t, width: rect.w, height: rect.h, pointerEvents: "none" }}
    >
      <div className="flex h-full flex-col" style={{ padding: px(20), gap: px(10) }}>
        <div className="font-bold text-app-text" style={{ fontSize: px(30), lineHeight: 1.1 }}>
          {widget.title}
        </div>
        {(widget.widget === "poll" || widget.widget === "dotvote") && (
          <PollBody widget={widget} s={s} readOnly={readOnly} onUpdate={onUpdate} />
        )}
        {widget.widget === "timer" && (
          <TimerBody widget={widget} s={s} readOnly={readOnly} onUpdate={onUpdate} />
        )}
        {widget.widget === "spinner" && (
          <SpinnerBody widget={widget} s={s} readOnly={readOnly} onUpdate={onUpdate} />
        )}
        {widget.widget === "alignment" && (
          <AlignmentBody widget={widget} s={s} readOnly={readOnly} onUpdate={onUpdate} />
        )}
        {widget.widget === "wordcloud" && (
          <WordCloudBody widget={widget} s={s} readOnly={readOnly} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  );
}

function WordCloudBody({
  widget,
  s,
  readOnly,
  onUpdate,
}: {
  widget: WidgetElement;
  s: number;
  readOnly?: boolean;
  onUpdate: (patch: WidgetUpdater) => void;
}) {
  const px = (v: number) => `${v * s}px`;
  const [draft, setDraft] = useState("");
  const words = [...(widget.words ?? [])].sort((a, b) => b.count - a.count);
  const maxC = Math.max(1, ...words.map((w) => w.count));

  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) return;
    onUpdate((el) => {
      const list = [...(el.words ?? [])];
      const i = list.findIndex((w) => w.text.toLowerCase() === t.toLowerCase());
      if (i >= 0) list[i] = { ...list[i], count: list[i].count + 1 };
      else list.push({ text: t, count: 1 });
      return { words: list };
    });
  };
  const bump = (text: string) =>
    onUpdate((el) => ({
      words: (el.words ?? []).map((w) => (w.text === text ? { ...w, count: w.count + 1 } : w)),
    }));

  const COLORS = ["#1A1A1A", DOT_COLORS[0], DOT_COLORS[1], DOT_COLORS[2], DOT_COLORS[4]];
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ gap: px(8) }}>
      {!readOnly && (
        <div
          className="flex items-center rounded-full border border-app-border bg-white"
          style={{ gap: px(6), padding: `${px(4)} ${px(12)}`, pointerEvents: "auto" }}
        >
          <span className="mi text-app-faint" style={{ fontSize: px(18) }}>
            add
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                add(draft);
                setDraft("");
              }
            }}
            placeholder="단어 입력 후 Enter"
            className="min-w-0 flex-1 bg-transparent focus:outline-none"
            style={{ fontSize: px(18) }}
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center overflow-hidden" style={{ gap: `${px(4)} ${px(14)}` }}>
        {words.length === 0 ? (
          <span className="text-app-faint" style={{ fontSize: px(20) }}>
            단어를 입력하면 빈도수만큼 커집니다
          </span>
        ) : (
          words.map((w, i) => (
            <button
              key={w.text}
              disabled={readOnly}
              onClick={() => !readOnly && bump(w.text)}
              title={`${w.count}회 · 클릭해서 +1`}
              className="font-bold leading-none hover:opacity-70 disabled:cursor-default"
              style={{
                fontSize: px(22 + (w.count / maxC) * 46),
                color: COLORS[i % COLORS.length],
                pointerEvents: readOnly ? "none" : "auto",
              }}
            >
              {w.text}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function PollBody({
  widget,
  s,
  readOnly,
  onUpdate,
}: {
  widget: WidgetElement;
  s: number;
  readOnly?: boolean;
  onUpdate: (patch: WidgetUpdater) => void;
}) {
  const px = (v: number) => `${v * s}px`;
  const opts = widget.options ?? [];
  const total = opts.reduce((n, o) => n + o.votes, 0);
  const max = Math.max(1, ...opts.map((o) => o.votes));
  const isDot = widget.widget === "dotvote";
  const vote = (id: string) =>
    onUpdate((el) => ({
      options: (el.options ?? []).map((o) => (o.id === id ? { ...o, votes: o.votes + 1 } : o)),
    }));
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center" style={{ gap: px(8) }}>
      {opts.map((o, i) => (
        <button
          key={o.id}
          disabled={readOnly}
          onClick={() => !readOnly && vote(o.id)}
          className="group flex items-center rounded-lg text-left disabled:cursor-default"
          style={{ gap: px(10), pointerEvents: readOnly ? "none" : "auto" }}
          title="클릭해서 투표"
        >
          <span
            className="shrink-0 truncate font-semibold text-app-text"
            style={{ width: px(widget.w * 0.34), fontSize: px(22) }}
          >
            {o.label}
          </span>
          {isDot ? (
            <span
              className="flex flex-1 flex-wrap items-center"
              style={{ gap: px(4), minHeight: px(24) }}
            >
              {Array.from({ length: o.votes }).map((_, k) => (
                <span
                  key={k}
                  className="rounded-full"
                  style={{
                    width: px(18),
                    height: px(18),
                    background: o.color || DOT_COLORS[i % DOT_COLORS.length],
                  }}
                />
              ))}
            </span>
          ) : (
            <span className="relative flex-1 overflow-hidden rounded-full bg-app-bg" style={{ height: px(26) }}>
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${(o.votes / max) * 100}%`,
                  background: o.color || DOT_COLORS[i % DOT_COLORS.length],
                }}
              />
            </span>
          )}
          <span
            className="shrink-0 text-right font-bold text-app-muted tabular-nums"
            style={{ width: px(44), fontSize: px(22) }}
          >
            {o.votes}
          </span>
          {!readOnly && (
            <span
              className="mi shrink-0 text-app-faint group-hover:text-app-accent"
              style={{ fontSize: px(20) }}
            >
              add_circle
            </span>
          )}
        </button>
      ))}
      <div className="text-app-faint" style={{ fontSize: px(16), marginTop: px(2) }}>
        총 {total}표 · 클릭해서 투표
      </div>
    </div>
  );
}

function TimerBody({
  widget,
  s,
  readOnly,
  onUpdate,
}: {
  widget: WidgetElement;
  s: number;
  readOnly?: boolean;
  onUpdate: (patch: WidgetUpdater) => void;
}) {
  const px = (v: number) => `${v * s}px`;
  const [now, setNow] = useState(() => Date.now());
  const running = widget.endsAt != null;
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [running]);
  const totalMs = (widget.seconds ?? 300) * 1000;
  const ms = running
    ? Math.max(0, (widget.endsAt as number) - now)
    : widget.remainingMs != null
      ? widget.remainingMs
      : totalMs;
  const done = running && ms <= 0;
  const sec = Math.round(ms / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  const start = () => onUpdate({ endsAt: Date.now() + (widget.remainingMs ?? totalMs), remainingMs: null });
  const pause = () =>
    onUpdate({ remainingMs: Math.max(0, (widget.endsAt as number) - Date.now()), endsAt: null });
  const reset = () => onUpdate({ endsAt: null, remainingMs: totalMs });
  const btn = (icon: string, label: string, fn: () => void) => (
    <button
      disabled={readOnly}
      onClick={fn}
      title={label}
      className="flex items-center justify-center rounded-full border border-app-border bg-white text-app-muted hover:border-app-accent hover:text-app-accent disabled:opacity-40"
      style={{ width: px(52), height: px(52), pointerEvents: readOnly ? "none" : "auto" }}
    >
      <span className="mi" style={{ fontSize: px(26) }}>
        {icon}
      </span>
    </button>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center" style={{ gap: px(6) }}>
      <div
        className={`font-extrabold tabular-nums ${done ? "text-app-danger" : "text-app-text"}`}
        style={{ fontSize: px(88), lineHeight: 1 }}
      >
        {mm}:{ss}
      </div>
      <div className="flex" style={{ gap: px(10) }}>
        {running ? btn("pause", "일시정지", pause) : btn("play_arrow", "시작", start)}
        {btn("restart_alt", "리셋", reset)}
      </div>
    </div>
  );
}

function SpinnerBody({
  widget,
  s,
  readOnly,
  onUpdate,
}: {
  widget: WidgetElement;
  s: number;
  readOnly?: boolean;
  onUpdate: (patch: WidgetUpdater) => void;
}) {
  const px = (v: number) => `${v * s}px`;
  const opts = widget.options ?? [];
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const seg = 360 / Math.max(1, opts.length);
  // conic-gradient 색 구간
  const stops = opts
    .map((o, i) => {
      const c = o.color || DOT_COLORS[i % DOT_COLORS.length];
      return `${c} ${i * seg}deg ${(i + 1) * seg}deg`;
    })
    .join(", ");
  const picked = opts.find((o) => o.id === widget.result);
  const spin = () => {
    if (spinning || opts.length === 0 || readOnly) return;
    setSpinning(true);
    const idx = Math.floor(Math.random() * opts.length);
    // 선택 구간의 중앙이 12시(위)에 오도록 회전량 계산 + 여러 바퀴
    const target = 360 * 5 + (360 - (idx * seg + seg / 2));
    setAngle((a) => a - (a % 360) + target);
    window.setTimeout(() => {
      setSpinning(false);
      onUpdate({ result: opts[idx].id });
    }, 2600);
  };
  const size = 0; // 계산은 CSS로
  void size;
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center" style={{ gap: px(16) }}>
      <div
        className="relative shrink-0"
        style={{ width: px(widget.h * 0.62), height: px(widget.h * 0.62) }}
      >
        {/* 포인터 */}
        <div
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
          style={{
            borderLeft: `${px(10)} solid transparent`,
            borderRight: `${px(10)} solid transparent`,
            borderTop: `${px(16)} solid #1A1A1A`,
          }}
        />
        <div
          ref={wheelRef}
          className="h-full w-full rounded-full ring-2 ring-black/10"
          style={{
            background: opts.length ? `conic-gradient(${stops})` : "#eee",
            transform: `rotate(${angle}deg)`,
            transition: spinning ? "transform 2.5s cubic-bezier(.17,.67,.2,1)" : "none",
          }}
        />
        <button
          disabled={readOnly || spinning}
          onClick={spin}
          className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-app-text font-bold text-white shadow disabled:opacity-60"
          style={{ width: px(64), height: px(64), fontSize: px(15), pointerEvents: readOnly ? "none" : "auto" }}
        >
          {spinning ? "…" : "돌리기"}
        </button>
      </div>
      <div className="min-w-0 flex-1" style={{ pointerEvents: "none" }}>
        {picked ? (
          <>
            <div className="text-app-faint" style={{ fontSize: px(16) }}>
              결과
            </div>
            <div className="truncate font-extrabold text-app-accent" style={{ fontSize: px(30) }}>
              {picked.label}
            </div>
          </>
        ) : (
          <div className="text-app-faint" style={{ fontSize: px(18) }}>
            {opts.length}개 항목 · 돌려서 뽑기
          </div>
        )}
      </div>
    </div>
  );
}

function AlignmentBody({
  widget,
  s,
  readOnly,
  onUpdate,
}: {
  widget: WidgetElement;
  s: number;
  readOnly?: boolean;
  onUpdate: (patch: WidgetUpdater) => void;
}) {
  const px = (v: number) => `${v * s}px`;
  const trackRef = useRef<HTMLDivElement>(null);
  const v = Math.max(0, Math.min(100, widget.scaleValue ?? 50));
  const startDrag = (e: ReactPointerEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;
    const move = (ev: PointerEvent) => {
      const r = track.getBoundingClientRect();
      const p = Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100));
      onUpdate({ scaleValue: Math.round(p) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    move(e.nativeEvent);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center" style={{ gap: px(10) }}>
      <div
        ref={trackRef}
        className="relative w-full rounded-full"
        style={{
          height: px(12),
          background: "linear-gradient(90deg,#F0566A,#F5C24B,#1E9C5B)",
          pointerEvents: readOnly ? "none" : "auto",
        }}
        onPointerDown={startDrag}
      >
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-app-text"
          style={{ left: `${v}%`, width: px(28), height: px(28), cursor: "grab" }}
        />
      </div>
      <div className="flex justify-between font-semibold text-app-muted" style={{ fontSize: px(18) }}>
        <span>{widget.scaleLeft ?? "동의 안 함"}</span>
        <span>{widget.scaleRight ?? "매우 동의"}</span>
      </div>
    </div>
  );
}
