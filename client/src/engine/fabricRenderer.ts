// §7.1 렌더러 — Schema → Fabric 객체. 차트는 외부 라이브러리 없이 Fabric 도형으로 직접 그린다.
import {
  Canvas,
  Ellipse,
  FabricImage,
  FabricObject,
  Gradient,
  Group,
  Line,
  Path,
  Polygon,
  Rect,
  Shadow,
  StaticCanvas,
  Textbox,
  Triangle,
} from "fabric";
import type {
  ChartElement,
  ImageElement,
  ShapeElement,
  Slide,
  SlideDims,
  SlideElement,
  TableElement,
  TextElement,
} from "./schema";
import { SLIDE_H, SLIDE_W } from "./schema";
import { decomposeChart } from "./chartDecompose";
import type { Theme } from "./themes";
import { resolveColor, resolveRoleColor } from "./themes";

export interface ElementData {
  elementId: string;
  kind: SlideElement["type"];
}

/** Fabric 객체에 부착한 elementId를 읽는다 */
export function getElementData(obj: FabricObject): ElementData | undefined {
  return (obj as FabricObject & { data?: ElementData }).data;
}

function attach(obj: FabricObject, el: SlideElement): FabricObject {
  Object.assign(obj, { data: { elementId: el.id, kind: el.type } satisfies ElementData });
  if (el.rotation) obj.set({ angle: el.rotation });
  if (el.opacity !== undefined) obj.set({ opacity: el.opacity });
  if (el.shadow) {
    obj.set({ shadow: new Shadow({ color: "rgba(0,0,0,0.28)", blur: 24, offsetX: 0, offsetY: 8 }) });
  }
  if (el.locked) {
    // 잠금: 선택은 가능(속성 패널에서 해제), 이동/크기/회전/인라인 편집 차단
    obj.set({
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasControls: false,
      editable: false,
      hoverCursor: "not-allowed",
    } as Partial<FabricObject>);
  }
  return obj;
}

const DEFAULT_LINE_HEIGHT = 1.4;

function buildText(el: TextElement, theme: Theme): FabricObject {
  const style = theme.roleStyles[el.role];
  const fontSize = el.fontSize ?? style.fontSize;
  const tb = new Textbox(el.text, {
    left: el.x,
    top: el.y,
    width: el.w,
    fontSize,
    fontWeight: el.fontWeight ?? style.fontWeight,
    fill: el.color ? resolveColor(theme, el.color) : resolveRoleColor(theme, el.role),
    fontFamily: theme.fontFamily,
    textAlign: el.align ?? "left",
    lineHeight: el.lineHeight ?? DEFAULT_LINE_HEIGHT,
    splitByGrapheme: false,
    fontStyle: el.italic ? "italic" : "normal",
    underline: !!el.underline,
    linethrough: !!el.strike,
    // Fabric charSpacing 단위 = 1/1000 em
    charSpacing: el.letterSpacing ? (el.letterSpacing / fontSize) * 1000 : 0,
  });
  return attach(tb, el);
}

