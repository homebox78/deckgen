import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export interface DropdownItem {
  key: string;
  name: string;
  swatch?: string; // 좌측 색상 칩
  badge?: string; // 우측 보조 배지 (예: "2차")
  disabled?: boolean;
}

interface Props {
  items: DropdownItem[];
  activeKey?: string;
  onSelect: (key: string) => void;
  children: ReactNode; // 트리거 버튼 내용
  triggerClassName: string;
  align?: "left" | "right";
  title?: string;
}

/** 디자인 시안의 커스텀 드롭다운 (테마/시각화/삽입 공용) */
export function Dropdown({
  items,
  activeKey,
  onSelect,
  children,
  triggerClassName,
  align = "left",
  title,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target))
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
        data-open={open || undefined}
      >
        {children}
      </button>
      {open && (
        <div
          className={`absolute top-[calc(100%+6px)] z-50 min-w-44 rounded-xl border border-app-border bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,.16)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled) return;
                onSelect(it.key);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] whitespace-nowrap ${
                it.key === activeKey
                  ? "bg-app-accent-soft font-bold"
                  : "font-medium hover:bg-app-accent-soft/60"
              } ${it.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
            >
              {it.swatch && (
                <span
                  className="h-3 w-3 shrink-0 rounded-[3px] border border-black/10"
                  style={{ background: it.swatch }}
                />
              )}
              <span className="flex-1 text-app-text">{it.name}</span>
              {it.badge && (
                <span className="rounded-[5px] bg-app-border-soft px-1.5 py-0.5 text-[10px] font-semibold text-app-faint">
                  {it.badge}
                </span>
              )}
              {it.key === activeKey && (
                <span className="text-[11px] font-bold text-app-accent">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
