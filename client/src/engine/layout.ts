// §5 레이아웃 엔진 — LLM은 레이아웃 ID + 콘텐츠만 정하고, 좌표는 이 모듈이 계산한다.
// 16:9(1920×1080)와 4:5 카드뉴스(1080×1350, 안전영역 여백·세로 스택)를 모두 지원.
import type {
  DeckAspect,
  LayoutId,
  Slide,
  SlideContent,
  SlideElement,
  TextElement,
} from "./schema";
import { aspectDims, uid } from "./schema";
import type { Theme } from "./themes";

interface Geo {
  W: number;
  H: number;
  M: number; // 공통 여백 (4:5는 SNS 크롭 안전영역 겸용)
  TITLE_H: number;
  BODY_Y: number;
  BODY_H: number;
  CW: number; // 콘텐츠 폭
  vertical: boolean; // 4:5 — 좌우 분할 대신 세로 스택
}

function geoOf(aspect: DeckAspect): Geo {
  const { w: W, h: H } = aspectDims(aspect);
  const vertical = aspect === "4:5";
  const M = vertical ? 84 : 96;
  const TITLE_H = vertical ? 190 : 160;
  const BODY_Y = M + TITLE_H;
  return { W, H, M, TITLE_H, BODY_Y, BODY_H: H - M - BODY_Y, CW: W - M * 2, vertical };
}

const BULLET_PREFIX = "•  ";
const MAX_BULLET_LINES = 6;
const MIN_BODY_FONT = 20;

function text(partial: Omit<TextElement, "id" | "type">): TextElement {
  return { id: uid(), type: "text", ...partial };
}

/** 불릿 배열 → 단일 body TextElement (+오버플로 시 잘린 불릿을 notes로 반환) */
function bulletsBlock(
  bullets: string[],
  box: { x: number; y: number; w: number; h: number },
): { element: TextElement; overflowNotes?: string } {
  let fontSize: number | undefined;
  let visible = bullets;
  let overflowNotes: string | undefined;

  if (bullets.length > MAX_BULLET_LINES) {
    // 6줄 초과 시 단계적 축소 (28 → 2px씩, 최소 20)
    fontSize = Math.max(MIN_BODY_FONT, 28 - (bullets.length - MAX_BULLET_LINES) * 2);
    // 최소 크기로도 담을 수 없는 분량이면 잘라내고 notes로 이동
    const lineH = fontSize * 1.4 * 1.6; // 불릿 간 여유 포함 대략치
    const maxLines = Math.max(MAX_BULLET_LINES, Math.floor(box.h / lineH));
    if (bullets.length > maxLines) {
      visible = bullets.slice(0, maxLines);
      overflowNotes = "슬라이드에서 생략된 불릿:\n" + bullets.slice(maxLines).join("\n");
    }
  }

  return {
    element: text({
      ...box,
      text: visible.map((b) => BULLET_PREFIX + b).join("\n"),
      role: "body",
      ...(fontSize !== undefined ? { fontSize } : {}),
      lineHeight: 1.7,
    }),
    overflowNotes,
  };
}

function titleBar(g: Geo, title: string): TextElement {
  return text({
    x: g.M,
    y: g.M + 16,
    w: g.CW,
    h: g.TITLE_H - 32,
    text: title,
    role: "heading",
    // 4:5 카드뉴스는 폭이 좁아 제목을 살짝 줄인다
    ...(g.vertical ? { fontSize: 52 } : {}),
  });
}

