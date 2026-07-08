import { useState } from "react";
import { decomposeChart } from "../../engine/chartDecompose";
import type { SlideDims, SlideElement } from "../../engine/schema";
import { SLIDE_H, SLIDE_W } from "../../engine/schema";
import { markInternalUpdate } from "../../engine/fabricSync";
import type { Theme } from "../../engine/themes";
import { resolveColor, resolveRoleColor } from "../../engine/themes";
import { canvasApi } from "./canvasApi";
import { useDeckStore } from "../../store/deckStore";
import { useUiStore } from "../../store/uiStore";
import { showToast } from "../ui/toast";

// 서식 복사/붙여넣기 (format painter) — 텍스트 스타일 클립보드 (모듈 레벨)
type TextStyle = Partial<
  Pick<
    Extract<SlideElement, { type: "text" }>,
    "fontWeight" | "fontSize" | "color" | "align" | "lineHeight" | "letterSpacing" | "italic" | "underline" | "strike"
  >
>;
let styleClipboard: TextStyle | null = null;

interface Props {
  slideId: string;
  element: SlideElement | null;
  theme: Theme;
  dims?: SlideDims;
  onReplaceImage?: (elId: string, tab: "image" | "ai") => void;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-2.5 text-[11px] font-bold tracking-[.06em] text-app-faint">{children}</p>
  );
}

// 레이아웃 미니 프리뷰 그래픽 (프로토타입 속성 패널)
function MiniLayout({ id }: { id: string }) {
  const bar = "h-[2px] rounded-full bg-[#8A8A84]";
  const line = "h-[1.5px] rounded-full bg-[#C9C9C4]";
  if (id === "cover")
    return (
      <>
        <span className={`${bar} w-1/3`} />
        <span className={`${line} w-3/4`} />
      </>
    );
  if (id === "title-bullets")
    return (
      <>
        <span className={`${bar} w-2/5`} />
        <span className={`${line} w-full`} />
        <span className={`${line} w-4/5`} />
      </>
    );
  if (id === "title-bullets-chart")
    return (
      <div className="flex h-full items-center gap-1">
        <span className="h-4 w-[1.5px] rounded bg-app-accent" />
        <span className="flex flex-1 items-end gap-[2px]">
          <span className="w-1 rounded-t bg-[#8A8A84]" style={{ height: 8 }} />
          <span className="w-1 rounded-t bg-[#8A8A84]" style={{ height: 12 }} />
          <span className="w-1 rounded-t bg-[#8A8A84]" style={{ height: 6 }} />
        </span>
      </div>
    );
  if (id === "kpi-cards")
    return (
      <div className="flex h-full items-center gap-[3px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-4 flex-1 rounded-[2px] bg-app-accent/50" />
        ))}
      </div>
    );
  if (id === "chart-focus")
    return <span className="my-auto h-5 w-full rounded bg-[#C9C9C4]" />;
  if (id === "two-column")
    return (
      <div className="flex h-full flex-col justify-center gap-[3px]">
        <span className="h-[3px] w-full rounded-sm bg-[#8A8A84]" />
        <span className="h-[3px] w-full rounded-sm bg-[#C9C9C4]" />
        <span className="h-[3px] w-full rounded-sm bg-[#C9C9C4]" />
      </div>
    );
  // section
  return <span className="my-auto h-[2px] w-2/3 self-center rounded-full bg-app-accent" />;
}

function ValueRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-app-border px-2.5 py-1.5 focus-within:border-app-accent">
      <span className="text-[12px] text-app-faint">{label}</span>
      <input
        type="number"
        className="w-16 bg-transparent text-right text-[12.5px] font-semibold focus:!outline-none"
        value={Math.round(value)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </div>
  );
}

const TARGET_LABEL: Record<SlideElement["type"], string> = {
  text: "TEXT",
  shape: "SHAPE",
  chart: "CHART",
  image: "IMAGE",
  table: "TABLE",
  path: "PEN",
};

