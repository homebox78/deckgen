import { useEffect, useState } from "react";
import { renderSlideToDataURL } from "../../engine/fabricRenderer";
import type { Slide, SlideDims } from "../../engine/schema";
import { SLIDE_H, SLIDE_W } from "../../engine/schema";
import type { Theme } from "../../engine/themes";

const THUMB_W = 208;

export function SlideThumbnail({
  slide,
  theme,
  dims = { w: SLIDE_W, h: SLIDE_H },
}: {
  slide: Slide;
  theme: Theme;
  dims?: SlideDims;
}) {
  const locked = !!slide.locked;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void renderSlideToDataURL(slide, theme, THUMB_W, dims).then((url) => {
        if (alive) setSrc(url);
      });
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [slide, theme, dims]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-app-border bg-white"
      style={{ backgroundColor: theme.bg, aspectRatio: `${dims.w} / ${dims.h}` }}
    >
      {src && <img src={src} alt="" className="h-full w-full" draggable={false} />}
      {locked && (
        <>
          <div className="absolute inset-0 bg-white/45" />
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-app-text/80 text-white">
            <span className="mi text-[11px]">lock</span>
          </span>
        </>
      )}
    </div>
  );
}
