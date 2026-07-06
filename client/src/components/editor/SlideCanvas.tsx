import { Canvas, FabricObject, Point } from "fabric";
import { useEffect, useRef } from "react";
import { getElementData, renderSlide } from "../../engine/fabricRenderer";
import { attachSync, consumeInternalUpdate } from "../../engine/fabricSync";
import type { Slide, SlideElement } from "../../engine/schema";
import { SLIDE_H, SLIDE_W, uid } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { useDeckStore } from "../../store/deckStore";
import { useUiStore } from "../../store/uiStore";

const FIT_PADDING = 120;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  // Fabric이 텍스트 선택 시 포커스하는 숨김 textarea는 제외 (인라인 편집 중 여부는 isEditing으로 판별)
  if (t.getAttribute("data-fabric") === "textarea") return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}

export function SlideCanvas({ slide, theme }: { slide: Slide; theme: Theme }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fcRef = useRef<Canvas | null>(null);
  const slideRef = useRef(slide);
  slideRef.current = slide;

  useEffect(() => {
    const host = hostRef.current!;
    const fc = new Canvas(canvasElRef.current!, {
      preserveObjectStacking: true,
      selection: true,
      uniformScaling: true,
    });
    fcRef.current = fc;
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__fc = fc;
    }

    // --- 줌 핏 & 리사이즈 ---
    const fit = () => {
      const cw = host.clientWidth;
      const ch = host.clientHeight;
      if (cw === 0 || ch === 0) return;
      fc.setDimensions({ width: cw, height: ch });
      const s = Math.min(cw / (SLIDE_W + FIT_PADDING), ch / (SLIDE_H + FIT_PADDING));
      fc.setViewportTransform([
        s,
        0,
        0,
        s,
        (cw - SLIDE_W * s) / 2,
        (ch - SLIDE_H * s) / 2,
      ]);
      fc.requestRenderAll();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);

    // --- Ctrl+휠 줌 ---
    fc.on("mouse:wheel", (opt) => {
      if (!opt.e.ctrlKey) return;
      opt.e.preventDefault();
      opt.e.stopPropagation();
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, fc.getZoom() * 0.999 ** opt.e.deltaY),
      );
      fc.zoomToPoint(new Point(opt.e.offsetX, opt.e.offsetY), zoom);
    });

    // --- Space+드래그 팬 ---
    let spaceDown = false;
    let panning = false;
    fc.on("mouse:down", (opt) => {
      if (!spaceDown) return;
      panning = true;
      fc.selection = false;
      fc.discardActiveObject();
      fc.setCursor("grabbing");
      opt.e.preventDefault();
    });
    fc.on("mouse:move", (opt) => {
      if (!panning || !("movementX" in opt.e)) return;
      const e = opt.e as MouseEvent;
      const vpt = fc.viewportTransform;
      vpt[4] += e.movementX;
      vpt[5] += e.movementY;
      fc.setViewportTransform(vpt);
    });
    fc.on("mouse:up", () => {
      if (!panning) return;
      panning = false;
      fc.selection = true;
    });

    // --- 역동기화 ---
    const detachSync = attachSync(fc, {
      updateElement: (elementId, patch) => {
        useDeckStore
          .getState()
          .updateElement(slideRef.current.id, elementId, patch);
      },
      onSelect: (elementId) => useUiStore.getState().setSelectedElementId(elementId),
    });

    // --- 단축키 ---
    const activeElement = (): { obj: FabricObject; el: SlideElement } | null => {
      const objs = fc.getActiveObjects();
      if (objs.length !== 1) return null;
      const id = getElementData(objs[0])?.elementId;
      const el = slideRef.current.elements.find((x) => x.id === id);
      return el ? { obj: objs[0], el } : null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;
      const editing = fc.getActiveObject() as { isEditing?: boolean } | undefined;
      if (editing?.isEditing) return; // 텍스트 인라인 편집 중에는 무시

      if (e.code === "Space") {
        spaceDown = true;
        fc.defaultCursor = "grab";
        e.preventDefault();
        return;
      }

      const store = useDeckStore.getState();
      const ui = useUiStore.getState();

      if (e.key === "Escape") {
        fc.discardActiveObject();
        fc.requestRenderAll();
        ui.setSelectedElementId(null);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const a = activeElement();
        if (!a) return;
        fc.discardActiveObject();
        ui.setSelectedElementId(null);
        store.removeElement(slideRef.current.id, a.el.id);
        e.preventDefault();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        const a = activeElement();
        if (!a) return;
        e.preventDefault();
        const copy = { ...a.el, id: uid(), x: a.el.x + 24, y: a.el.y + 24 };
        store.addElement(slideRef.current.id, copy);
        ui.setSelectedElementId(copy.id);
        return;
      }

      if (e.key.startsWith("Arrow")) {
        const a = activeElement();
        if (!a) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        a.obj.set({ left: (a.obj.left ?? 0) + dx, top: (a.obj.top ?? 0) + dy });
        a.obj.setCoords();
        fc.requestRenderAll();
        // 캔버스는 이미 반영됨 — object:modified 경로로 schema만 동기화
        fc.fire("object:modified", { target: a.obj } as never);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown = false;
        fc.defaultCursor = "default";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      detachSync();
      ro.disconnect();
      fcRef.current = null;
      void fc.dispose();
    };
  }, []);

  // 슬라이드/테마 변경 시 재렌더 (Fabric 발 갱신은 스킵 — 값만 이미 동기화됨)
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;
    if (consumeInternalUpdate()) return;
    let cancelled = false;
    // clear() 시 selection:cleared가 선택 상태를 지우므로 렌더 전에 캡처
    const selectedId = useUiStore.getState().selectedElementId;
    void (async () => {
      await renderSlide(fc, slide, theme);
      if (cancelled) return;
      // 재렌더 후 기존 선택 복원
      if (selectedId) {
        useUiStore.getState().setSelectedElementId(selectedId);
        const obj = fc
          .getObjects()
          .find((o) => getElementData(o)?.elementId === selectedId);
        if (obj) {
          fc.setActiveObject(obj);
          fc.requestRenderAll();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slide, theme]);

  return (
    <div ref={hostRef} className="h-full w-full overflow-hidden bg-app-canvas">
      <canvas ref={canvasElRef} />
    </div>
  );
}
