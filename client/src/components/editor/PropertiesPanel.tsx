import { decomposeChart } from "../../engine/chartDecompose";
import type { SlideDims, SlideElement } from "../../engine/schema";
import { SLIDE_H, SLIDE_W } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { resolveColor, resolveRoleColor } from "../../engine/themes";
import { useDeckStore } from "../../store/deckStore";
import { useUiStore } from "../../store/uiStore";
import { showToast } from "../ui/toast";

interface Props {
  slideId: string;
  element: SlideElement | null;
  theme: Theme;
  dims?: SlideDims;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-2.5 text-[11px] font-bold tracking-[.06em] text-app-faint">{children}</p>
  );
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
};

export function PropertiesPanel({
  slideId,
  element,
  theme,
  dims = { w: SLIDE_W, h: SLIDE_H },
}: Props) {
  const updateElement = useDeckStore((s) => s.updateElement);

  if (!element) {
    return (
      <p className="px-4 py-6 text-center text-[12.5px] leading-relaxed text-app-faint">
        캔버스에서 요소를 선택하면
        <br />
        속성이 표시됩니다.
      </p>
    );
  }

  const patch = (p: Partial<SlideElement>) => updateElement(slideId, element.id, p);

  const currentColor = (): string => {
    if (element.type === "text") {
      return element.color
        ? resolveColor(theme, element.color)
        : resolveRoleColor(theme, element.role);
    }
    if (element.type === "shape") {
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
              ["⇤", "왼쪽 정렬", { x: 0 }],
              ["⇹", "가로 중앙", { x: Math.round((dims.w - element.w) / 2) }],
              ["⇥", "오른쪽 정렬", { x: dims.w - element.w }],
              ["⤒", "위 정렬", { y: 0 }],
              ["⇳", "세로 중앙", { y: Math.round((dims.h - element.h) / 2) }],
              ["⤓", "아래 정렬", { y: dims.h - element.h }],
            ] as const
          ).map(([glyph, title, p]) => (
            <button
              key={title}
              title={title}
              onClick={() => patch(p as Partial<SlideElement>)}
              className="rounded-md border border-app-border bg-white py-1 text-[12px] text-app-muted hover:border-app-accent hover:text-app-accent"
            >
              {glyph}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ValueRow label="X" value={element.x} onChange={(x) => patch({ x })} />
          <ValueRow label="Y" value={element.y} onChange={(y) => patch({ y })} />
          <ValueRow label="W" value={element.w} onChange={(w) => patch({ w })} />
          <ValueRow label="H" value={element.h} onChange={(h) => patch({ h })} />
          <ValueRow
            label="회전"
            value={element.rotation ?? 0}
            onChange={(rotation) => patch({ rotation })}
          />
        </div>
      </div>

      <div className="border-b border-app-border-soft px-4 py-3.5">
        <SectionLabel>Appearance</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <ValueRow
            label="투명도 %"
            value={Math.round((element.opacity ?? 1) * 100)}
            onChange={(v) =>
              patch({ opacity: Math.max(0, Math.min(100, v)) / 100 })
            }
          />
          {element.type === "shape" && element.shape === "roundRect" && (
            <ValueRow
              label="라운드"
              value={element.radius ?? 16}
              onChange={(radius) => patch({ radius: Math.max(0, radius) } as Partial<SlideElement>)}
            />
          )}
        </div>
      </div>

      {element.type === "chart" && (
        <div className="border-b border-app-border-soft px-4 py-3.5">
          <SectionLabel>차트 편집</SectionLabel>
          <button
            onClick={() => {
              const parts = decomposeChart(element, theme);
              useUiStore.getState().setSelectedElementId(null);
              useDeckStore.getState().explodeElement(slideId, element.id, parts);
              showToast("차트를 개별 요소로 분해했어요 — 조각을 선택해 수정하세요 (Ctrl+Z 복원)");
            }}
            className="w-full rounded-lg border border-app-border bg-white py-2 text-[12.5px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
          >
            ⛶ 개별 요소로 분해 (막대·라벨 개별 수정)
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-app-faint">
            더블클릭으로도 분해됩니다. 분해 후에는 PPTX에 도형으로 내보내집니다.
          </p>
        </div>
      )}

      {(element.type === "text" || element.type === "shape") && (
        <div className="border-b border-app-border-soft px-4 py-3.5">
          <SectionLabel>{element.type === "text" ? "글자색" : "채우기"}</SectionLabel>
          <div className="flex items-center gap-2.5 rounded-lg border border-app-border px-2.5 py-1.5">
            <input
              type="color"
              className="h-6 w-9 cursor-pointer rounded border border-app-border"
              value={currentColor()}
              onChange={(e) =>
                element.type === "text"
                  ? patch({ color: e.target.value } as Partial<SlideElement>)
                  : patch({ fill: e.target.value } as Partial<SlideElement>)
              }
            />
            <span className="font-mono text-[12px] font-semibold">
              {currentColor().toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {element.type === "text" && (
        <div className="border-b border-app-border-soft px-4 py-3.5">
          <SectionLabel>Typography</SectionLabel>
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
              >
                −
              </button>
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
                  ["left", "왼쪽"],
                  ["center", "가운데"],
                  ["right", "오른쪽"],
                ] as const
              ).map(([a, label], i) => (
                <button
                  key={a}
                  onClick={() => patch({ align: a } as Partial<SlideElement>)}
                  className={`flex-1 py-1.5 text-[11.5px] font-semibold ${
                    i === 1 ? "border-x border-app-border" : ""
                  } ${align === a ? "bg-app-accent-soft text-app-accent" : "bg-white text-app-faint hover:bg-app-bg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-3.5">
        <div className="rounded-lg border border-app-border-soft bg-[#FBFBFA] p-2.5 text-[11.5px] leading-relaxed text-app-muted">
          색·크기를 지정하지 않은 값은 테마 기본값을 따르고, 테마 변경 시 자동으로
          재해석됩니다.
        </div>
      </div>
    </div>
  );
}
