// 이미지 크롭 모달 (시안 §자르기) — 표시 이미지 위에 드래그·리사이즈 가능한 크롭 사각형을 두고,
// 적용 시 원본 해상도 기준으로 잘라 새 dataURL을 반환한다. 스키마/렌더러/내보내기 변경 없음(src만 교체).
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ImageCropModal({
  src,
  onApply,
  onClose,
}: {
  src: string;
  onApply: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // 표시 영역(px) 기준 크롭 사각형. 이미지 로드 후 표시 크기로 초기화.
  const [disp, setDisp] = useState<{ w: number; h: number; left: number; top: number } | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const drag = useRef<{ mode: "move" | "se"; sx: number; sy: number; start: Rect } | null>(null);

  // 이미지가 표시 박스에 contain 될 때의 실제 렌더 크기·오프셋 계산
  const onImgLoad = () => {
    const img = imgRef.current;
    const box = boxRef.current;
    if (!img || !box) return;
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const ar = img.naturalWidth / img.naturalHeight;
    let w = bw;
    let h = bw / ar;
    if (h > bh) {
      h = bh;
      w = bh * ar;
    }
    const left = (bw - w) / 2;
    const top = (bh - h) / 2;
    setDisp({ w, h, left, top });
    // 초기 크롭 = 이미지의 안쪽 80%
    setCrop({ x: left + w * 0.1, y: top + h * 0.1, w: w * 0.8, h: h * 0.8 });
  };

  useEffect(() => {
    const onUp = () => (drag.current = null);
    const onMove = (e: MouseEvent) => {
      if (!drag.current || !disp || !crop) return;
      const d = drag.current;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      const minX = disp.left;
      const minY = disp.top;
      const maxX = disp.left + disp.w;
      const maxY = disp.top + disp.h;
      if (d.mode === "move") {
        let nx = d.start.x + dx;
        let ny = d.start.y + dy;
        nx = Math.max(minX, Math.min(nx, maxX - d.start.w));
        ny = Math.max(minY, Math.min(ny, maxY - d.start.h));
        setCrop({ ...d.start, x: nx, y: ny });
      } else {
        const nw = Math.max(24, Math.min(d.start.w + dx, maxX - d.start.x));
        const nh = Math.max(24, Math.min(d.start.h + dy, maxY - d.start.y));
        setCrop({ ...d.start, w: nw, h: nh });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [disp, crop]);

  const apply = () => {
    const img = imgRef.current;
    if (!img || !disp || !crop) return;
    const scale = img.naturalWidth / disp.w; // 표시px → 원본px
    const sx = (crop.x - disp.left) * scale;
    const sy = (crop.y - disp.top) * scale;
    const sw = crop.w * scale;
    const sh = crop.h * scale;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    onApply(canvas.toDataURL("image/png"));
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        className="w-[720px] max-w-[92vw] rounded-2xl bg-app-surface p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-bold">이미지 자르기</h3>
          <span className="text-[11.5px] text-app-faint">사각형을 끌어 위치·크기를 조절하고 적용하세요</span>
        </div>
        <div ref={boxRef} className="relative h-[400px] w-full overflow-hidden rounded-lg bg-app-canvas">
          <img
            ref={imgRef}
            src={src}
            onLoad={onImgLoad}
            alt=""
            draggable={false}
            className="pointer-events-none absolute select-none"
            style={disp ? { width: disp.w, height: disp.h, left: disp.left, top: disp.top } : { opacity: 0 }}
          />
          {crop && (
            <>
              {/* 어둡게 덮는 마스크 (크롭 밖) */}
              <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `0 0 0 9999px rgba(0,0,0,.45)`, left: crop.x, top: crop.y, width: crop.w, height: crop.h, position: "absolute" }} />
              {/* 크롭 사각형 */}
              <div
                className="absolute cursor-move border-2 border-white"
                style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h, boxShadow: "0 0 0 1px rgba(0,0,0,.4)" }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  drag.current = { mode: "move", sx: e.clientX, sy: e.clientY, start: crop };
                }}
              >
                {/* 3분할 가이드 */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute left-1/3 top-0 h-full w-px bg-white/40" />
                  <div className="absolute left-2/3 top-0 h-full w-px bg-white/40" />
                  <div className="absolute top-1/3 left-0 h-px w-full bg-white/40" />
                  <div className="absolute top-2/3 left-0 h-px w-full bg-white/40" />
                </div>
                {/* 우하단 리사이즈 핸들 */}
                <span
                  className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-[2px] border-2 border-white bg-app-text"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    drag.current = { mode: "se", sx: e.clientX, sy: e.clientY, start: crop };
                  }}
                />
              </div>
            </>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-app-border bg-white px-3.5 py-2 text-[12.5px] font-semibold text-app-muted hover:bg-app-bg">
            취소
          </button>
          <button onClick={apply} className="inline-flex items-center gap-1.5 rounded-lg bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90">
            <span className="mi text-[15px]">crop</span>자르기 적용
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
