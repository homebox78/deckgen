// §7.2 역동기화 — Fabric 편집 결과를 Schema로 반영 (Fabric → store 단방향)
import { Canvas, Ellipse, FabricObject, Group, Line, Path, Textbox } from "fabric";
import { getElementData } from "./fabricRenderer";
import type { SlideElement, TextElement } from "./schema";

// Fabric에서 비롯된 store 갱신은 캔버스가 이미 최신이므로 재렌더를 건너뛴다.
// (SlideCanvas가 렌더 직전에 consume — 무한 루프/선택 해제 방지)
let internalUpdate = false;

export function consumeInternalUpdate(): boolean {
  const v = internalUpdate;
  internalUpdate = false;
  return v;
}

function markInternal(): void {
  internalUpdate = true;
}

/** 외부(속성 패널 라이브 편집)에서 다음 재렌더를 스킵하도록 표시 */
export function markInternalUpdate(): void {
  internalUpdate = true;
}

export interface SyncHandlers {
  updateElement: (elementId: string, patch: Partial<SlideElement>) => void;
  onSelect: (elementId: string | null) => void;
}

const r = Math.round;

/** object:modified — x/y/w/h/rotation 반영. scaleX/Y는 w/h에 반영 후 1로 리셋 */
function syncModified(obj: FabricObject, h: SyncHandlers): void {
  const data = getElementData(obj);
  if (!data) return;

  const base = {
    x: r(obj.left ?? 0),
    y: r(obj.top ?? 0),
    rotation: r(obj.angle ?? 0),
  };

  if (obj instanceof Textbox) {
    // 코너 스케일 → fontSize에 반영, 사이드 스케일 → width에 반영
    let patch: Partial<TextElement> = { ...base };
    if (obj.scaleX !== 1 || obj.scaleY !== 1) {
      const newFont = Math.max(8, r(obj.fontSize * obj.scaleY));
      obj.set({
        width: obj.getScaledWidth(),
        fontSize: newFont,
        scaleX: 1,
        scaleY: 1,
      });
      patch = { ...patch, fontSize: newFont };
    }
    patch = { ...patch, w: r(obj.width), h: r(obj.height) };
    markInternal();
    h.updateElement(data.elementId, patch);
    return;
  }

  const w = r(obj.getScaledWidth());
  const hgt = r(obj.getScaledHeight());

  if (obj instanceof Group || obj instanceof Line || obj instanceof Path) {
    // 차트/화살표 그룹·선·펜 획은 스케일을 유지한 채 schema만 갱신 →
    // 다음 전체 재렌더 때 새 크기로 정규화되어 다시 그려진다.
    h.updateElement(data.elementId, { ...base, w, h: hgt });
    return;
  }

  if (obj instanceof Ellipse) {
    obj.set({ rx: w / 2, ry: hgt / 2, scaleX: 1, scaleY: 1 });
  } else {
    obj.set({ width: w, height: hgt, scaleX: 1, scaleY: 1 });
  }
  markInternal();
  h.updateElement(data.elementId, { ...base, w, h: hgt });
}

/** 캔버스에 역동기화 리스너 부착. 반환값은 해제 함수 */
export function attachSync(canvas: Canvas, h: SyncHandlers): () => void {
  const onModified = ({ target }: { target?: FabricObject }) => {
    if (target) syncModified(target, h);
  };

  const onTextExited = ({ target }: { target?: FabricObject }) => {
    if (!(target instanceof Textbox)) return;
    const data = getElementData(target);
    if (!data) return;
    markInternal();
    h.updateElement(data.elementId, {
      text: target.text,
      h: r(target.height),
    } as Partial<TextElement>);
  };

  const onSelection = () => {
    const active = canvas.getActiveObjects();
    if (active.length === 1) {
      h.onSelect(getElementData(active[0])?.elementId ?? null);
    } else {
      h.onSelect(null);
    }
  };
  const onCleared = () => h.onSelect(null);

  canvas.on("object:modified", onModified);
  canvas.on("text:editing:exited", onTextExited);
  canvas.on("selection:created", onSelection);
  canvas.on("selection:updated", onSelection);
  canvas.on("selection:cleared", onCleared);

  return () => {
    canvas.off("object:modified", onModified);
    canvas.off("text:editing:exited", onTextExited);
    canvas.off("selection:created", onSelection);
    canvas.off("selection:updated", onSelection);
    canvas.off("selection:cleared", onCleared);
  };
}