function buildShape(el: ShapeElement, theme: Theme): FabricObject {
  const baseColor = el.fill ? resolveColor(theme, el.fill) : theme.accent;
  const stroke = el.stroke ? resolveColor(theme, el.stroke) : undefined;
  // gradient fill (P3) — linear/circular. 끝 색 미지정 시 base를 어둡게
  const toColor = el.fillTo ? resolveColor(theme, el.fillTo) : mixHex(baseColor, "#000000", 0.35);
  let fill: string | Gradient<"linear"> | Gradient<"radial"> = baseColor;
  if (el.fillType === "linear") {
    fill = new Gradient({
      type: "linear",
      gradientUnits: "pixels",
      coords: { x1: 0, y1: 0, x2: el.w, y2: el.h },
      colorStops: [
        { offset: 0, color: baseColor },
        { offset: 1, color: toColor },
      ],
    });
  } else if (el.fillType === "circular") {
    fill = new Gradient({
      type: "radial",
      gradientUnits: "pixels",
      coords: { x1: el.w / 2, y1: el.h / 2, r1: 0, x2: el.w / 2, y2: el.h / 2, r2: Math.max(el.w, el.h) / 2 },
      colorStops: [
        { offset: 0, color: baseColor },
        { offset: 1, color: toColor },
      ],
    });
  }
  const common = {
    left: el.x,
    top: el.y,
    fill,
    stroke,
    strokeWidth: el.strokeWidth ?? 0,
  };
  let obj: FabricObject;
  switch (el.shape) {
    case "rect":
      obj = new Rect({ ...common, width: el.w, height: el.h });
      break;
    case "roundRect": {
      const r = el.radius ?? 16;
      obj = new Rect({ ...common, width: el.w, height: el.h, rx: r, ry: r });
      break;
    }
    case "pill": {
      // 알약: 라운드가 높이 절반
      const r = Math.min(el.w, el.h) / 2;
      obj = new Rect({ ...common, width: el.w, height: el.h, rx: r, ry: r });
      break;
    }
    case "ellipse":
      obj = new Ellipse({ ...common, rx: el.w / 2, ry: el.h / 2 });
      break;
    case "triangle":
      obj = new Triangle({ ...common, width: el.w, height: el.h });
      break;
    case "diamond":
      obj = new Polygon(
        [
          { x: el.w / 2, y: 0 },
          { x: el.w, y: el.h / 2 },
          { x: el.w / 2, y: el.h },
          { x: 0, y: el.h / 2 },
        ],
        { ...common },
      );
      break;
    case "star": {
      // 5각 별 (외/내 반지름)
      const cx = el.w / 2;
      const cy = el.h / 2;
      const rO = Math.min(el.w, el.h) / 2;
      const rI = rO * 0.4;
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? rO : rI;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      obj = new Polygon(pts, { ...common });
      break;
    }
    case "line": {
      // slope 지정 시 대각선 (차트 분해 선분용): down=좌상→우하, up=좌하→우상
      const [y1, y2] = el.slope
        ? el.slope === "down"
          ? [el.y, el.y + el.h]
          : [el.y + el.h, el.y]
        : [el.y + el.h / 2, el.y + el.h / 2];
      obj = new Line([el.x, y1, el.x + el.w, y2], {
        stroke: el.stroke ? resolveColor(theme, el.stroke) : (el.fill ? baseColor : theme.textSecondary),
        strokeWidth: el.strokeWidth ?? 4,
        strokeLineCap: "round",
      });
      break;
    }
    case "arrow": {
      // 수평 화살표: 몸통 선 + 삼각 머리
      const yMid = el.h / 2;
      const headL = Math.min(36, el.w * 0.25);
      const color = el.stroke ?? el.fill ?? theme.textSecondary;
      const sw = el.strokeWidth ?? 4;
      const body = new Line([0, yMid, el.w - headL, yMid], {
        stroke: color,
        strokeWidth: sw,
      });
      const head = new Path(
        `M ${el.w - headL} ${yMid - headL / 2} L ${el.w} ${yMid} L ${el.w - headL} ${yMid + headL / 2} Z`,
        { fill: color, strokeWidth: 0 },
      );
      obj = new Group([body, head], { left: el.x, top: el.y });
      break;
    }
    case "pie": {
      // 부채꼴: 바운딩 박스 내접원 + 각도 범위 (0°=3시, 시계방향)
      const r = Math.min(el.w, el.h) / 2;
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      const a0 = ((el.angleStart ?? 0) * Math.PI) / 180;
      const sweepDeg = Math.min(359.99, Math.max(0.01, (el.angleEnd ?? 360) - (el.angleStart ?? 0)));
      const a1 = a0 + (sweepDeg * Math.PI) / 180;
      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const largeArc = sweepDeg > 180 ? 1 : 0;
      obj = new Path(
        `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`,
        { fill, stroke, strokeWidth: el.strokeWidth ?? 0 },
      );
      break;
    }
  }
  return attach(obj, el);
}

// ===== 차트 (Fabric 도형 그룹) =====
// 기하는 chartDecompose.ts가 단일 소스 — 분해된 요소를 그대로 그려 그룹으로 묶는다.
// (차트 더블클릭 "분해" 전후가 픽셀 단위로 동일해지는 근거)

function buildChart(el: ChartElement, theme: Theme): FabricObject {
  const localParts = decomposeChart({ ...el, x: 0, y: 0 }, theme);
  const parts = localParts.map((p) =>
    p.type === "text" ? buildText(p, theme) : buildShape(p as ShapeElement, theme),
  );
  const group = new Group(parts, {
    left: el.x,
    top: el.y,
    subTargetCheck: false, // 그룹 상태에선 통짜 선택 — 개별 수정은 분해(ungroup) 후
  });
  return attach(group, el);
}

async function buildImage(el: ImageElement): Promise<FabricObject> {
  const img = await FabricImage.fromURL(el.src);
  const scaleContain = Math.min(el.w / img.width, el.h / img.height);
  const scaleCover = Math.max(el.w / img.width, el.h / img.height);
  const scale = el.fit === "cover" ? scaleCover : scaleContain;
  img.set({
    left: el.x + (el.w - img.width * scale) / 2,
    top: el.y + (el.h - img.height * scale) / 2,
    scaleX: scale,
    scaleY: scale,
  });
  if (el.fit === "cover") {
    img.set({
      clipPath: new Rect({
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        absolutePositioned: true,
      }),
    });
  }
  return attach(img, el);
}

