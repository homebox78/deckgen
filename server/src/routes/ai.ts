import { Router } from "express";
import type { Request, Response } from "express";
import {
  completeValidatedJson,
  getClient,
  getModel,
  hasApiKey,
} from "../ai/anthropic.js";
import { EDIT_SYSTEM, OUTLINE_SYSTEM, SLIDES_SYSTEM } from "../ai/prompts.js";
import type { OutlineSlide, ServerSlide, SlideSpec } from "../ai/validate.js";
import { outlineSlideSchema, slideSchema, slideSpecSchema } from "../ai/validate.js";
import { endSSE, initSSE, sendEvent, sendSSEError } from "../sse.js";

export const aiRouter = Router();

// ===== rate limit: IP당 분당 10회 (§8.3) =====
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

aiRouter.use((req, res, next) => {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    res.status(429).json({ error: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요." });
    return;
  }
  recent.push(now);
  hits.set(ip, recent);
  next();
});

/** SSE 무응답 타임아웃 (30초) — 콜백으로 리셋 */
function inactivityTimer(onTimeout: () => void) {
  let t = setTimeout(onTimeout, 30_000);
  return {
    reset() {
      clearTimeout(t);
      t = setTimeout(onTimeout, 30_000);
    },
    clear() {
      clearTimeout(t);
    },
  };
}

// ===== ① POST /api/outline (SSE) =====
interface OutlineBody {
  prompt?: unknown;
  slideCount?: unknown;
}

aiRouter.post("/outline", (req: Request, res: Response) => {
  const { prompt, slideCount } = (req.body ?? {}) as OutlineBody;
  if (typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt가 필요합니다." });
    return;
  }
  const count = Math.min(12, Math.max(3, Number(slideCount) || 5));

  if (!hasApiKey()) {
    void streamMockOutline(res, prompt.trim(), count);
    return;
  }
  void streamOutline(res, prompt.trim(), count);
});

async function streamOutline(res: Response, prompt: string, count: number) {
  initSSE(res);
  let emitted = 0;
  let buffer = "";

  const emitLine = (line: string) => {
    const raw = line.trim();
    if (!raw) return;
    try {
      const slide = outlineSlideSchema.parse(JSON.parse(raw));
      sendEvent(res, "slide", slide);
      emitted++;
    } catch {
      console.warn("[outline] 유효하지 않은 JSONL 라인 무시:", raw.slice(0, 120));
    }
  };

  const stream = getClient().messages.stream({
    model: getModel(),
    max_tokens: 2000,
    system: OUTLINE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `주제: ${prompt}\nslideCount: ${count}`,
      },
    ],
  });

  const timer = inactivityTimer(() => {
    stream.abort();
    sendSSEError(res, "AI 응답이 지연되어 중단했습니다. 다시 시도해주세요.");
  });

  try {
    stream.on("text", (chunk) => {
      timer.reset();
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        emitLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    });
    await stream.finalMessage();
    emitLine(buffer); // 마지막 줄
    timer.clear();
    if (emitted === 0) {
      sendSSEError(res, "아웃라인을 생성하지 못했습니다. 다시 시도해주세요.");
      return;
    }
    endSSE(res);
  } catch (e) {
    timer.clear();
    if (!res.writableEnded) {
      sendSSEError(res, `아웃라인 생성 실패: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
}

// ===== ② POST /api/slides (SSE, 슬라이드별 순차) =====
interface SlidesBody {
  outline?: unknown;
  themeId?: unknown;
}

aiRouter.post("/slides", (req: Request, res: Response) => {
  const { outline } = (req.body ?? {}) as SlidesBody;
  let items: OutlineSlide[];
  try {
    items = outlineSlideSchema
      .array()
      .min(1)
      .max(12)
      .parse(outline)
      .map((s, i) => ({ ...s, index: i }));
  } catch {
    res.status(400).json({ error: "유효한 outline 배열이 필요합니다." });
    return;
  }

  if (!hasApiKey()) {
    void streamMockSlides(res, items);
    return;
  }
  void streamSlides(res, items);
});

async function streamSlides(res: Response, outline: OutlineSlide[]) {
  initSSE(res);
  const outlineJson = JSON.stringify(outline);
  let emitted = 0;

  for (const item of outline) {
    if (res.writableEnded) return;
    try {
      const spec = await completeValidatedJson(
        {
          system: SLIDES_SYSTEM,
          maxTokens: 1500,
          user: `전체 아웃라인(맥락 참고용):\n${outlineJson}\n\n이번에 처리할 항목 (index ${item.index}):\n${JSON.stringify(item)}\n\n전체 슬라이드 수: ${outline.length} (index ${item.index}는 ${item.index === 0 ? "첫" : item.index === outline.length - 1 ? "마지막" : "중간"} 슬라이드)`,
        },
        (raw) => slideSpecSchema.parse(raw),
      );
      sendEvent(res, "slide-spec", { ...spec, index: item.index });
      emitted++;
    } catch (e) {
      console.warn(`[slides] index ${item.index} 생성 실패:`, e);
      sendEvent(res, "slide-error", {
        index: item.index,
        message: "이 슬라이드 생성에 실패했습니다.",
      });
    }
  }
  if (emitted === 0) {
    sendSSEError(res, "슬라이드를 생성하지 못했습니다. 다시 시도해주세요.");
    return;
  }
  endSSE(res);
}

// ===== ③ POST /api/edit (Magic Edit) =====
interface EditBody {
  instruction?: unknown;
  slide?: unknown;
  theme?: unknown;
}

aiRouter.post("/edit", async (req: Request, res: Response) => {
  const { instruction, slide, theme } = (req.body ?? {}) as EditBody;
  if (typeof instruction !== "string" || !instruction.trim()) {
    res.status(400).json({ error: "instruction이 필요합니다." });
    return;
  }
  let parsedSlide: ServerSlide;
  try {
    parsedSlide = slideSchema.parse(slide);
  } catch {
    res.status(400).json({ error: "유효한 slide가 필요합니다." });
    return;
  }

  if (!hasApiKey()) {
    res.json({ slide: mockEdit(parsedSlide, instruction.trim()) });
    return;
  }

  try {
    const edited = await completeValidatedJson(
      {
        system: EDIT_SYSTEM,
        maxTokens: 2000,
        user: `테마 요약: ${JSON.stringify(theme ?? {})}\n\n현재 슬라이드:\n${JSON.stringify(parsedSlide)}\n\n사용자 지시: ${instruction.trim()}`,
      },
      (raw) => slideSchema.parse(raw),
    );
    // id는 원본 유지 (교체 대상 식별)
    res.json({ slide: { ...edited, id: parsedSlide.id } });
  } catch (e) {
    console.warn("[edit] 실패:", e);
    res
      .status(502)
      .json({ error: "AI 수정에 실패했습니다. 다시 시도해주세요." });
  }
});

/** 모의 편집: 대표 지시 3종(제목 임팩트/차트 파이 전환/불릿 추가) 휴리스틱 처리 */
function mockEdit(slide: ServerSlide, instruction: string): ServerSlide {
  console.warn("[edit] ANTHROPIC_API_KEY 미설정 — 모의 편집으로 응답합니다.");
  const lower = instruction.toLowerCase();
  const elements = slide.elements.map((el) => {
    if (
      el.type === "chart" &&
      (lower.includes("파이") || lower.includes("pie"))
    ) {
      return { ...el, chartType: "pie" as const };
    }
    if (
      el.type === "chart" &&
      (lower.includes("막대") || lower.includes("bar"))
    ) {
      return { ...el, chartType: "bar" as const };
    }
    if (
      el.type === "text" &&
      (el.role === "title" || el.role === "heading") &&
      lower.includes("제목")
    ) {
      return { ...el, text: `${el.text.replace(/[!?.]+$/, "")} — 지금이 기회다!` };
    }
    if (
      el.type === "text" &&
      el.role === "body" &&
      lower.includes("불릿") &&
      (lower.includes("추가") || lower.includes("add"))
    ) {
      return { ...el, text: `${el.text}\n•  (모의) 새로 추가된 불릿 항목` };
    }
    return el;
  });
  return { ...slide, elements };
}

// ===== 모의 모드 (ANTHROPIC_API_KEY 미설정 시 개발용) =====
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mockSpecFor(item: OutlineSlide, total: number): SlideSpec {
  const i = item.index;
  const bullets = item.bullets.filter((b) => b.trim());
  const mkChart = (chartType: "bar" | "line" | "pie") => ({
    chartType,
    title: `${item.viz?.note || item.title} [예시]`,
    labels:
      chartType === "pie"
        ? ["항목 A", "항목 B", "항목 C", "기타"]
        : ["2023", "2024", "2025", "2026"],
    series:
      chartType === "pie"
        ? [{ name: "비율", values: [42, 28, 18, 12] }]
        : [{ name: "지표", values: [12, 19, 27, 38] }],
  });

  if (i === 0) {
    return {
      index: i,
      layout: "cover",
      content: {
        title: item.title,
        subtitle: bullets[0] ?? "",
        presenter: "DeckGen",
      },
    };
  }
  if (i === total - 1) {
    return {
      index: i,
      layout: "section",
      content: { title: item.title, subtitle: bullets[0] ?? "감사합니다" },
    };
  }
  switch (item.viz?.type) {
    case "bar":
    case "line":
      return {
        index: i,
        layout: "title-bullets-chart",
        content: { title: item.title, bullets, chart: mkChart(item.viz.type) },
      };
    case "pie":
      return {
        index: i,
        layout: "chart-focus",
        content: { title: item.title, chart: mkChart("pie") },
      };
    case "kpi-cards":
      return {
        index: i,
        layout: "kpi-cards",
        content: {
          title: item.title,
          kpis: [
            { value: "87%", label: bullets[0] ?? "지표 1" },
            { value: "3.2배", label: bullets[1] ?? "지표 2" },
            { value: "1.5억", label: bullets[2] ?? "지표 3" },
          ],
        },
      };
    case "process":
      return {
        index: i,
        layout: "title-bullets",
        content: {
          title: item.title,
          bullets: bullets.map((b, n) => `${n + 1}. ${b}`),
        },
      };
    default:
      return {
        index: i,
        layout: "title-bullets",
        content: { title: item.title, bullets },
      };
  }
}

async function streamMockSlides(res: Response, outline: OutlineSlide[]) {
  console.warn("[slides] ANTHROPIC_API_KEY 미설정 — 모의 슬라이드로 응답합니다.");
  initSSE(res);
  for (const item of outline) {
    await sleep(700);
    sendEvent(res, "slide-spec", mockSpecFor(item, outline.length));
  }
  endSSE(res);
}

async function streamMockOutline(res: Response, prompt: string, count: number) {
  console.warn("[outline] ANTHROPIC_API_KEY 미설정 — 모의 아웃라인으로 응답합니다.");
  initSSE(res);
  const topic = prompt.length > 24 ? prompt.slice(0, 24) + "…" : prompt;
  const vizPool = [
    null,
    { type: "bar" as const, note: "연도별 시장 규모 성장 추이를 막대로 비교" },
    { type: "kpi-cards" as const, note: "핵심 성과 지표 4개를 카드로 강조" },
    { type: "line" as const, note: "월별 지표 변화 추세를 선으로 표현" },
    { type: "pie" as const, note: "항목별 구성 비율을 원형으로 표현" },
  ];
  for (let i = 0; i < count; i++) {
    await sleep(400);
    const isFirst = i === 0;
    const isLast = i === count - 1;
    sendEvent(res, "slide", {
      index: i,
      title: isFirst ? topic : isLast ? "마무리 및 제언" : `핵심 포인트 ${i}`,
      bullets: isFirst
        ? [`"${topic}" 주제 개요`, "발표 목적과 기대 효과"]
        : isLast
          ? ["핵심 내용 요약", "다음 단계 제안", "질의응답"]
          : [
              `${topic} 관련 근거 ${i}-1`,
              `${topic} 관련 근거 ${i}-2`,
              "시사점과 적용 방안",
            ],
      viz: isFirst || isLast ? null : vizPool[i % vizPool.length],
    });
  }
  endSSE(res);
}
