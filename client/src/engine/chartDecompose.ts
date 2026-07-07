// 차트 → 일반 스키마 요소 분해 (§7.1 차트 분해)
// 이 모듈이 차트 기하의 단일 소스다: fabricRenderer.buildChart가 여기서 나온 요소를
// 그대로 그리므로, "그룹 차트"와 "분해된 차트"는 픽셀 단위로 동일하다.
import type { ChartElement, ShapeElement, SlideElement, TextElement } from "./schema";
import { uid } from "./schema";
import type { Theme } from "./themes";

const LABEL_SIZE = 20;
const AXIS_GAP = 44; // 라벨 영역 높이

interface PlotArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

function text(
  p: Omit<TextElement, "id" | "type" | "role"> & { role?: TextElement["role"] },
): TextElement {
  return { id: uid(), type: "text", role: p.role ?? "caption", ...p };
}

function shape(p: Omit<ShapeElement, "id" | "type">): ShapeElement {
  return { id: uid(), type: "shape", ...p };
}

/** 제목 + 범례 → plot 영역 계산 (렌더러 chartFrame과 동일 수학) */
function frame(el: ChartElement, theme: Theme, out: SlideElement[]): PlotArea {
  let topOffset = 0;
  if (el.title) {
    out.push(
      text({
        text: el.title,
        x: el.x,
        y: el.y,
        w: el.w,
        h: 36,
        fontSize: 26,
        fontWeight: 600,
        color: theme.textPrimary,
        align: "center",
      }),
    );
    topOffset = 56;
  }
  const legendH = el.series.length > 1 && el.chartType !== "pie" ? 40 : 0;
  if (legendH) {
    let lx = 0;
    el.series.forEach((s, i) => {
      out.push(
        shape({
          shape: "roundRect",
          radius: 4,
          x: el.x + lx,
          y: el.y + topOffset + 6,
          w: 18,
          h: 18,
          fill: theme.chartPalette[i % theme.chartPalette.length],
        }),
      );
      out.push(
        text({
          text: s.name,
          x: el.x + lx + 26,
          y: el.y + topOffset + 4,
          w: 200,
          h: 28,
          fontSize: LABEL_SIZE,
          color: theme.textSecondary,
        }),
      );
      lx += 26 + Math.min(200, s.name.length * LABEL_SIZE * 0.75) + 32;
    });
  }
  return {
    x: el.x,
    y: el.y + topOffset + legendH,
    w: el.w,
    h: el.h - topOffset - legendH,
  };
}

function axisLabels(labels: string[], plot: PlotArea, theme: Theme, out: SlideElement[]) {
  const slotW = plot.w / labels.length;
  labels.forEach((label, i) => {
    out.push(
      text({
        text: label,
        x: plot.x + i * slotW,
        y: plot.y + plot.h - AXIS_GAP + 12,
        w: slotW,
        h: 28,
        fontSize: LABEL_SIZE,
        color: theme.textSecondary,
        align: "center",
      }),
    );
  });
}

function axisLine(plot: PlotArea, innerH: number, theme: Theme, out: SlideElement[]) {
  out.push(
    shape({
      shape: "line",
      x: plot.x,
      y: plot.y + innerH - 1,
      w: plot.w,
      h: 2,
      stroke: theme.textSecondary,
      strokeWidth: 2,
      opacity: 0.5,
    }),
  );
}

function decomposeBar(el: ChartElement, theme: Theme, plot: PlotArea, out: SlideElement[]) {
  const innerH = plot.h - AXIS_GAP;
  const maxVal = Math.max(1, ...el.series.flatMap((s) => s.values));
  const slotW = plot.w / el.labels.length;
  const barAreaW = slotW * 0.6;
  const barW = barAreaW / el.series.length;

  el.labels.forEach((_, i) => {
    el.series.forEach((s, si) => {
      const v = s.values[i] ?? 0;
      const barH = Math.max(2, (v / maxVal) * (innerH - 8));
      out.push(
        shape({
          shape: "roundRect",
          radius: 4,
          x: plot.x + i * slotW + (slotW - barAreaW) / 2 + si * barW,
          y: plot.y + innerH - barH,
          w: Math.max(4, barW - 6),
          h: barH,
          fill: theme.chartPalette[si % theme.chartPalette.length],
        }),
      );
    });
  });
  axisLine(plot, innerH, theme, out);
  axisLabels(el.labels, plot, theme, out);
}