function composeElements(
  layout: LayoutId,
  content: SlideContent,
  _theme: Theme,
  g: Geo,
): { elements: SlideElement[]; notes?: string } {
  const els: SlideElement[] = [];
  let notes: string | undefined;

  switch (layout) {
    case "cover": {
      const barY = Math.round(g.H * 0.33);
      const titleY = Math.round(g.H * 0.39);
      els.push({
        id: uid(),
        type: "shape",
        shape: "rect",
        x: g.M,
        y: barY,
        w: 160,
        h: 12,
        fill: "@accent",
      });
      els.push(
        text({
          x: g.M,
          y: titleY,
          w: g.CW,
          h: Math.round(g.H * 0.24),
          text: content.title ?? "",
          role: "title",
          ...(g.vertical ? { fontSize: 64 } : {}),
        }),
      );
      if (content.subtitle) {
        els.push(
          text({
            x: g.M,
            y: Math.round(g.H * 0.66),
            w: g.CW,
            h: 100,
            text: content.subtitle,
            role: "subtitle",
          }),
        );
      }
      if (content.presenter) {
        els.push(
          text({
            x: g.M,
            y: g.H - g.M - 40,
            w: g.CW,
            h: 40,
            text: content.presenter,
            role: "caption",
          }),
        );
      }
      break;
    }

    case "section": {
      els.push(
        text({
          x: g.M,
          y: g.H / 2 - 120,
          w: g.CW,
          h: 180,
          text: content.title ?? "",
          role: "title",
          align: "center",
          ...(g.vertical ? { fontSize: 60 } : {}),
        }),
      );
      if (content.subtitle) {
        els.push(
          text({
            x: g.M,
            y: g.H / 2 + 80,
            w: g.CW,
            h: 80,
            text: content.subtitle,
            role: "subtitle",
            align: "center",
          }),
        );
      }
      break;
    }

    case "title-bullets": {
      if (content.title) els.push(titleBar(g, content.title));
      if (content.bullets?.length) {
        const { element, overflowNotes } = bulletsBlock(content.bullets, {
          x: g.M,
          y: g.BODY_Y,
          w: g.CW,
          h: g.BODY_H,
        });
        els.push(element);
        notes = overflowNotes;
      }
      break;
    }

    case "title-bullets-chart": {
      if (content.title) els.push(titleBar(g, content.title));
      if (g.vertical) {
        // 4:5 — 불릿 위 / 차트 아래 세로 스택
        const gap = 40;
        const bulletsH = Math.round(g.BODY_H * 0.38);
        if (content.bullets?.length) {
          const { element, overflowNotes } = bulletsBlock(content.bullets, {
            x: g.M,
            y: g.BODY_Y,
            w: g.CW,
            h: bulletsH,
          });
          els.push(element);
          notes = overflowNotes;
        }
        if (content.chart) {
          els.push({
            id: uid(),
            type: "chart",
            x: g.M,
            y: g.BODY_Y + bulletsH + gap,
            w: g.CW,
            h: g.BODY_H - bulletsH - gap,
            ...content.chart,
          });
        }
      } else {
        const gap = 48;
        const leftW = Math.round(g.CW * 0.55) - gap / 2;
        const rightW = g.CW - leftW - gap;
        if (content.bullets?.length) {
          const { element, overflowNotes } = bulletsBlock(content.bullets, {
            x: g.M,
            y: g.BODY_Y,
            w: leftW,
            h: g.BODY_H,
          });
          els.push(element);
          notes = overflowNotes;
        }
        if (content.chart) {
          els.push({
            id: uid(),
            type: "chart",
            x: g.M + leftW + gap,
            y: g.BODY_Y,
            w: rightW,
            h: g.BODY_H,
            ...content.chart,
          });
        }
      }
      break;
    }

    case "chart-focus": {
      if (content.title) els.push(titleBar(g, content.title));
      if (content.chart) {
        const inset = g.vertical ? 0 : 120;
        els.push({
          id: uid(),
          type: "chart",
          x: g.M + inset,
          y: g.BODY_Y,
          w: g.CW - inset * 2,
          h: g.BODY_H,
          ...content.chart,
        });
      }
      break;
    }

    case "kpi-cards": {
      if (content.title) els.push(titleBar(g, content.title));
      const kpis = (content.kpis ?? []).slice(0, 4);
      if (kpis.length >= 2) {
        const gap = 32;
        // 4:5는 2열 그리드로 감싼다 (좁은 폭에서 카드가 뭉개지지 않게)
        const cols = g.vertical ? Math.min(2, kpis.length) : kpis.length;
        const rows = Math.ceil(kpis.length / cols);
        const cardW = (g.CW - gap * (cols - 1)) / cols;
        const cardH = g.vertical ? 300 : 320;
        const gridH = rows * cardH + (rows - 1) * gap;
        const startY = g.BODY_Y + Math.max(0, (g.BODY_H - gridH) / 2);
        kpis.forEach((kpi, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cardX = g.M + col * (cardW + gap);
          const cardY = startY + row * (cardH + gap);
          els.push({
            id: uid(),
            type: "shape",
            shape: "roundRect",
            x: cardX,
            y: cardY,
            w: cardW,
            h: cardH,
            fill: "@surface",
            radius: 20,
          });
          els.push(
            text({
              x: cardX + 24,
              y: cardY + cardH * 0.28,
              w: cardW - 48,
              h: 90,
              text: kpi.value,
              role: "kpi-value",
              align: "center",
            }),
          );
          els.push(
            text({
              x: cardX + 24,
              y: cardY + cardH * 0.62,
              w: cardW - 48,
              h: 60,
              text: kpi.label,
              role: "kpi-label",
              align: "center",
            }),
          );
        });
      }
      break;
    }

    case "two-column": {
      if (content.title) els.push(titleBar(g, content.title));
      const cols = (content.columns ?? []).slice(0, 2);
      if (g.vertical) {
        // 4:5 — 두 블록을 세로로 스택
        const gap = 48;
        const blockH = (g.BODY_H - gap) / 2;
        cols.forEach((col, i) => {
          const blockY = g.BODY_Y + i * (blockH + gap);
          els.push(
            text({
              x: g.M,
              y: blockY,
              w: g.CW,
              h: 56,
              text: col.heading,
              role: "heading",
              fontSize: 32,
            }),
          );
          if (col.bullets.length) {
            const { element } = bulletsBlock(col.bullets, {
              x: g.M,
              y: blockY + 76,
              w: g.CW,
              h: blockH - 76,
            });
            els.push(element);
          }
        });
      } else {
        const gap = 64;
        const colW = (g.CW - gap) / 2;
        cols.forEach((col, i) => {
          const colX = g.M + i * (colW + gap);
          els.push(
            text({
              x: colX,
              y: g.BODY_Y,
              w: colW,
              h: 60,
              text: col.heading,
              role: "heading",
              fontSize: 34,
            }),
          );
          if (col.bullets.length) {
            const { element } = bulletsBlock(col.bullets, {
              x: colX,
              y: g.BODY_Y + 90,
              w: colW,
              h: g.BODY_H - 90,
            });
            els.push(element);
          }
        });
      }
      break;
    }
  }

  return { elements: els, notes };
}

/** 레이아웃 ID + 콘텐츠 → 좌표가 확정된 Slide */
export function composeSlide(
  layout: LayoutId,
  content: SlideContent,
  theme: Theme,
  aspect: DeckAspect = "16:9",
): Slide {
  const { elements, notes } = composeElements(layout, content, theme, geoOf(aspect));
  return { id: uid(), layout, elements, ...(notes ? { notes } : {}) };
}
