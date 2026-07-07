// §7.1 렌더러 — Schema → Fabric 객체. 차트는 외부 라이브러리 없이 Fabric 도형으로 직접 그린다.
import {
  Canvas,
  Ellipse,
  FabricImage,
  FabricObject,
  Group,
  Line,
  Path,
  Polyline,
  Rect,
  Shadow,
  StaticCanvas,
  Textbox,
} from "fabric";
import type {
  ChartElement,
  ImageElement,
  ShapeElement,
  Slide,
  SlideDims,
  SlideElement,
  TextElement,
} from "./schema";
import { SLIDE_H, SLIDE_W } from "./schema";
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
  return obj;
}

const DEFAULT_LINE_HEIGHT = 1.4;

function buildText(el: TextElement, theme: Theme): FabricObject {
  const style = theme.roleStyles[el.role];
  const tb = new Textbox(el.text, {
    left: el.x,
    top: el.y,
    width: el.w,
    fontSize: el.fontSize ?? style.fontSize,
    fontWeight: el.fontWeight ?? style.fontWeight,
    fill: el.color ? resolveColor(theme, el.color) : resolveRoleColor(theme, el.role),
    fontFamily: theme.fontFamily,
    textAlign: el.align ?? "left",
    lineHeight: el.lineHeight ?? DEFAULT_LINE_HEIGHT,
    splitByGrapheme: false,
  });
  return attach(tb, el);
}

function buildShape(el: ShapeElement, theme: Theme): FabricObject {
  const fill = el.fill ? resolveColor(theme, el.fill) : theme.accent;
  const stroke = el.stroke ? resolveColor(theme, el.stroke) : undefined;
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
    case "ellipse":
      obj = new Ellipse({ ...common, rx: el.w / 2, ry: el.h / 2 });
      break;
    case "line":
      obj = new Line([el.x, el.y + el.h / 2, el.x + el.w, el.y + el.h / 2], {
        stroke: el.stroke ?? el.fill ?? theme.textSecondary,
        strokeWidth: el.strokeWidth ?? 4,
      });
      break;
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
  }
  return attach(obj, el);
}

// ===== 차트 (Fabric 도형 그룹) =====

const CHART_LABEL_SIZE = 20;
const CHART_AXIS_GAP = 44; // 라벨 영역 높이

interface PlotArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

function chartFrame(el: ChartElement, theme: Theme, parts: FabricObject[]): PlotArea {
  // 로컬 좌표(0,0 기준)로 그린 뒤 Group을 el.x/y에 배치
  let topOffset = 0;
  if (el.title) {
    parts.push(
      new Textbox(el.title, {
        left: 0,
        top: 0,
        width: el.w,
        fontSize: 26,
        fontWeight: 600,
        fill: theme.textPrimary,
        fontFamily: theme.fontFamily,
        textAlign: "center",
      }),
    );
    topOffset = 56;
  }
  const legendH = el.series.length > 1 && el.chartType !== "pie" ? 40 : 0;
  if (legendH) {
    let lx = 0;
    el.series.forEach((s, i) => {
      parts.push(
        new Rect({
          left: lx,
          top: topOffset + 6,
          width: 18,
          height: 18,
          fill: theme.chartPalette[i % theme.chartPalette.length],
          rx: 4,
          ry: 4,
        }),
      );
      const label = new Textbox(s.name, {
        left: lx + 26,
        top: topOffset + 4,
        width: 200,
        fontSize: CHART_LABEL_SIZE,
        fill: theme.textSecondary,
        fontFamily: theme.fontFamily,
      });
      parts.push(label);
      lx += 26 + Math.min(200, s.name.length * CHART_LABEL_SIZE * 0.75) + 32;
    });
  }
  return {
    x: 0,
    y: topOffset + legendH,
    w: el.w,
    h: el.h - topOffset - legendH,
  };
}

function axisLabels(
  labels: string[],
  plot: PlotArea,
  theme: Theme,
  parts: FabricObject[],
) {
  const slotW = plot.w / labels.length;
  labels.forEach((label, i) => {
    parts.push(
      new Textbox(label, {
        left: plot.x + i * slotW,
        top: plot.y + plot.h - CHART_AXIS_GAP + 12,
        width: slotW,
        fontSize: CHART_LABEL_SIZE,
        fill: theme.textSecondary,
        fontFamily: theme.fontFamily,
        textAlign: "center",
      }),
    );
  });
}