// ===== 표 (Fabric 그룹) — 그리드 Rect + 셀 Textbox =====
function buildTable(el: TableElement, theme: Theme): FabricObject {
  const rows = el.rows.length || 1;
  const cols = Math.max(1, ...el.rows.map((r) => r.length));
  const rowH = el.h / rows;
  const colW = el.w / cols;
  const parts: FabricObject[] = [];
  el.rows.forEach((row, r) => {
    for (let c = 0; c < cols; c++) {
      const isHeader = el.headerRow && r === 0;
      parts.push(
        new Rect({
          left: c * colW,
          top: r * rowH,
          width: colW,
          height: rowH,
          fill: isHeader ? mixHex(theme.bg, theme.accent, 0.12) : theme.surface,
          stroke: theme.textSecondary,
          strokeWidth: 1,
          opacity: isHeader ? 1 : 1,
        }),
      );
      parts.push(
        new Textbox(row[c] ?? "", {
          left: c * colW + 14,
          top: r * rowH + rowH / 2 - 14,
          width: colW - 28,
          fontSize: 24,
          fontWeight: isHeader ? 700 : 400,
          fill: theme.textPrimary,
          fontFamily: theme.fontFamily,
          textAlign: "left",
        }),
      );
    }
  });
  const group = new Group(parts, { left: el.x, top: el.y, subTargetCheck: false });
  return attach(group, el);
}

export async function buildElement(
  el: SlideElement,
  theme: Theme,
): Promise<FabricObject> {
  switch (el.type) {
    case "text":
      return buildText(el, theme);
    case "shape":
      return buildShape(el, theme);
    case "chart":
      return buildChart(el, theme);
    case "image":
      return buildImage(el);
    case "table":
      return buildTable(el, theme);
  }
}

export type AnyCanvas = Canvas | StaticCanvas;

/** hex 두 색을 t(0~1)로 섞는다 */
function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace("#", "");
  const pb = b.replace("#", "");
  const ai = [0, 2, 4].map((i) => parseInt(pa.slice(i, i + 2) || "0", 16));
  const bi = [0, 2, 4].map((i) => parseInt(pb.slice(i, i + 2) || "0", 16));
  const m = ai.map((v, i) => Math.round(v + (bi[i] - v) * t));
  return "#" + m.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** 슬라이드 배경 종이(선택 불가) — 배경 변형(테마/틴트/그라디언트/스포트) 지원 */
function buildBackground(
  theme: Theme,
  shadow: boolean,
  dims: SlideDims,
  bg: import("./schema").SlideBackground = "theme",
): Rect {
  const rect = new Rect({
    left: 0,
    top: 0,
    width: dims.w,
    height: dims.h,
    fill: theme.bg,
    selectable: false,
    evented: false,
    hoverCursor: "default",
    shadow: shadow
      ? new Shadow({ color: "rgba(0,0,0,0.18)", blur: 48, offsetY: 10 })
      : undefined,
  });
  const tint = mixHex(theme.bg, theme.accent, 0.08);
  if (bg === "tint") {
    rect.set({ fill: tint });
  } else if (bg === "gradient") {
    rect.set({
      fill: new Gradient({
        type: "linear",
        gradientUnits: "pixels",
        coords: { x1: 0, y1: 0, x2: dims.w, y2: dims.h },
        colorStops: [
          { offset: 0, color: theme.bg },
          { offset: 1, color: mixHex(theme.bg, theme.accent, 0.16) },
        ],
      }),
    });
  } else if (bg === "spot") {
    rect.set({
      fill: new Gradient({
        type: "radial",
        gradientUnits: "pixels",
        coords: { x1: dims.w * 0.8, y1: dims.h * 0.15, r1: 0, x2: dims.w * 0.8, y2: dims.h * 0.15, r2: dims.w * 0.7 },
        colorStops: [
          { offset: 0, color: mixHex(theme.bg, theme.accent, 0.22) },
          { offset: 1, color: theme.bg },
        ],
      }),
    });
  }
  return rect;
}

const DEFAULT_DIMS: SlideDims = { w: SLIDE_W, h: SLIDE_H };

/** 슬라이드 → 축소 PNG dataURL (썸네일용) */
export async function renderSlideToDataURL(
  slide: Slide,
  theme: Theme,
  width = 240,
  dims: SlideDims = DEFAULT_DIMS,
): Promise<string> {
  const el = document.createElement("canvas");
  const s = width / dims.w;
  const sc = new StaticCanvas(el, { width, height: Math.round(dims.h * s) });
  sc.viewportTransform = [s, 0, 0, s, 0, 0];
  await renderSlide(sc, slide, theme, { shadow: false, dims });
  sc.renderAll();
  const url = sc.toDataURL({ format: "png", multiplier: 1 });
  void sc.dispose();
  return url;
}

/** Schema → Fabric. elements 배열 순서 = z-order */
export async function renderSlide(
  canvas: AnyCanvas,
  slide: Slide,
  theme: Theme,
  opts: { shadow?: boolean; dims?: SlideDims } = {},
): Promise<void> {
  const objects = await Promise.all(slide.elements.map((el) => buildElement(el, theme)));
  canvas.clear();
  canvas.add(buildBackground(theme, opts.shadow ?? true, opts.dims ?? DEFAULT_DIMS, slide.background));
  objects.forEach((obj) => canvas.add(obj));
  canvas.requestRenderAll();
}
