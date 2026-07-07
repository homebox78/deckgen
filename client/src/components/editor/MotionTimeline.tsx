// 모션 타임라인 — 요소 등장 애니(효과·간격·트랙) + 재생. 발표 모드 슬라이드 진입 시 자동 재생.
import { useState } from "react";
import {
  getMotion,
  MOTION_EFFECTS,
  setMotion,
  type MotionConfig,
} from "../../store/motionStore";

interface Props {
  deckId: string;
  onPlay: () => void;
  onClose: () => void;
}

const TRACKS: { key: keyof MotionConfig["tracks"]; name: string; barW: string }[] = [
  { key: "title", name: "제목", barW: "38%" },
  { key: "body", name: "본문", barW: "62%" },
  { key: "aux", name: "보조 요소", barW: "50%" },
];

export function MotionTimeline({ deckId, onPlay, onClose }: Props) {
  const [cfg, setCfg] = useState<MotionConfig>(() => getMotion(deckId));

  const save = (next: MotionConfig) => {
    setCfg(next);
    setMotion(deckId, next);
  };

  return (
    <div className="absolute top-3 left-1/2 z-30 w-[360px] -translate-x-1/2 rounded-xl border border-app-border bg-white p-3.5 shadow-[0_8px_28px_rgba(0,0,0,.16)]">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[13px] font-bold">모션 타임라인</span>
        <span className="flex-1" />
        <button
          onClick={() => {
            onPlay();
          }}
          className="flex items-center gap-1 rounded-lg bg-app-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
        >
          <span className="mi align-middle text-[14px] mr-0.5">play_arrow</span>재생
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-app-border bg-white px-2.5 py-1.5 text-[12px] text-app-muted hover:border-app-accent"
        >
          닫기
        </button>
      </div>

      {/* 효과 세그먼트 */}
      <div className="mb-2.5 flex gap-1 rounded-lg border border-app-border bg-app-bg p-0.5">
        {MOTION_EFFECTS.map((e) => (
          <button
            key={e.key}
            onClick={() => save({ ...cfg, effect: e.key })}
            className={`flex-1 rounded-md py-1.5 text-[12px] font-semibold transition-colors ${
              cfg.effect === e.key ? "bg-white text-app-text shadow-sm" : "text-app-muted"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      {/* 간격 슬라이더 */}
      <div className="mb-3 flex items-center gap-2.5">
        <span className="w-9 text-[11.5px] text-app-muted">간격</span>
        <input
          type="range"
          min={100}
          max={600}
          step={50}
          value={cfg.stagger}
          onChange={(e) => save({ ...cfg, stagger: Number(e.target.value) })}
          className="flex-1 accent-app-accent"
        />
        <span className="w-12 text-right text-[11.5px] font-semibold tabular-nums">
          {cfg.stagger}ms
        </span>
      </div>

      {/* 트랙 리스트 */}
      <div className="space-y-1.5">
        {TRACKS.map((t, i) => {
          const on = cfg.tracks[t.key];
          return (
            <div key={t.key} className="flex items-center gap-2">
              <span className="w-4 text-center text-[10.5px] text-app-faint">{i + 1}</span>
              <button
                onClick={() => save({ ...cfg, tracks: { ...cfg.tracks, [t.key]: !on } })}
                className={`w-16 shrink-0 rounded-md border px-1.5 py-1 text-[11px] font-semibold ${
                  on
                    ? "border-app-accent bg-app-accent-soft text-app-text"
                    : "border-app-border bg-white text-app-faint"
                }`}
              >
                {t.name}
              </button>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-app-bg">
                <span
                  className="absolute top-0 left-0 h-full rounded-full bg-app-accent/60"
                  style={{ width: on ? t.barW : "0%", marginLeft: on ? `${i * 12}%` : 0 }}
                />
              </div>
              <span className="w-12 text-right text-[10.5px] text-app-faint">
                {on ? `+${i * cfg.stagger}ms` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-2.5 text-[10.5px] leading-snug text-app-faint">
        발표 모드 슬라이드 진입 시 자동 재생됩니다.
      </p>
    </div>
  );
}