function buildBarChart(el: ChartElement, theme: Theme, parts: FabricObject[], plot: PlotArea) {
  const innerH = plot.h - CHART_AXIS_GAP;
  const maxVal = Math.max(1, ...el.series.flatMap((s) => s.values));
  const groups = el.labels.length;
  const slotW = plot.w / groups;
  const barAreaW = slotW * 0.6;
  const barW = barAreaW / el.series.length;

  el.labels.forEach((_, i) => {
    el.series.forEach((s, si) => {
      const v = s.values[i] ?? 0;
      const barH = Math.max(2, (v / maxVal) * (innerH - 8));
      parts.push(
        new Rect({
          left: plot.x + i * slotW + (slotW - barAreaW) / 2 + si * barW,
          top: plot.y + innerH - barH,
          width: Math.max(4, barW - 6),
          height: barH,
          fill: theme.chartPalette[si % theme.chartPalette.length],
          rx: 4,
          ry: 4,
        }),
      );
    });
  });
  parts.push(
    new Line([plot.x, plot.y + innerH, plot.x + plot.w, plot.y + innerH], {
      stroke: theme.textSecondary,
      strokeWidth: 2,
      opacity: 0.5,
    }),
  );
  axisLabels(el.labels, plot, theme, parts);
}

function buildLineChart(el: ChartElement, theme: Theme, parts: FabricObject[], plot: PlotArea) {
  const innerH = plot.h - CHART_AXIS_GAP;
  const maxVal = Math.max(1, ...el.series.flatMap((s) => s.values));
  const n = el.labels.length;
  const slotW = plot.w / n;
  const pointX = (i: number) => plot.x + slotW * (i + 0.5);
  const pointY = (v: number) => plot.y + innerH - (v / maxVal) * (innerH - 16) - 4;

  el.series.forEach((s, si) => {
    const color = theme.chartPalette[si % theme.chartPalette.length];
    const pts = s.values.slice(0, n).map((v, i) => ({ x: pointX(i), y: pointY(v) }));
    parts.push(
      new Polyline(pts, {
        stroke: color,
        strokeWidth: 5,
        fill: "transparent",
        strokeLineJoin: "round",
      }),
    );
    pts.forEach((p) => {
      parts.push(
        new Ellipse({ left: p.x - 7, top: p.y - 7, rx: 7, ry: 7, fill: color }),
      );
    });
  });
  parts.push(
    new Line([plot.x, plot.y + innerH, plot.x + plot.w, plot.y + innerH], {
      stroke: theme.textSecondary,
      strokeWidth: 2,
      opacity: 0.5,
    }),
  );
  axisLabels(el.labels, plot, theme, parts);
}

function buildPieChart(el: ChartElement, theme: Theme, parts: FabricObject[], plot: PlotArea) {
  const values = el.series[0]?.values.slice(0, el.labels.length) ?? [];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const r = Math.min(plot.w * 0.5, plot.h) / 2 - 8;
  const cx = plot.x + plot.w * 0.3;
  const cy = plot.y + plot.h / 2;

  let angle = -Math.PI / 2;
  values.forEach((v, i) => {
    const sweep = (v / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const largeArc = sweep > Math.PI ? 1 : 0;
    parts.push(
      new Path(
        `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} Z`,
        { fill: theme.chartPalette[i % theme.chartPalette.length], strokeWidth: 0 },
      ),
    );
  });

  // 범례 (우측)
  const legendX = plot.x + plot.w * 0.62;
  let ly = cy - el.labels.length * 22;
  el.labels.forEach((label, i) => {
    parts.push(
      new Rect({
        left: legendX,
        top: ly + 2,
        width: 18,
        height: 18,
        fill: theme.chartPalette[i % theme.chartPalette.length],
        rx: 4,
        ry: 4,
      }),
    );
    const pct = Math.round(((values[i] ?? 0) / total) * 100);
    parts.push(
      new Textbox(`${label} (${pct}%)`, {
        left: legendX + 28,
        top: ly,
        width: plot.w * 0.38 - 28,
        fontSize: CHART_LABEL_SIZE,
        fill: theme.textPrimary,
        fontFamily: theme.fontFamily,
      }),
    );
    ly += 44;
  });
}

function buildChart(el: ChartElement, theme: Theme): FabricObject {
  const parts: FabricObject[] = [];
  const plot = chartFrame(el, theme, parts);
  if (el.chartType === "bar") buildBarChart(el, theme, parts, plot);
  else if (el.chartType === "line") buildLineChart(el, theme, parts, plot);
  else buildPieChart(el, theme, parts, plot);

  // 차트는 통째로 이동/크기조절만 가능 — 내부 개별 선택 금지
  const group = new Group(parts, {
    left: el.x,
    top: el.y,
    subTargetCheck: false,
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
  }
}

export type AnyCanvas = Canvas | StaticCanvas;

/** 슬라이드 배경 종이(선택 불가) — 캔버스 주변(#EDEDEA) 위에 떠 보이게 그림자 처리 */
function buildBackground(theme: Theme, shadow: boolean, dims: SlideDims): Rect {
  return new Rect({
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
  canvas.add(buildBackground(theme, opts.shadow ?? true, opts.dims ?? DEFAULT_DIMS));
  objects.forEach((obj) => canvas.add(obj));
  canvas.requestRenderAll();
}
