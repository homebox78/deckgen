// §9 PPTX 내보내기 — Schema → pptxgenjs (텍스트·도형·차트 편집 가능 상태 유지)
import PptxGenJS from "pptxgenjs";
import type {
  ChartElement,
  Deck,
  ImageElement,
  ShapeElement,
  TextElement,
} from "./schema";
import { aspectDims } from "./schema";
import type { Theme } from "./themes";
import { getTheme, resolveColor, resolveRoleColor } from "./themes";

// 1920px = 13.333inch → 144px = 1inch. 폰트는 px → pt (960pt / 1920px = 0.5)
const inch = (px: number): number => +(px / 144).toFixed(4);
const pt = (px: number): number => Math.round(px * 0.5 * 10) / 10;
const hex = (color: string): string => color.replace("#", "").toUpperCase();

function addText(slide: PptxGenJS.Slide, el: TextElement, theme: Theme): void {
  const style = theme.roleStyles[el.role];
  const fontSize = el.fontSize ?? style.fontSize;
  const fontWeight = el.fontWeight ?? style.fontWeight;
  const color = el.color ? resolveColor(theme, el.color) : resolveRoleColor(theme, el.role);
  slide.addText(el.text, {
    x: inch(el.x),
    y: inch(el.y),
    w: inch(el.w),
    h: inch(el.h),
    fontFace: "Pretendard",
    fontSize: pt(fontSize),
    color: hex(color),
    bold: fontWeight >= 600,
    align: el.align ?? "left",
    valign: "top",
    lineSpacingMultiple: el.lineHeight ?? 1.4,
    margin: 0,
    rotate: el.rotation ?? 0,
    transparency: el.opacity !== undefined ? (1 - el.opacity) * 100 : 0,
  });
}

function addShape(slide: PptxGenJS.Slide, el: ShapeElement, theme: Theme): void {
  const fill = hex(el.fill ? resolveColor(theme, el.fill) : theme.accent);
  const stroke = el.stroke ? hex(resolveColor(theme, el.stroke)) : undefined;
  const base = {
    x: inch(el.x),
    y: inch(el.y),
    w: inch(el.w),
    h: inch(el.h),
    rotate: el.rotation ?? 0,
  };

  switch (el.shape) {
    case "line":
    case "arrow":
      slide.addShape("line", {
        ...base,
        y: inch(el.y + el.h / 2),
        h: 0,
        line: {
          color: stroke ?? fill,
          width: pt(el.strokeWidth ?? 4),
          ...(el.shape === "arrow" ? { endArrowType: "triangle" as const } : {}),
        },
      });
      return;
    case "rect":
    case "roundRect":
    case "ellipse": {
      const type =
        el.shape === "rect" ? "rect" : el.shape === "roundRect" ? "roundRect" : "ellipse";
      slide.addShape(type, {
        ...base,
        fill: { color: fill },
        ...(stroke
          ? { line: { color: stroke, width: pt(el.strokeWidth ?? 2) } }
          : { line: { type: "none" } }),
        ...(el.shape === "roundRect" ? { rectRadius: inch(el.radius ?? 16) } : {}),
      });
    }
  }
}

function addChart(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  el: ChartElement,
  theme: Theme,
): void {
  const colors = theme.chartPalette.map(hex);
  const base = {
    x: inch(el.x),
    y: inch(el.y),
    w: inch(el.w),
    h: inch(el.h),
    chartColors: colors,
    showTitle: !!el.title,
    title: el.title,
    titleFontSize: 13,
    titleColor: hex(theme.textPrimary),
    catAxisLabelColor: hex(theme.textSecondary),
    valAxisLabelColor: hex(theme.textSecondary),
    catAxisLabelFontFace: "Pretendard",
    valAxisLabelFontFace: "Pretendard",
    legendColor: hex(theme.textSecondary),
    legendFontFace: "Pretendard",
  };

  if (el.chartType === "pie") {
    slide.addChart(
      pptx.ChartType.pie,
      [
        {
          name: el.series[0]?.name ?? "비율",
          labels: el.labels,
          values: el.series[0]?.values ?? [],
        },
      ],
      { ...base, showPercent: true, showLegend: true, legendPos: "r" },
    );
    return;
  }

  const data = el.series.map((s) => ({
    name: s.name,
    labels: el.labels,
    values: s.values,
  }));
  slide.addChart(
    el.chartType === "bar" ? pptx.ChartType.bar : pptx.ChartType.line,
    data,
    {
      ...base,
      barDir: "col",
      showLegend: el.series.length > 1,
      legendPos: "t",
      ...(el.chartType === "line" ? { lineSize: 2.5, lineSmooth: false } : {}),
    },
  );
}

function addImage(slide: PptxGenJS.Slide, el: ImageElement): void {
  slide.addImage({
    data: el.src,
    x: inch(el.x),
    y: inch(el.y),
    w: inch(el.w),
    h: inch(el.h),
    sizing: { type: el.fit, w: inch(el.w), h: inch(el.h) },
    rotate: el.rotation ?? 0,
  });
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return (cleaned || "presentation") + ".pptx";
}

export async function exportDeckToPptx(deck: Deck): Promise<void> {
  const theme = getTheme(deck.themeId);
  const dims = aspectDims(deck.aspect);
  const pptx = new PptxGenJS();
  // 144px = 1inch — 16:9는 13.333×7.5, 4:5 카드뉴스는 7.5×9.375
  pptx.defineLayout({ name: "DECK", width: dims.w / 144, height: dims.h / 144 });
  pptx.layout = "DECK";
  pptx.title = deck.title;

  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(theme.bg) };
    for (const el of s.elements) {
      switch (el.type) {
        case "text":
          addText(slide, el, theme);
          break;
        case "shape":
          addShape(slide, el, theme);
          break;
        case "chart":
          addChart(pptx, slide, el, theme);
          break;
        case "image":
          addImage(slide, el);
          break;
      }
    }
    if (s.notes) slide.addNotes(s.notes);
  }

  await pptx.writeFile({ fileName: sanitizeFileName(deck.title) });
}
