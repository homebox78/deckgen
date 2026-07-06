import type { SlideElement, TextElement } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { resolveColor, resolveRoleColor } from "../../engine/themes";
import { useDeckStore } from "../../store/deckStore";

interface Props {
  slideId: string;
  element: SlideElement | null;
  theme: Theme;
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-8 shrink-0 text-app-muted">{label}</span>
      <input
        type="number"
        className="w-full rounded-md border border-app-border px-2 py-1"
        value={Math.round(value)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

export function PropertiesPanel({ slideId, element, theme }: Props) {
  const updateElement = useDeckStore((s) => s.updateElement);

  if (!element) {
    return (
      <p className="p-4 text-sm text-app-muted">
        캔버스에서 요소를 선택하면 속성이 표시됩니다.
      </p>
    );
  }

  const patch = (p: Partial<SlideElement>) => updateElement(slideId, element.id, p);

  const currentColor = (): string => {
    if (element.type === "text") {
      const t = element as TextElement;
      return t.color ? resolveColor(theme, t.color) : resolveRoleColor(theme, t.role);
    }
    if (element.type === "shape") {
      return element.fill ? resolveColor(theme, element.fill) : theme.accent;
    }
    return "#000000";
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-xs font-medium tracking-wide text-app-muted uppercase">
        {element.type} · {element.id}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={element.x} onChange={(x) => patch({ x })} />
        <NumberField label="Y" value={element.y} onChange={(y) => patch({ y })} />
        <NumberField label="W" value={element.w} onChange={(w) => patch({ w })} />
        <NumberField label="H" value={element.h} onChange={(h) => patch({ h })} />
        <NumberField
          label="회전"
          value={element.rotation ?? 0}
          onChange={(rotation) => patch({ rotation })}
        />
      </div>

      {(element.type === "text" || element.type === "shape") && (
        <label className="flex items-center gap-2 text-sm">
          <span className="w-16 shrink-0 text-app-muted">
            {element.type === "text" ? "글자색" : "채우기"}
          </span>
          <input
            type="color"
            className="h-8 w-16 cursor-pointer rounded border border-app-border"
            value={currentColor()}
            onChange={(e) =>
              element.type === "text"
                ? patch({ color: e.target.value } as Partial<SlideElement>)
                : patch({ fill: e.target.value } as Partial<SlideElement>)
            }
          />
        </label>
      )}

      {element.type === "text" && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-16 shrink-0 text-app-muted">크기</span>
            <input
              type="number"
              className="w-full rounded-md border border-app-border px-2 py-1"
              value={element.fontSize ?? theme.roleStyles[element.role].fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) patch({ fontSize: v } as Partial<SlideElement>);
              }}
            />
          </label>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-16 shrink-0 text-app-muted">정렬</span>
            <div className="flex overflow-hidden rounded-md border border-app-border">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => patch({ align: a } as Partial<SlideElement>)}
                  className={`px-3 py-1 ${
                    (element.align ?? "left") === a
                      ? "bg-app-accent text-white"
                      : "bg-white hover:bg-app-bg"
                  }`}
                >
                  {a === "left" ? "좌" : a === "center" ? "중" : "우"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
