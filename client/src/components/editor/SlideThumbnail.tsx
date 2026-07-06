import { useEffect, useState } from "react";
import { renderSlideToDataURL } from "../../engine/fabricRenderer";
import type { Slide } from "../../engine/schema";
import type { Theme } from "../../engine/themes";

const THUMB_W = 208;

export function SlideThumbnail({ slide, theme }: { slide: Slide; theme: Theme }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void renderSlideToDataURL(slide, theme, THUMB_W).then((url) => {
        if (alive) setSrc(url);
      });
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [slide, theme]);

  return (
    <div
      className="aspect-video w-full overflow-hidden rounded-md border border-app-border bg-white"
      style={{ backgroundColor: theme.bg }}
    >
      {src && <img src={src} alt="" className="h-full w-full" draggable={false} />}
    </div>
  );
}
