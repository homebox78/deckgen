// 개요 그리드 (Demo Act 5) — 전체 슬라이드 그리드 + 드래그 순서 변경 + 클릭 편집 이동
import { useState } from "react";
import { SlideThumbnail } from "./SlideThumbnail";
import type { Deck, SlideDims } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { useDeckStore } from "../../store/deckStore";

export function GridOverview({
  deck,
  theme,
  dims,
  onClose,
  onJump,
}: {
  deck: Deck;
  theme: Theme;
  dims: SlideDims;
  onClose: () => void;
  onJump: (i: number) => void;
}) {
  const moveSlide = useDeckStore((s) => s.moveSlide);
  const duplicateSlide = useDeckStore((s) => s.duplicateSlide);
  const removeSlide = useDeckStore((s) => s.deleteSlide);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-app-bg">
      <div className="flex items-center gap-3 border-b border-app-border bg-app-surface px-6 py-3.5">
        <span className="text-[16px] font-bold">슬라이드 개요</span>
        <span className="text-[12px] text-app-faint">
          {deck.slides.length}장 · 드래그로 순서 변경 · 클릭해서 편집으로 이동
        </span>
        <span className="flex-1" />
        <button onClick={onClose} className="rounded-lg border border-app-border bg-white px-3.5 py-2 text-[13px] font-semibold hover:border-app-accent">
          ✕ 닫기
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {deck.slides.map((s, i) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== i) moveSlide(dragIdx, i);
                setDragIdx(null);
              }}
              className={`group rounded-xl border-2 bg-white p-1.5 transition-all ${
                dragIdx === i ? "opacity-40" : "border-app-border hover:border-app-accent"
              }`}
            >
              <button onClick={() => onJump(i)} className="block w-full overflow-hidden rounded-lg">
                <SlideThumbnail slide={s} theme={theme} dims={dims} />
              </button>
              <div className="mt-1.5 flex items-center gap-1 px-0.5">
                <span className="flex-1 truncate text-[11px] text-app-faint">
                  {i + 1} · {s.layout}
                </span>
                <button
                  onClick={() => duplicateSlide(s.id)}
                  className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-app-muted opacity-0 hover:bg-app-bg group-hover:opacity-100"
                >
                  복제
                </button>
                <button
                  onClick={() => removeSlide(s.id)}
                  className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-app-danger opacity-0 hover:bg-app-danger-soft group-hover:opacity-100"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
