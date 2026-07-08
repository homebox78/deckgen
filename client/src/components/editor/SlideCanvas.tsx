import { ActiveSelection, Canvas, FabricObject, Line, PencilBrush, Point } from "fabric";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { decomposeChart } from "../../engine/chartDecompose";
import { getElementData, renderSlide } from "../../engine/fabricRenderer";
import { attachSync, consumeInternalUpdate } from "../../engine/fabricSync";
import type { Slide, SlideDims, SlideElement } from "../../engine/schema";
import { SLIDE_H, SLIDE_W, uid } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { useDeckStore } from "../../store/deckStore";
import { useUiStore } from "../../store/uiStore";
import { showToast } from "../ui/toast";
import { registerCanvasApi } from "./canvasApi";

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

export function SlideCanvas({
  slide,
  theme,
  readOnly = false,
  dims = { w: SLIDE_W, h: SLIDE_H },
  onInsertAt,
  peers,
  onCursor,
  pins,
  onPinPlace,
  onPinClick,
  onPinClickAt,
  onPinMove,
  penMode = false,
  penColor = "#E5484D",
  penWidth = 4,
  onPathDrawn,
}: {
  slide: Slide;
  theme: Theme;
  readOnly?: boolean;
  dims?: SlideDims;
  onInsertAt?: (kind: string) => void;
  peers?: { clientId: string; name: string; color: string; cursor?: { x: number; y: number }; selectedId?: string }[];
  onCursor?: (x: number, y: number) => void;
  pins?: { id: string; x: number; y: number; n: number; resolved: boolean }[];
  onPinPlace?: (x: number, y: number) => void;
  onPinClick?: (id: string) => void;
  onPinClickAt?: (id: string, clientX: number, clientY: number) => void;
  onPinMove?: (id: string, x: number, y: number) => void;
  penMode?: boolean;
  penColor?: string;
  penWidth?: number;
  onPathDrawn?: (d: string, x: number, y: number, w: number, h: number, stroke: string, strokeWidth: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fcRef = useRef<Canvas | null>(null);
  const slideRef = useRef(slide);
  slideRef.current = slide;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const clipboardRef = useRef<SlideElement | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; elementId: string | null } | null>(
    null,
  );
  const onCursorRef = useRef(onCursor);
  onCursorRef.current = onCursor;
  const onPinPlaceRef = useRef(onPinPlace);
  onPinPlaceRef.current = onPinPlace;
  const onPathDrawnRef = useRef(onPathDrawn);
  onPathDrawnRef.current = onPathDrawn;
  const [vptTick, setVptTick] = useState(0); // 뷰포트 변경 시 커서 오버레이 재계산

  useEffect(() => {
    const host = hostRef.current!;
    const fc = new Canvas(canvasElRef.current!, {
      preserveObjectStacking: true,
      selection: !readOnly,
      uniformScaling: true,
      skipTargetFind: readOnly, // 보기 전용: 요소 선택/호버 비활성
      selectionColor: "rgba(26,26,26,0.06)",
      selectionBorderColor: "#1A1A1A",
    });
    // 모노크롬 v2 선택 핸들 (Design.dc.html §2a): 검정 테두리 + 흰 코너
    FabricObject.ownDefaults.borderColor = "#1A1A1A";
    FabricObject.ownDefaults.cornerColor = "#FFFFFF";
    FabricObject.ownDefaults.cornerStrokeColor = "#1A1A1A";
    FabricObject.ownDefaults.cornerSize = 10;
    FabricObject.ownDefaults.transparentCorners = false;
    FabricObject.ownDefaults.cornerStyle = "circle";
    fcRef.current = fc;
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__fc = fc;
    }

    // --- 줌 핏 & 리사이즈 ---
    const reportZoom = () => useUiStore.getState().setZoom(fc.getZoom());
    const fit = () => {
      const cw = host.clientWidth;
      const ch = host.clientHeight;
      if (cw === 0 || ch === 0) return;
      fc.setDimensions({ width: cw, height: ch });
      const s = Math.min(cw / (dims.w + FIT_PADDING), ch / (dims.h + FIT_PADDING));
      fc.setViewportTransform([
        s,
        0,
        0,
        s,
        (cw - dims.w * s) / 2,
        (ch - dims.h * s) / 2,
      ]);
      fc.requestRenderAll();
      reportZoom();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);

    // 줌 툴바(에디터 하단 필)에서 사용하는 제어 API
    const zoomBy = (factor: number) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fc.getZoom() * factor));
      fc.zoomToPoint(new Point(fc.getWidth() / 2, fc.getHeight() / 2), z);
      reportZoom();
    };
    // 정렬·분배 — 선택 요소를 schema 좌표로 갱신 (1개=슬라이드 기준, 2+=선택 묶음 bbox 기준)
    const selectedEls = (): SlideElement[] => {
      const ids = fc.getActiveObjects().map((o) => getElementData(o)?.elementId);
      return slideRef.current.elements.filter((el) => ids.includes(el.id) && !el.locked);
    };
    const applyAlign = (dir: import("./canvasApi").AlignDir) => {
      const els = selectedEls();
      if (els.length === 0) return;
      const st = useDeckStore.getState();
      const box =
        els.length === 1
          ? { x: 0, y: 0, w: dims.w, h: dims.h }
          : {
              x: Math.min(...els.map((e) => e.x)),
              y: Math.min(...els.map((e) => e.y)),
              w: Math.max(...els.map((e) => e.x + e.w)) - Math.min(...els.map((e) => e.x)),
              h: Math.max(...els.map((e) => e.y + e.h)) - Math.min(...els.map((e) => e.y)),
            };
      for (const el of els) {
        const patch: Partial<SlideElement> = {};
        if (dir === "left") patch.x = box.x;
        else if (dir === "hcenter") patch.x = box.x + (box.w - el.w) / 2;
        else if (dir === "right") patch.x = box.x + box.w - el.w;
        else if (dir === "top") patch.y = box.y;
        else if (dir === "vcenter") patch.y = box.y + (box.h - el.h) / 2;
        else if (dir === "bottom") patch.y = box.y + box.h - el.h;
        st.updateElement(slideRef.current.id, el.id, patch);
      }
      fc.discardActiveObject();
    };
    const applyDistribute = (dir: import("./canvasApi").DistDir) => {
      const els = selectedEls();
      if (els.length < 3) {
        showToast("3개 이상 선택해야 분배할 수 있어요");
        return;
      }
      const st = useDeckStore.getState();
      const sorted = [...els].sort((a, b) => (dir === "h" ? a.x - b.x : a.y - b.y));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span =
        dir === "h"
          ? last.x + last.w - first.x - sorted.reduce((s, e) => s + e.w, 0)
          : last.y + last.h - first.y - sorted.reduce((s, e) => s + e.h, 0);
      const gap = span / (sorted.length - 1);
      let cur = dir === "h" ? first.x : first.y;
      for (const el of sorted) {
        st.updateElement(slideRef.current.id, el.id, dir === "h" ? { x: Math.round(cur) } : { y: Math.round(cur) });
        cur += (dir === "h" ? el.w : el.h) + gap;
      }
      fc.discardActiveObject();
    };
    registerCanvasApi({
      zoomIn: () => zoomBy(1.2),
      zoomOut: () => zoomBy(1 / 1.2),
      fit,
      align: applyAlign,
      distribute: applyDistribute,
      selectionCount: () => fc.getActiveObjects().length,
      patchActive: (props) => {
        const o = fc.getActiveObject();
        if (!o) return;
        o.set(props as Record<string, never>);
        o.setCoords();
        fc.requestRenderAll();
      },
    });

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
      reportZoom();
      setVptTick((t) => t + 1);
    });

    // --- 스냅 가이드 (Figma식) — 중앙·여백·다른 요소 정렬 시 점선 ---
    const SNAP = 8; // 스냅 임계값 (슬라이드 좌표)
    let guides: FabricObject[] = [];
    const clearGuides = () => {
      guides.forEach((g) => fc.remove(g));
      guides = [];
    };
    const guideLine = (pts: [number, number, number, number]) =>
      new Line(pts, {
        stroke: "#1A1A1A",
        strokeWidth: 1.5,
        strokeDashArray: [6, 5],
        selectable: false,
        evented: false,
        excludeFromExport: true,
      } as never);

    fc.on("object:moving", (opt) => {
      const obj = opt.target;
      if (!obj) return;
      clearGuides();
      const w = obj.getScaledWidth();
      const h = obj.getScaledHeight();
      const cx = (obj.left ?? 0) + w / 2;
      const cy = (obj.top ?? 0) + h / 2;
      // 타깃 후보: 슬라이드 중앙·여백 + 다른 요소 중앙/에지
      const others = fc.getObjects().filter((o) => o !== obj && !!getElementData(o));
      const vCand = [dims.w / 2, 96, dims.w - 96, ...others.map((o) => (o.left ?? 0) + o.getScaledWidth() / 2)];
      const hCand = [dims.h / 2, 96, dims.h - 96, ...others.map((o) => (o.top ?? 0) + o.getScaledHeight() / 2)];
      for (const vx of vCand) {
        if (Math.abs(cx - vx) < SNAP) {
          obj.set({ left: vx - w / 2 });
          guides.push(guideLine([vx, 0, vx, dims.h]));
          break;
        }
      }
      for (const hy of hCand) {
        if (Math.abs(cy - hy) < SNAP) {
          obj.set({ top: hy - h / 2 });
          guides.push(guideLine([0, hy, dims.w, hy]));
          break;
        }
      }
      guides.forEach((g) => fc.add(g));
    });
    fc.on("mouse:up", clearGuides);
    fc.on("object:modified", clearGuides);

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
      setVptTick((t) => t + 1);
    });

    // --- 라이브 커서 브로드캐스트 (C2, 120ms 스로틀) ---
    let lastCursor = 0;
    fc.on("mouse:move", (opt) => {
      if (!onCursorRef.current) return;
      const now = Date.now();
      if (now - lastCursor < 120) return;
      lastCursor = now;
      const p = fc.getScenePoint(opt.e);
      onCursorRef.current(Math.round(p.x), Math.round(p.y));
    });

    // --- 댓글 핀 찍기: 핀 모드에서 캔버스 클릭 → 좌표 전달 ---
    fc.on("mouse:down", (opt) => {
      if (!useUiStore.getState().pinPicking || !onPinPlaceRef.current) return;
      const p = fc.getScenePoint(opt.e);
      onPinPlaceRef.current(Math.round(p.x), Math.round(p.y));
    });

    // --- 펜(자유 드로잉): 획을 다 그리면 SVG path로 직렬화해 스키마 요소로 저장 ---
    fc.on("path:created", (opt) => {
      const drawn = (opt as unknown as { path?: FabricObject & { path?: unknown[] } }).path;
      if (!drawn || !onPathDrawnRef.current) return;
      const seg = (drawn.path ?? []) as (string | number)[][];
      const d = seg.map((c) => c.join(" ")).join(" ");
      const br = drawn.getBoundingRect();
      const stroke = (drawn as unknown as { stroke?: string }).stroke ?? "#E5484D";
      const sw = (drawn as unknown as { strokeWidth?: number }).strokeWidth ?? 4;
      // 임시로 그려진 fabric 객체는 제거 — 스키마 재렌더로 다시 그려진다
      fc.remove(drawn as unknown as FabricObject);
      onPathDrawnRef.current(d, Math.round(drawn.left ?? br.left), Math.round(drawn.top ?? br.top), Math.round(br.width), Math.round(br.height), stroke, sw);
    });

    // --- 역동기화 (보기 전용에선 편집 이벤트가 없으므로 생략) ---
    const detachSync = readOnly
      ? () => {}
      : attachSync(fc, {
          updateElement: (elementId, patch) => {
            useDeckStore
              .getState()
              .updateElement(slideRef.current.id, elementId, patch);
          },
          onSelect: (elementId) =>
            useUiStore.getState().setSelectedElementId(elementId),
        });

    // --- 차트 더블클릭 = 개별 요소로 분해 (ungroup) → 조각 개별 선택/수정 가능 ---
    fc.on("mouse:dblclick", (opt) => {
      if (readOnly || !opt.target) return;
      const data = getElementData(opt.target);
      if (data?.kind !== "chart") return;
      const el = slideRef.current.elements.find((x) => x.id === data.elementId);
      if (!el || el.type !== "chart") return;
      const parts = decomposeChart(el, themeRef.current);
      fc.discardActiveObject();
      useUiStore.getState().setSelectedElementId(null);
      useDeckStore.getState().explodeElement(slideRef.current.id, el.id, parts);
      showToast("차트를 개별 요소로 분해했어요 — 조각을 선택해 수정하세요 (Ctrl+Z 복원)");
    });

    // --- 그룹 자동 선택 — 그룹 요소 클릭 시 같은 groupId 전체 선택 ---
    let expandingGroup = false;
    const expandGroup = () => {
      if (expandingGroup || readOnly) return;
      const active = fc.getActiveObject();
      if (!active || active.type === "activeselection") return;
      const el = slideRef.current.elements.find((x) => x.id === getElementData(active)?.elementId);
      if (!el?.groupId) return;
      const members = fc
        .getObjects()
        .filter((o) => {
          const e = slideRef.current.elements.find((x) => x.id === getElementData(o)?.elementId);
          return e?.groupId === el.groupId;
        });
      if (members.length < 2) return;
      expandingGroup = true;
      const sel = new ActiveSelection(members, { canvas: fc });
      fc.setActiveObject(sel);
      fc.requestRenderAll();
      expandingGroup = false;
    };
    fc.on("selection:created", expandGroup);
    fc.on("selection:updated", expandGroup);

    // --- 우클릭 컨텍스트 메뉴 (Demo Act 5.5) ---
    const onCtx = (ev: MouseEvent) => {
      if (readOnly) return;
      ev.preventDefault();
      const target = fc.findTarget(ev as unknown as Parameters<typeof fc.findTarget>[0]);
      const id = target ? (getElementData(target)?.elementId ?? null) : null;
      if (target) {
        fc.setActiveObject(target);
        fc.requestRenderAll();
        if (id) useUiStore.getState().setSelectedElementId(id);
      }
      setCtxMenu({ x: ev.clientX, y: ev.clientY, elementId: id });
    };
    const canvasEl = fc.upperCanvasEl;
    canvasEl.addEventListener("contextmenu", onCtx);

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

      if (readOnly) return; // 보기 전용: 팬 외 편집 단축키 차단

      const store = useDeckStore.getState();
      const ui = useUiStore.getState();

      if (e.key === "Escape") {
        fc.discardActiveObject();
        fc.requestRenderAll();
        ui.setSelectedElementId(null);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        // 다중 선택 삭제 지원 (마퀴로 여러 개 선택 시)
        const objs = fc.getActiveObjects();
        if (objs.length === 0) return;
        const ids = objs
          .map((o) => getElementData(o)?.elementId)
          .filter((id): id is string => !!id);
        const els = ids
          .map((id) => slideRef.current.elements.find((x) => x.id === id))
          .filter((x): x is SlideElement => !!x);
        if (els.some((el) => el.locked)) {
          showToast("잠긴 요소가 포함돼 있어요 — 잠금을 해제하세요");
          e.preventDefault();
          return;
        }
        fc.discardActiveObject();
        ui.setSelectedElementId(null);
        els.forEach((el) => store.removeElement(slideRef.current.id, el.id));
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

      // 그룹 / 그룹 해제 (Ctrl+G / Ctrl+Shift+G)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        const objs = fc.getActiveObjects();
        const ids = objs
          .map((o) => getElementData(o)?.elementId)
          .filter((id): id is string => !!id);
        if (e.shiftKey) {
          // 해제: 선택 요소의 groupId 제거
          ids.forEach((id) =>
            store.updateElement(slideRef.current.id, id, { groupId: undefined } as Partial<SlideElement>),
          );
          if (ids.length) showToast("그룹을 해제했어요");
        } else if (ids.length >= 2) {
          const gid = uid();
          ids.forEach((id) =>
            store.updateElement(slideRef.current.id, id, { groupId: gid } as Partial<SlideElement>),
          );
          showToast(`${ids.length}개 요소를 그룹으로 묶었어요 (Ctrl+Shift+G 해제)`);
        } else {
          showToast("2개 이상 선택하면 그룹으로 묶을 수 있어요");
        }
        return;
      }

      // 복사 / 붙여넣기 (서식 아닌 요소 자체)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        const a = activeElement();
        if (a) clipboardRef.current = a.el;
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        const src = clipboardRef.current;
        if (!src) return;
        e.preventDefault();
        const copy = { ...src, id: uid(), x: src.x + 32, y: src.y + 32 };
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
      registerCanvasApi(null);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvasEl.removeEventListener("contextmenu", onCtx);
      detachSync();
      ro.disconnect();
      fcRef.current = null;
      void fc.dispose();
    };
  }, [readOnly, dims]);

  // 펜(자유 드로잉) 모드 — isDrawingMode + PencilBrush 색/굵기
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;
    fc.isDrawingMode = penMode && !readOnly;
    if (fc.isDrawingMode) {
      const brush = fc.freeDrawingBrush ?? new PencilBrush(fc);
      brush.color = penColor;
      brush.width = penWidth;
      fc.freeDrawingBrush = brush;
    }
  }, [penMode, penColor, penWidth, readOnly]);

  // 슬라이드/테마 변경 시 재렌더 (Fabric 발 갱신은 스킵 — 값만 이미 동기화됨)
  useEffect(() => {
    const fc = fcRef.current;
    if (!fc) return;
    if (consumeInternalUpdate()) return;
    let cancelled = false;
    // clear() 시 selection:cleared가 선택 상태를 지우므로 렌더 전에 캡처
    const selectedId = useUiStore.getState().selectedElementId;
    void (async () => {
      await renderSlide(fc, slide, theme, { dims });
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
  }, [slide, theme, readOnly, dims]);

  // 컨텍스트 메뉴 액션
  const ctxTarget = ctxMenu?.elementId
    ? slide.elements.find((el) => el.id === ctxMenu.elementId)
    : null;
  const closeCtx = () => setCtxMenu(null);
  const ctxItems: { label: string; shortcut?: string; danger?: boolean; act: () => void }[] = [];
  if (ctxTarget) {
    const st = useDeckStore.getState();
    ctxItems.push(
      {
        label: ctxTarget.locked ? "잠금 해제" : "요소 잠금",
        act: () =>
          st.updateElement(slide.id, ctxTarget.id, {
            locked: !ctxTarget.locked || undefined,
          } as Partial<SlideElement>),
      },
      {
        label: "복사",
        shortcut: "Ctrl+C",
        act: () => {
          clipboardRef.current = ctxTarget;
        },
      },
      {
        label: "복제",
        shortcut: "Ctrl+D",
        act: () => {
          const copy = { ...ctxTarget, id: uid(), x: ctxTarget.x + 24, y: ctxTarget.y + 24 };
          st.addElement(slide.id, copy);
          useUiStore.getState().setSelectedElementId(copy.id);
        },
      },
      { label: "맨 앞으로", act: () => st.reorderElement(slide.id, ctxTarget.id, "front") },
      { label: "앞으로", shortcut: "]", act: () => st.reorderElement(slide.id, ctxTarget.id, "forward") },
      { label: "뒤로", shortcut: "[", act: () => st.reorderElement(slide.id, ctxTarget.id, "backward") },
      { label: "맨 뒤로", act: () => st.reorderElement(slide.id, ctxTarget.id, "back") },
      {
        label: "삭제",
        shortcut: "Del",
        danger: true,
        act: () => {
          if (ctxTarget.locked) {
            showToast("잠긴 요소예요 — 잠금을 해제하세요");
            return;
          }
          useUiStore.getState().setSelectedElementId(null);
          st.removeElement(slide.id, ctxTarget.id);
        },
      },
    );
  } else if (ctxMenu) {
    const st = useDeckStore.getState();
    ctxItems.push(
      {
        label: "붙여넣기",
        shortcut: "Ctrl+V",
        act: () => {
          const src = clipboardRef.current;
          if (!src) return showToast("복사한 요소가 없어요");
          const copy = { ...src, id: uid(), x: src.x + 32, y: src.y + 32 };
          st.addElement(slide.id, copy);
          useUiStore.getState().setSelectedElementId(copy.id);
        },
      },
      { label: "텍스트 상자 추가", act: () => onInsertAt?.("text") },
      { label: "사각형 추가", act: () => onInsertAt?.("rect") },
    );
  }

  // 협업자 라이브 커서 오버레이 (C2) — 슬라이드 좌표 → 화면 좌표
  const cursorEls = (() => {
    const fc = fcRef.current;
    if (!fc || !peers) return null;
    void vptTick; // 뷰포트 변경 시 재계산 의존
    const vpt = fc.viewportTransform;
    return peers
      .filter((p) => p.cursor)
      .map((p) => {
        const sx = p.cursor!.x * vpt[0] + vpt[4];
        const sy = p.cursor!.y * vpt[3] + vpt[5];
        return (
          <div key={p.clientId} className="pointer-events-none absolute z-30" style={{ left: sx, top: sy }}>
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.3))" }}>
              <path d="M5 3l14 7-6 2-2 6z" fill={p.color} stroke="#fff" strokeWidth="1.5" />
            </svg>
            <span
              className="ml-2.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ background: p.color }}
            >
              {p.name}
            </span>
          </div>
        );
      });
  })();

  // 피어가 선택 중인 요소에 "{이름} 선택 중" 라벨 + 색 테두리
  const selectionLabels = (() => {
    const fc = fcRef.current;
    if (!fc || !peers) return null;
    void vptTick;
    const vpt = fc.viewportTransform;
    return peers
      .filter((p) => p.selectedId)
      .map((p) => {
        const obj = fc
          .getObjects()
          .find((o) => (o as { data?: { elementId?: string } }).data?.elementId === p.selectedId);
        if (!obj) return null;
        const r = obj.getBoundingRect();
        const sx = r.left * vpt[0] + vpt[4];
        const sy = r.top * vpt[3] + vpt[5];
        const w = r.width * vpt[0];
        const h = r.height * vpt[3];
        return (
          <div key={`sel-${p.clientId}`} className="pointer-events-none absolute z-20" style={{ left: sx, top: sy, width: w, height: h }}>
            <div className="h-full w-full rounded-[2px] border-2" style={{ borderColor: p.color }} />
            <span
              className="absolute -top-[18px] left-0 rounded-[4px] px-1.5 py-0.5 text-[9.5px] font-semibold whitespace-nowrap text-white"
              style={{ background: p.color }}
            >
              {p.name} 선택 중
            </span>
          </div>
        );
      });
  })();

  // 댓글 핀 (번호 원) — 슬라이드 좌표 → 화면
  const pinEls = (() => {
    const fc = fcRef.current;
    if (!fc || !pins?.length) return null;
    void vptTick;
    const vpt = fc.viewportTransform;
    return pins.map((pin) => {
      const sx = pin.x * vpt[0] + vpt[4];
      const sy = pin.y * vpt[3] + vpt[5];
      // 드래그로 이동 + (움직임 없으면) 클릭으로 팝업. 화면 좌표 → 슬라이드 좌표 역변환.
      const onDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        const host = hostRef.current;
        const cur = fcRef.current?.viewportTransform;
        if (!host || !cur) return;
        const rect = host.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        let moved = false;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* 캡처 실패해도 window 리스너로 드래그·클릭 처리 */
        }
        const move = (ev: PointerEvent) => {
          if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
          moved = true;
          const nx = (ev.clientX - rect.left - cur[4]) / cur[0];
          const ny = (ev.clientY - rect.top - cur[5]) / cur[3];
          onPinMove?.(pin.id, Math.round(nx), Math.round(ny));
        };
        const up = (ev: PointerEvent) => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          if (!moved) {
            // 클릭으로 처리 → 팝업 열기
            onPinClick?.(pin.id);
            onPinClickAt?.(pin.id, ev.clientX, ev.clientY);
          }
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      };
      return (
        <button
          key={pin.id}
          onPointerDown={onDown}
          title={`댓글 핀 ${pin.n} — 드래그로 이동, 클릭으로 열기`}
          className={`absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-full rotate-45 cursor-grab items-center justify-center rounded-full rounded-bl-none border-2 border-white shadow-md active:cursor-grabbing ${
            pin.resolved ? "bg-app-faint" : "bg-app-accent"
          }`}
          style={{ left: sx, top: sy }}
        >
          <span className="-rotate-45 text-[11px] font-bold text-white">{pin.n}</span>
        </button>
      );
    });
  })();

  return (
    <div
      ref={hostRef}
      className={`relative h-full w-full overflow-hidden bg-app-canvas ${useUiStore.getState().pinPicking ? "cursor-crosshair" : ""}`}
    >
      <canvas ref={canvasElRef} />
      {selectionLabels}
      {pinEls}
      {cursorEls}
      {ctxMenu && ctxItems.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeCtx} onContextMenu={(e) => { e.preventDefault(); closeCtx(); }} />
          <div
            className="fixed z-50 min-w-[196px] rounded-xl border border-app-border bg-white p-1.5 shadow-[0_14px_40px_rgba(0,0,0,.14)]"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 210),
              top: Math.min(ctxMenu.y, window.innerHeight - ctxItems.length * 36 - 12),
            }}
          >
            {ctxItems.map((it, i) => (
              <button
                key={i}
                onClick={() => {
                  it.act();
                  closeCtx();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium hover:bg-app-bg ${
                  it.danger ? "text-app-danger" : "text-app-text"
                }`}
              >
                {it.label}
                {it.shortcut && <span className="text-[10.5px] text-app-faint">{it.shortcut}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