function decomposeLine(el: ChartElement, theme: Theme, plot: PlotArea, out: SlideElement[]) {
  const innerH = plot.h - AXIS_GAP;
  const maxVal = Math.max(1, ...el.series.flatMap((s) => s.values));
  const n = el.labels.length;
  const slotW = plot.w / n;
  const px = (i: number) => plot.x + slotW * (i + 0.5);
  const py = (v: number) => plot.y + innerH - (v / maxVal) * (innerH - 16) - 4;

  el.series.forEach((s, si) => {
    const color = theme.chartPalette[si % theme.chartPalette.length];
    const pts = s.values.slice(0, n).map((v, i) => ({ x: px(i), y: py(v) }));
    // 폴리라인 → 선분(대각선 line) 단위로 분해
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dy = b.y - a.y;
      out.push(
        shape({
          shape: "line",
          x: a.x,
          y: Math.abs(dy) < 1 ? a.y - 1 : Math.min(a.y, b.y),
          w: b.x - a.x,
          h: Math.abs(dy) < 1 ? 2 : Math.abs(dy),
          slope: Math.abs(dy) < 1 ? undefined : dy > 0 ? "down" : "up",
          stroke: color,
          strokeWidth: 5,
        }),
      );
    }
    pts.forEach((p) => {
      out.push(
        shape({ shape: "ellipse", x: p.x - 7, y: p.y - 7, w: 14, h: 14, fill: color }),
      );
    });
  });
  axisLine(plot, innerH, theme, out);
  axisLabels(el.labels, plot, theme, out);
}

function decomposePie(el: ChartElement, theme: Theme, plot: PlotArea, out: SlideElement[]) {
  const values = el.series[0]?.values.slice(0, el.labels.length) ?? [];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const r = Math.min(plot.w * 0.5, plot.h) / 2 - 8;
  const cx = plot.x + plot.w * 0.3;
  const cy = plot.y + plot.h / 2;

  let angle = -90; // 12시 방향 시작 (0°=3시, 시계방향)
  values.forEach((v, i) => {
    const sweep = (v / total) * 360;
    out.push(
      shape({
        shape: "pie",
        x: cx - r,
        y: cy - r,
        w: r * 2,
        h: r * 2,
        angleStart: angle,
        angleEnd: angle + sweep,
        fill: theme.chartPalette[i % theme.chartPalette.length],
      }),
    );
    angle += sweep;
  });

  // 범례 (우측)
  const legendX = plot.x + plot.w * 0.62;
  let ly = cy - el.labels.length * 22;
  el.labels.forEach((label, i) => {
    out.push(
      shape({
        shape: "roundRect",
        radius: 4,
        x: legendX,
        y: ly + 2,
        w: 18,
        h: 18,
        fill: theme.chartPalette[i % theme.chartPalette.length],
      }),
    );
    const pct = Math.round(((values[i] ?? 0) / total) * 100);
    out.push(
      text({
        text: `${label} (${pct}%)`,
        x: legendX + 28,
        y: ly,
        w: plot.w * 0.38 - 28,
        h: 28,
        fontSize: LABEL_SIZE,
        color: theme.textPrimary,
      }),
    );
    ly += 44;
  });
}

/**
 * 차트를 동일 기하의 일반 요소들로 분해한다 (절대 좌표).
 * 색상은 현재 테마 값으로 확정(hex)된다 — 분해 후에는 테마 전환에 따라 재해석되지 않음.
 */
export function decomposeChart(el: ChartElement, theme: Theme): SlideElement[] {
  const out: SlideElement[] = [];
  const plot = frame(el, theme, out);
  if (el.chartType === "bar") decomposeBar(el, theme, plot, out);
  else if (el.chartType === "line") decomposeLine(el, theme, plot, out);
  else decomposePie(el, theme, plot, out);
  return out;
}