export function PropertiesPanel({
  slideId,
  element,
  theme,
  dims = { w: SLIDE_W, h: SLIDE_H },
  onReplaceImage,
}: Props) {
  const updateElement = useDeckStore((s) => s.updateElement);
  const [lockAspect, setLockAspect] = useState(true); // 이미지/유튜브 비율 잠금(기본 켬)

  if (!element) {
    const cur = useDeckStore.getState().deck?.slides.find((s) => s.id === slideId);
    const setSlide = (patch: Partial<import("../../engine/schema").Slide>) => {
      const st = useDeckStore.getState();
      const sl = st.deck?.slides.find((s) => s.id === slideId);
      if (sl) st.replaceSlide(slideId, { ...sl, ...patch });
    };
    return (
      <div className="flex flex-col gap-4 px-4 py-4">
        {/* 슬라이드 배경 — 미니 프리뷰 (프로토타입) */}
        <div>
          <SectionLabel>슬라이드 배경</SectionLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                ["theme", "테마 기본", theme.bg],
                ["tint", "틴트", theme.surface],
                ["gradient", "그라디언트", `linear-gradient(135deg, ${theme.bg}, ${theme.surface})`],
                ["spot", "스포트", `radial-gradient(circle at 30% 30%, ${theme.accent}44, ${theme.bg})`],
              ] as const
            ).map(([bg, label, preview]) => {
              const on = (cur?.background ?? "theme") === bg;
              return (
                <button
                  key={bg}
                  onClick={() => setSlide({ background: bg === "theme" ? undefined : bg })}
                  title={label}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-1 ${
                    on ? "border-[1.5px] border-app-text" : "border-app-border hover:border-app-accent"
                  }`}
                >
                  <span className="h-7 w-full rounded" style={{ background: preview, border: "1px solid rgba(0,0,0,.06)" }} />
                  <span className={`text-[9px] font-semibold ${on ? "text-app-text" : "text-app-faint"}`}>{label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-app-faint">
            이 슬라이드에만 적용 · 테마를 바꾸면 '테마 기본'만 재해석됩니다
          </p>
        </div>
        {/* 슬라이드 레이아웃 스위처 — 미니 프리뷰 (프로토타입) */}
        <div>
          <SectionLabel>슬라이드 레이아웃</SectionLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                ["cover", "표지"],
                ["title-bullets", "불릿"],
                ["title-bullets-chart", "차트"],
                ["kpi-cards", "KPI"],
                ["chart-focus", "이미지"],
                ["two-column", "표"],
                ["section", "섹션"],
              ] as const
            ).map(([lo, label]) => {
              const on = cur?.layout === lo;
              return (
                <button
                  key={lo}
                  onClick={() => {
                    setSlide({ layout: lo });
                    showToast(`레이아웃을 '${label}'(으)로 바꿨어요`);
                  }}
                  title={label}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 ${
                    on ? "border-[1.5px] border-app-text bg-app-bg" : "border-app-border bg-white hover:border-app-accent"
                  }`}
                >
                  <span className="flex h-8 w-full flex-col justify-center gap-[3px] rounded bg-app-border-soft px-1.5">
                    <MiniLayout id={lo} />
                  </span>
                  <span className={`text-[9.5px] font-semibold ${on ? "text-app-text" : "text-app-faint"}`}>{label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-app-faint">
            레이아웃을 바꾸면 아웃라인의 시각화 설정도 함께 바뀝니다.
          </p>
        </div>
        <button
          onClick={() => {
            useDeckStore.getState().tidySlide(slideId, dims);
            showToast("슬라이드를 자동 정리했어요 — 여백 안으로 배치 + 회전 초기화");
          }}
          className="rounded-lg border border-app-border bg-white py-2 text-[12.5px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
        >
          <span className="mi align-middle text-[14px] mr-1">auto_fix_high</span>슬라이드 자동 정리
        </button>
      </div>
    );
  }

  // line/arrow는 채우기가 아니라 선(stroke)에 색이 들어간다
  const isLineArrow =
    element.type === "shape" && (element.shape === "line" || element.shape === "arrow");
  // opacity·rotation만 라이브 반영(모든 객체·그룹에 안전) → 슬라이더 드래그가 매끄럽게.
  // 색/획 등 그룹 자식 재빌드가 필요한 값은 정상 재렌더로 처리한다.
  const LIVE_KEYS = new Set(["opacity", "rotation"]);

  const patch = (p: Partial<SlideElement>) => {
    updateElement(slideId, element.id, p);
    const keys = Object.keys(p);
    if (keys.length === 0 || !keys.every((k) => LIVE_KEYS.has(k))) return; // 재빌드 필요 → 정상 재렌더
    const pp = p as Record<string, unknown>;
    const fp: Record<string, unknown> = {};
    if ("opacity" in pp) fp.opacity = pp.opacity;
    if ("rotation" in pp) fp.angle = pp.rotation;
    canvasApi()?.patchActive(fp);
    markInternalUpdate(); // store 변경 발 재렌더를 스킵 → 슬라이더 드래그가 매끄럽게
  };

  const currentColor = (): string => {
    if (element.type === "text") {
      return element.color
        ? resolveColor(theme, element.color)
        : resolveRoleColor(theme, element.role);
    }
    if (element.type === "shape") {
      if (element.shape === "line" || element.shape === "arrow") {
        return element.stroke ? resolveColor(theme, element.stroke) : theme.accent;
      }
      return element.fill ? resolveColor(theme, element.fill) : theme.accent;
    }
    return "#000000";
  };

  const fontSize =
    element.type === "text"
      ? (element.fontSize ?? theme.roleStyles[element.role].fontSize)
      : 0;
  const align = element.type === "text" ? (element.align ?? "left") : "left";

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-app-border-soft px-4 py-3">
        <span className="text-[13.5px] font-bold">
          속성 — {TARGET_LABEL[element.type]}
        </span>
        <span className="font-mono text-[11px] text-app-faint">{element.id}</span>
      </div>

      <div className="border-b border-app-border-soft px-4 py-3.5">
        <SectionLabel>Position</SectionLabel>
        {/* 슬라이드 기준 정렬 6종 (스냅덱 Design 패널) */}
        <div className="mb-2 grid grid-cols-6 gap-1.5">
          {(
            [
              ["format_align_left", "왼쪽 정렬", { x: 0 }],
              ["format_align_center", "가로 중앙", { x: Math.round((dims.w - element.w) / 2) }],
              ["format_align_right", "오른쪽 정렬", { x: dims.w - element.w }],
              ["vertical_align_top", "위 정렬", { y: 0 }],
              ["vertical_align_center", "세로 중앙", { y: Math.round((dims.h - element.h) / 2) }],
              ["vertical_align_bottom", "아래 정렬", { y: dims.h - element.h }],
            ] as const
          ).map(([glyph, title, p]) => (
            <button
              key={title}
              title={title}
              onClick={() => patch(p as Partial<SlideElement>)}
              className="flex items-center justify-center rounded-md border border-app-border bg-white py-1.5 text-app-muted hover:border-app-accent hover:text-app-accent"
            >
              <span className="mi text-[17px]">{glyph}</span>
            </button>
          ))}
        </div>
        {(() => {
          // 이미지/유튜브는 비율 잠금 시 한 축 변경이 다른 축을 비례로 조정(잘림 방지)
          const ratio = element.w > 0 && element.h > 0 ? element.w / element.h : 1;
          const lockable = element.type === "image";
          const locked = lockable && lockAspect;
          const setW = (w: number) =>
            patch(locked ? { w, h: Math.max(1, Math.round(w / ratio)) } : { w });
          const setH = (h: number) =>
            patch(locked ? { h, w: Math.max(1, Math.round(h * ratio)) } : { h });
          return (
            <>
              <div className="grid grid-cols-2 gap-2">
                <ValueRow label="X" value={element.x} onChange={(x) => patch({ x })} />
                <ValueRow label="Y" value={element.y} onChange={(y) => patch({ y })} />
                <ValueRow label="W" value={element.w} onChange={setW} />
                <ValueRow label="H" value={element.h} onChange={setH} />
                <ValueRow
                  label="회전"
                  value={element.rotation ?? 0}
                  onChange={(rotation) => patch({ rotation })}
                />
              </div>
              {lockable && (
                <button
                  onClick={() => setLockAspect((v) => !v)}
                  className={`mt-2 flex w-full items-center justify-center gap-1 rounded-md border py-1.5 text-[11px] font-semibold ${
                    locked
                      ? "border-app-accent bg-app-accent-soft text-app-accent"
                      : "border-app-border bg-white text-app-muted hover:border-app-accent"
                  }`}
                >
                  <span className="mi text-[14px]">{locked ? "lock" : "lock_open"}</span>
                  {locked ? "비율 유지 켜짐 — W/H 함께 조절" : "비율 유지 꺼짐"}
                </button>
              )}
            </>
          );
        })()}
      </div>

      <div className="border-b border-app-border-soft px-4 py-3.5">
        <SectionLabel>요소 순서 (z-order) · 잠금</SectionLabel>
        <div className="mb-2 grid grid-cols-4 gap-1.5">
          {(
            [
              ["back", "맨 뒤", "flip_to_back"],
              ["backward", "뒤로", "move_down"],
              ["forward", "앞으로", "move_up"],
              ["front", "맨 앞", "flip_to_front"],
            ] as const
          ).map(([dir, label, glyph]) => (
            <button
              key={dir}
              onClick={() => useDeckStore.getState().reorderElement(slideId, element.id, dir)}
              className="flex flex-col items-center gap-0.5 rounded-md border border-app-border bg-white py-1.5 text-[10.5px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
            >
              <span className="mi text-[15px]">{glyph}</span>
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            patch({ locked: !element.locked || undefined } as Partial<SlideElement>);
            showToast(element.locked ? "잠금이 해제됐어요" : "요소가 잠겼어요 — 캔버스 조작이 차단됩니다");
          }}
          className={`w-full rounded-md border py-1.5 text-[11.5px] font-semibold ${
            element.locked
              ? "border-app-accent bg-app-accent-soft text-app-accent"
              : "border-app-border bg-white text-app-muted hover:border-app-accent hover:text-app-accent"
          }`}
        >
          <><span className="mi align-middle text-[14px] mr-1">{element.locked ? "lock" : "lock_open"}</span>{element.locked ? "잠김 — 클릭해서 해제" : "요소 잠금"}</>
        </button>
      </div>

      <div className="border-b border-app-border-soft px-4 py-3.5">
        <SectionLabel>모양 Appearance</SectionLabel>
        {/* 불투명도 슬라이더 */}
        <div className="mb-2 flex items-center gap-2.5">
          <span className="w-14 flex-none text-[11.5px] text-app-faint">불투명도</span>
          <input
            type="range"
            min={20}
            max={100}
            value={Math.round((element.opacity ?? 1) * 100)}
            onChange={(e) => patch({ opacity: Number(e.target.value) / 100 })}
            className="flex-1 accent-app-accent"
          />
          <span className="w-8 flex-none text-right text-[11.5px] font-semibold">
            {Math.round((element.opacity ?? 1) * 100)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {element.type === "shape" &&
            (element.shape === "roundRect" || element.shape === "pill") && (
              <ValueRow
                label="라운드"
                value={element.radius ?? 16}
                onChange={(radius) => patch({ radius: Math.max(0, radius) } as Partial<SlideElement>)}
              />
            )}
          {element.type === "shape" && (
            <ValueRow
              label="Stroke"
              value={element.strokeWidth ?? 0}
              onChange={(v) => patch({ strokeWidth: Math.max(0, Math.min(20, v)) } as Partial<SlideElement>)}
            />
          )}
        </div>
        {/* 그림자 토글 */}
        <button
          onClick={() => patch({ shadow: !element.shadow || undefined })}
          className={`mt-2 w-full rounded-lg border py-1.5 text-[11.5px] font-semibold ${
            element.shadow
              ? "border-app-accent bg-app-accent-soft text-app-accent"
              : "border-app-border bg-white text-app-muted hover:border-app-accent"
          }`}
        >
          {element.shadow ? "그림자 켜짐 — 끄기" : "그림자 효과"}
        </button>
      </div>

      {element.type === "chart" && (
        <div className="border-b border-app-border-soft px-4 py-3.5">
          <SectionLabel>차트</SectionLabel>
          {/* 차트 타입 전환 */}
          <div className="mb-2.5 flex overflow-hidden rounded-lg border border-app-border">
            {(
              [
                ["bar", "막대", "bar_chart"],
                ["line", "선", "show_chart"],
                ["pie", "파이", "pie_chart"],
              ] as const
            ).map(([ct, label, glyph], i) => (
              <button
                key={ct}
                onClick={() => patch({ chartType: ct } as Partial<SlideElement>)}
                className={`flex flex-1 items-center justify-center gap-1 py-1.5 text-[11.5px] font-semibold ${i > 0 ? "border-l border-app-border" : ""} ${
                  element.chartType === ct
                    ? "bg-app-accent-soft text-app-accent"
                    : "bg-white text-app-faint hover:bg-app-bg"
                }`}
              >
                <span className="mi text-[14px]">{glyph}</span>
                {label}
              </button>
            ))}
          </div>
          {/* 데이터 편집 (label + series[0].value) */}
          <p className="mb-1.5 text-[11px] font-bold tracking-[.06em] text-app-faint">데이터</p>
          <div className="flex flex-col gap-1.5">
            {element.labels.map((lb, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={lb}
                  onChange={(e) => {
                    const labels = [...element.labels];
                    labels[i] = e.target.value;
                    patch({ labels } as Partial<SlideElement>);
                  }}
                  className="min-w-0 flex-1 rounded-md border border-app-border px-2 py-1 text-[11.5px] focus:border-app-accent focus:outline-none"
                />
                <input
                  type="number"
                  value={element.series[0]?.values[i] ?? 0}
                  onChange={(e) => {
                    const series = element.series.map((s, si) =>
                      si === 0
                        ? { ...s, values: s.values.map((v, vi) => (vi === i ? Number(e.target.value) : v)) }
                        : s,
                    );
                    patch({ series } as Partial<SlideElement>);
                  }}
                  className="w-16 flex-none rounded-md border border-app-border px-2 py-1 text-right text-[11.5px] font-semibold focus:border-app-accent focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (element.labels.length <= 2) return;
                    patch({
                      labels: element.labels.filter((_, x) => x !== i),
                      series: element.series.map((s) => ({ ...s, values: s.values.filter((_, x) => x !== i) })),
                    } as Partial<SlideElement>);
                  }}
                  className="flex-none px-1 text-[13px] text-app-faint hover:text-app-danger"
                ><span className="mi text-[14px]">close</span></button>
              </div>
            ))}
          </div>
          {element.labels.length < 6 && (
            <button
              onClick={() =>
                patch({
                  labels: [...element.labels, `항목 ${element.labels.length + 1}`],
                  series: element.series.map((s) => ({ ...s, values: [...s.values, 0] })),
                } as Partial<SlideElement>)
              }
              className="mt-1.5 w-full rounded-md border border-dashed border-app-border py-1 text-[11.5px] text-app-muted hover:border-app-accent hover:text-app-accent"
            >
              + 항목 추가
            </button>
          )}
          <button
            onClick={() => {
              const parts = decomposeChart(element, theme);
              useUiStore.getState().setSelectedElementId(null);
              useDeckStore.getState().explodeElement(slideId, element.id, parts);
              showToast("차트를 개별 요소로 분해했어요 — 조각을 선택해 수정하세요 (Ctrl+Z 복원)");
            }}
            className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-lg border border-app-border bg-white py-2 text-[12px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
          >
            <span className="mi text-[15px]">dashboard</span>개별 요소로 분해
          </button>
        </div>
      )}

      {element.type === "table" && (
        <div className="border-b border-app-border-soft px-4 py-3.5">
          <SectionLabel>표 편집</SectionLabel>
          <button
            onClick={() => patch({ headerRow: !element.headerRow || undefined } as Partial<SlideElement>)}
            className={`mb-2 w-full rounded-md border py-1.5 text-[11.5px] font-semibold ${
              element.headerRow ? "border-app-accent bg-app-accent-soft text-app-accent" : "border-app-border bg-white text-app-muted"
            }`}
          >
            {element.headerRow ? "첫 행 헤더 켜짐" : "첫 행을 헤더로"}
          </button>
          <div className="flex flex-col gap-1">
            {element.rows.map((row, r) => (
              <div key={r} className="flex items-center gap-1">
                {row.map((cell, c) => (
                  <input
                    key={c}
                    value={cell}
                    onChange={(e) => {
                      const rows = element.rows.map((rr, ri) =>
                        ri === r ? rr.map((cc, ci) => (ci === c ? e.target.value : cc)) : rr,
                      );
                      patch({ rows } as Partial<SlideElement>);
                    }}
                    className="min-w-0 flex-1 rounded border border-app-border px-1.5 py-1 text-[11px] focus:border-app-accent focus:outline-none"
                  />
                ))}
                <button
                  onClick={() => {
                    if (element.rows.length <= 1) return;
                    patch({ rows: element.rows.filter((_, ri) => ri !== r) } as Partial<SlideElement>);
                  }}
                  className="flex-none px-1 text-[12px] text-app-faint hover:text-app-danger"
                ><span className="mi text-[14px]">close</span></button>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={() => {
                const cols = Math.max(1, ...element.rows.map((r) => r.length));
                patch({ rows: [...element.rows, Array(cols).fill("")] } as Partial<SlideElement>);
              }}
              className="flex-1 rounded-md border border-dashed border-app-border py-1 text-[11px] text-app-muted hover:border-app-accent"
            >
              + 행
            </button>
            <button
              onClick={() => patch({ rows: element.rows.map((r) => [...r, ""]) } as Partial<SlideElement>)}
              className="flex-1 rounded-md border border-dashed border-app-border py-1 text-[11px] text-app-muted hover:border-app-accent"
            >
              + 열
            </button>
          </div>
        </div>
      )}

      {element.type === "image" && (
        <div className="border-b border-app-border-soft px-4 py-3.5">
          <SectionLabel>이미지</SectionLabel>
          {/* 자르기(맞춤 방식) — 채우기(cover)/맞춤(contain) */}
          <div className="mb-2 flex overflow-hidden rounded-lg border border-app-border">
            {(
              [
                ["cover", "채우기", "crop"],
                ["contain", "맞춤", "fit_screen"],
              ] as const
            ).map(([ft, label, glyph], i) => (
              <button
                key={ft}
                onClick={() => patch({ fit: ft } as Partial<SlideElement>)}
                className={`flex flex-1 items-center justify-center gap-1 py-1.5 text-[11.5px] font-semibold ${i > 0 ? "border-l border-app-border" : ""} ${
                  (element.fit ?? "cover") === ft
                    ? "bg-app-accent-soft text-app-accent"
                    : "bg-white text-app-faint hover:bg-app-bg"
                }`}
              >
                <span className="mi text-[14px]">{glyph}</span>
                {label}
              </button>
            ))}
          </div>
          {/* 이미지 교체 — Pexels/GIPHY/업로드(image 탭) · AI 생성(ai 탭) */}
          <div className="flex gap-1.5">
            <button
              onClick={() => onReplaceImage?.(element.id, "image")}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-app-border bg-white py-1.5 text-[11.5px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
            >
              <span className="mi text-[14px]">swap_horiz</span>이미지 교체
            </button>
            <button
              onClick={() => onReplaceImage?.(element.id, "ai")}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-app-border bg-white py-1.5 text-[11.5px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
            >
              <span className="mi text-[14px]">auto_awesome</span>AI 생성
            </button>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-app-faint">
            '채우기'는 프레임을 꽉 채워 자르고, '맞춤'은 잘림 없이 전체를 담습니다.
          </p>
        </div>
      )}

      {(element.type === "text" || element.type === "shape") && (
        <div className="border-b border-app-border-soft px-4 py-3.5">
          <SectionLabel>{element.type === "text" ? "글자색" : isLineArrow ? "선 색" : "채우기"}</SectionLabel>
          {/* 빠른 색 스와치 (테마기본/액센트/레드/그린/앰버) */}
          <div className="mb-2 flex gap-1.5">
            {(
              [
                ["테마 기본", element.type === "text" ? undefined : "@accent"],
                ["액센트", theme.accent],
                ["레드", "#E5484D"],
                ["그린", "#1E9C5B"],
                ["앰버", "#E0701F"],
              ] as const
            ).map(([label, val]) => (
              <button
                key={label}
                title={label}
                onClick={() =>
                  element.type === "text"
                    ? patch({ color: val } as Partial<SlideElement>)
                    : isLineArrow
                      ? patch({ stroke: (val as string) ?? "@accent" } as Partial<SlideElement>)
                      : patch({ fill: val ?? "@accent" } as Partial<SlideElement>)
                }
                className="h-6 flex-1 rounded-md border border-black/10"
                style={{ background: val ? resolveColor(theme, val) : "#E4E4E0" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-app-border px-2.5 py-1.5">
            <input
              type="color"
              className="h-6 w-9 cursor-pointer rounded border border-app-border"
              value={currentColor()}
              onChange={(e) =>
                element.type === "text"
                  ? patch({ color: e.target.value } as Partial<SlideElement>)
                  : isLineArrow
                    ? patch({ stroke: e.target.value } as Partial<SlideElement>)
                    : patch({ fill: e.target.value } as Partial<SlideElement>)
              }
            />
            <span className="flex-1 font-mono text-[12px] font-semibold">
              {currentColor().toUpperCase()}
            </span>
            {((element.type === "text" && !element.color) ||
              (element.type === "shape" && !element.fill)) && (
              <span className="rounded bg-app-bg px-1.5 py-0.5 text-[9.5px] font-semibold text-app-faint">
                테마 {element.type === "text" ? "role" : "surface"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-app-faint">
            색·크기를 비우면 테마 기본값을 따릅니다. 테마 변경 시 자동 재해석됩니다.
          </p>
          {/* Fill 타입 (Solid/Linear/Circular) — 도형 전용 (P3) */}
          {element.type === "shape" && (
            <div className="mt-2 flex overflow-hidden rounded-lg border border-app-border">
              {(
                [
                  ["solid", "Solid"],
                  ["linear", "Linear"],
                  ["circular", "Circular"],
                ] as const
              ).map(([ft, label], i) => (
                <button
                  key={ft}
                  onClick={() =>
                    patch({ fillType: ft === "solid" ? undefined : ft } as Partial<SlideElement>)
                  }
                  className={`flex-1 py-1.5 text-[11px] font-semibold ${i > 0 ? "border-l border-app-border" : ""} ${
                    (element.fillType ?? "solid") === ft
                      ? "bg-app-accent-soft text-app-accent"
                      : "bg-white text-app-faint hover:bg-app-bg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {element.type === "text" && (
        <div className="border-b border-app-border-soft px-4 py-3.5">
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>Typography</SectionLabel>
            {/* 서식 복사/붙여넣기 (format painter) */}
            <div className="flex gap-1">
              <button
                onClick={() => {
                  styleClipboard = {
                    fontWeight: element.fontWeight,
                    fontSize: element.fontSize,
                    color: element.color,
                    align: element.align,
                    lineHeight: element.lineHeight,
                    letterSpacing: element.letterSpacing,
                    italic: element.italic,
                    underline: element.underline,
                    strike: element.strike,
                  };
                  showToast("서식을 복사했어요 — 다른 텍스트에서 붙여넣기");
                }}
                className="rounded-md border border-app-border bg-white px-2 py-0.5 text-[10.5px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
              >
                서식 복사
              </button>
              <button
                disabled={!styleClipboard}
                onClick={() => {
                  if (styleClipboard) patch(styleClipboard as Partial<SlideElement>);
                }}
                className="rounded-md border border-app-border bg-white px-2 py-0.5 text-[10.5px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent disabled:opacity-40"
              >
                붙여넣기
              </button>
            </div>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            {/* Weight 셀렉트 */}
            <div className="flex items-center justify-between rounded-lg border border-app-border px-2.5 py-1.5">
              <span className="text-[12px] text-app-faint">Weight</span>
              <select
                value={element.fontWeight ?? theme.roleStyles[element.role].fontWeight}
                onChange={(e) =>
                  patch({ fontWeight: Number(e.target.value) } as Partial<SlideElement>)
                }
                className="bg-transparent text-right text-[12.5px] font-semibold focus:!outline-none"
              >
                {[
                  [400, "Regular"],
                  [500, "Medium"],
                  [600, "SemiBold"],
                  [700, "Bold"],
                  [800, "ExtraBold"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <ValueRow
              label="행간 %"
              value={Math.round((element.lineHeight ?? 1.4) * 100)}
              onChange={(v) =>
                patch({ lineHeight: Math.max(80, Math.min(300, v)) / 100 } as Partial<SlideElement>)
              }
            />
            <ValueRow
              label="자간 px"
              value={element.letterSpacing ?? 0}
              onChange={(v) =>
                patch({ letterSpacing: Math.max(-20, Math.min(100, v)) || undefined } as Partial<SlideElement>)
              }
            />
            {/* Decoration — B I U S */}
            <div className="flex overflow-hidden rounded-lg border border-app-border">
              {(
                [
                  ["B", "굵게", (element.fontWeight ?? theme.roleStyles[element.role].fontWeight) >= 600, () => patch({ fontWeight: (element.fontWeight ?? theme.roleStyles[element.role].fontWeight) >= 600 ? 400 : 700 } as Partial<SlideElement>)],
                  ["I", "기울임", !!element.italic, () => patch({ italic: !element.italic || undefined } as Partial<SlideElement>)],
                  ["U", "밑줄", !!element.underline, () => patch({ underline: !element.underline || undefined } as Partial<SlideElement>)],
                  ["S", "취소선", !!element.strike, () => patch({ strike: !element.strike || undefined } as Partial<SlideElement>)],
                ] as const
              ).map(([glyph, title, active, onClick], i) => (
                <button
                  key={glyph}
                  title={title}
                  onClick={onClick}
                  className={`flex-1 py-1.5 text-[12.5px] ${i > 0 ? "border-l border-app-border" : ""} ${
                    glyph === "B" ? "font-bold" : glyph === "I" ? "italic" : glyph === "U" ? "underline" : "line-through"
                  } ${active ? "bg-app-accent-soft text-app-accent" : "bg-white text-app-faint hover:bg-app-bg"}`}
                >
                  {glyph}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center overflow-hidden rounded-lg border border-app-border">
              <button
                onClick={() =>
                  patch({ fontSize: Math.max(8, fontSize - 2) } as Partial<SlideElement>)
                }
                className="border-r border-app-border bg-white px-2.5 py-1.5 text-[13px] text-app-muted hover:bg-app-bg"
              ><span className="mi text-[16px]">remove</span></button>
              <span className="flex-1 text-center text-[12.5px] font-semibold">
                {fontSize}px
              </span>
              <button
                onClick={() => patch({ fontSize: fontSize + 2 } as Partial<SlideElement>)}
                className="border-l border-app-border bg-white px-2.5 py-1.5 text-[13px] text-app-muted hover:bg-app-bg"
              >
                +
              </button>
            </div>
            <div className="flex flex-[1.3] overflow-hidden rounded-lg border border-app-border">
              {(
                [
                  ["left", "format_align_left"],
                  ["center", "format_align_center"],
                  ["right", "format_align_right"],
                ] as const
              ).map(([a, glyph], i) => (
                <button
                  key={a}
                  title={a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"}
                  onClick={() => patch({ align: a } as Partial<SlideElement>)}
                  className={`flex flex-1 items-center justify-center py-1.5 ${
                    i === 1 ? "border-x border-app-border" : ""
                  } ${align === a ? "bg-app-accent-soft text-app-accent" : "bg-white text-app-faint hover:bg-app-bg"}`}
                >
                  <span className="mi text-[16px]">{glyph}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 px-4 py-3.5">
        {/* 속성 초기화 — 명시 오버라이드를 지우고 테마 기본값으로 (프로토타입) */}
        <button
          onClick={() => {
            const reset: Record<string, unknown> = { opacity: undefined, rotation: undefined, shadow: undefined };
            if (element.type === "text") {
              Object.assign(reset, {
                color: undefined,
                fontSize: undefined,
                fontWeight: undefined,
                lineHeight: undefined,
                letterSpacing: undefined,
                italic: undefined,
                underline: undefined,
                strike: undefined,
                align: undefined,
              });
            } else if (element.type === "shape") {
              Object.assign(reset, { fill: undefined, stroke: undefined, strokeWidth: undefined, fillType: undefined });
            }
            patch(reset as Partial<SlideElement>);
            showToast("속성을 테마 기본값으로 초기화했어요");
          }}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-app-border bg-white py-2 text-[12px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
        >
          <span className="mi text-[15px]">restart_alt</span>속성 초기화
        </button>
        <div className="rounded-lg border border-app-border-soft bg-[#FBFBFA] p-2.5 text-[11.5px] leading-relaxed text-app-muted">
          색·크기를 지정하지 않은 값은 테마 기본값을 따르고, 테마 변경 시 자동으로
          재해석됩니다.
        </div>
      </div>
    </div>
  );
}
