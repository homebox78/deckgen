// §5 레이아웃 엔진 — LLM은 레이아웃 ID + 콘텐츠만 정하고, 좌표는 이 모듈이 계산한다.
import type {
  LayoutId,
  Slide,
  SlideContent,
  SlideElement,
  TextElement,
} from "./schema";
import { SLIDE_H, SLIDE_W, uid } from "./schema";
import type { Theme } from "./themes";

// 공통 여백 96px, 제목 영역 160px
const MARGIN = 96;
const TITLE_H = 160;
const CONTENT_W = SLIDE_W - MARGIN * 2; // 1728
const BODY_Y = MARGIN + TITLE_H; // 256
const BODY_H = SLIDE_H - MARGIN - BODY_Y; // 728

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

function titleBar(title: string): TextElement {
  return text({
    x: MARGIN,
    y: MARGIN + 16,
    w: CONTENT_W,
    h: TITLE_H - 32,
    text: title,
    role: "heading",
  });
}

function composeElements(
  layout: LayoutId,
  content: SlideContent,
  _theme: Theme,
): { elements: SlideElement[]; notes?: string } {
  const els: SlideElement[] = [];
  let notes: string | undefined;

  switch (layout) {
    case "cover": {
      els.push({
        id: uid(),
        type: "shape",
        shape: "rect",
        x: MARGIN,
        y: 360,
        w: 160,
        h: 12,
        fill: "@accent",
      });
      els.push(
        text({
          x: MARGIN,
          y: 420,
          w: CONTENT_W,
          h: 240,
          text: content.title ?? "",
          role: "title",
        }),
      );
      if (content.subtitle) {
        els.push(
          text({
            x: MARGIN,
            y: 680,
            w: CONTENT_W,
            h: 100,
            text: content.subtitle,
            role: "subtitle",
          }),
        );
      }
      if (content.presenter) {
        els.push(
          text({
            x: MARGIN,
            y: SLIDE_H - MARGIN - 40,
            w: CONTENT_W,
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
          x: MARGIN,
          y: SLIDE_H / 2 - 120,
          w: CONTENT_W,
          h: 180,
          text: content.title ?? "",
          role: "title",
          align: "center",
        }),
      );
      if (content.subtitle) {
        els.push(
          text({
            x: MARGIN,
            y: SLIDE_H / 2 + 80,
            w: CONTENT_W,
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
      if (content.title) els.push(titleBar(content.title));
      if (content.bullets?.length) {
        const { element, overflowNotes } = bulletsBlock(content.bullets, {
          x: MARGIN,
          y: BODY_Y,
          w: CONTENT_W,
          h: BODY_H,
        });
        els.push(element);
        notes = overflowNotes;
      }
      break;
    }

    case "title-bullets-chart": {
      if (content.title) els.push(titleBar(content.title));
      const gap = 48;
      const leftW = Math.round(CONTENT_W * 0.55) - gap / 2;
      const rightW = CONTENT_W - leftW - gap;
      if (content.bullets?.length) {
        const { element, overflowNotes } = bulletsBlock(content.bullets, {
          x: MARGIN,
          y: BODY_Y,
          w: leftW,
          h: BODY_H,
        });
        els.push(element);
        notes = overflowNotes;
      }
      if (content.chart) {
        els.push({
          id: uid(),
          type: "chart",
          x: MARGIN + leftW + gap,
          y: BODY_Y,
          w: rightW,
          h: BODY_H,
          ...content.chart,
        });
      }
      break;
    }

    case "chart-focus": {
      if (content.title) els.push(titleBar(content.title));
      if (content.chart) {
        els.push({
          id: uid(),
          type: "chart",
          x: MARGIN + 120,
          y: BODY_Y,
          w: CONTENT_W - 240,
          h: BODY_H,
          ...content.chart,
        });
      }
      break;
    }

    case "kpi-cards": {
      if (content.title) els.push(titleBar(content.title));
      const kpis = (content.kpis ?? []).slice(0, 4);
      if (kpis.length >= 2) {
        const gap = 32;
        const cardW = (CONTENT_W - gap * (kpis.length - 1)) / kpis.length;
        const cardH = 320;
        const cardY = BODY_Y + (BODY_H - cardH) / 2;
        kpis.forEach((kpi, i) => {
          const cardX = MARGIN + i * (cardW + gap);
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
              y: cardY + 90,
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
              y: cardY + 200,
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
      if (content.title) els.push(titleBar(content.title));
      const cols = (content.columns ?? []).slice(0, 2);
      const gap = 64;
      const colW = (CONTENT_W - gap) / 2;
      cols.forEach((col, i) => {
        const colX = MARGIN + i * (colW + gap);
        els.push(
          text({
            x: colX,
            y: BODY_Y,
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
            y: BODY_Y + 90,
            w: colW,
            h: BODY_H - 90,
          });
          els.push(element);
        }
      });
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
): Slide {
  const { elements, notes } = composeElements(layout, content, theme);
  return { id: uid(), layout, elements, ...(notes ? { notes } : {}) };
}
