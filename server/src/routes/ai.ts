import { Router } from "express";
import type { Request, Response } from "express";
import {
  completeValidatedJson,
  getClient,
  getModel,
  hasApiKey,
} from "../ai/anthropic.js";
import { completeValidatedJsonWith, fallbackChain, listModels } from "../ai/providers.js";
import {
  CAROUSEL_RULES,
  EDIT_SYSTEM,
  OUTLINE_SYSTEM,
  SLIDES_SYSTEM,
} from "../ai/prompts.js";
import type { OutlineSlide, ServerSlide, SlideSpec } from "../ai/validate.js";
import { outlineSlideSchema, slideSchema, slideSpecSchema } from "../ai/validate.js";
import { getSettings, logError, logEvent } from "../store/adminStore.js";
import { endSSE, initSSE, sendEvent, sendSSEError } from "../sse.js";

export const aiRouter = Router();

/** §14 이벤트 로깅 — 대시보드/작업 큐/오류 로그의 실데이터 소스 */
function track(kind: "outline" | "slides" | "edit", startMs: number, ok: boolean, meta?: string, err?: string): void {
  try {
    logEvent({ ts: Date.now(), kind, ok, ms: Date.now() - startMs, meta, err });
    if (!ok && err) logError(err, meta ?? "");
  } catch {
    /* 로깅 실패가 응답을 막지 않게 */
  }
}

/** §14 점검 모드 + IP당 일일 생성 한도 */
const dailyGen = new Map<string, { day: string; count: number }>();

function guardGenerate(req: Request, res: Response): boolean {
  const settings = getSettings();
  if (settings.maintenance) {
    res.status(503).json({ error: "점검 중입니다. 잠시 후 다시 시도해주세요." });
    return false;
  }
  const ip = req.ip ?? "unknown";
  const today = new Date().toISOString().slice(0, 10);
  const cur = dailyGen.get(ip);
  const count = cur?.day === today ? cur.count : 0;
  if (count >= settings.freeDailyLimit) {
    res.status(429).json({ error: `일일 생성 한도(${settings.freeDailyLimit}회)를 초과했습니다.` });
    return false;
  }
  dailyGen.set(ip, { day: today, count: count + 1 });
  return true;
}


// ===== GET /api/models — 사용 가능한 LLM 목록 (rate limit 제외, 재생성 레이어 셀렉트용) =====
aiRouter.get("/models", (_req: Request, res: Response) => {
  res.json({ models: listModels() });
});

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
  format?: unknown; // "16:9" | "4:5"
}

function isCarousel(format: unknown): boolean {
  return format === "4:5";
}

aiRouter.post("/outline", (req: Request, res: Response) => {
  const { prompt, slideCount, format } = (req.body ?? {}) as OutlineBody;
  if (typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt가 필요합니다." });
    return;
  }
  if (!guardGenerate(req, res)) return;
  const count = Math.min(12, Math.max(3, Number(slideCount) || 5));
  const t0 = Date.now();
  const meta = prompt.trim().slice(0, 60);

  if (!hasApiKey()) {
    void streamMockOutline(res, prompt.trim(), count, isCarousel(format)).then(
      () => track("outline", t0, true, meta + " (mock)"),
    );
    return;
  }
  void streamOutline(res, prompt.trim(), count, isCarousel(format)).then(
    (ok) => track("outline", t0, ok, meta, ok ? undefined : "OutlineGenerationError"),
  );
});

async function streamOutline(
  res: Response,
  prompt: string,
  count: number,
  carousel: boolean,
): Promise<boolean> {
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
    system: OUTLINE_SYSTEM + (carousel ? CAROUSEL_RULES : ""),
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
      return false;
    }
    endSSE(res);
    return true;
  } catch (e) {
    timer.clear();
    if (!res.writableEnded) {
      sendSSEError(res, `아웃라인 생성 실패: ${e instanceof Error ? e.message : "unknown"}`);
    }
    return false;
  }
}

// ===== ② POST /api/slides (SSE, 슬라이드별 순차) =====
interface SlidesBody {
  outline?: unknown;
  themeId?: unknown;
  format?: unknown;
}

aiRouter.post("/slides", (req: Request, res: Response) => {
  const { outline, format } = (req.body ?? {}) as SlidesBody;
  const carousel = isCarousel(format);
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

  if (!guardGenerate(req, res)) return;
  const t0 = Date.now();
  const meta = `${items.length}장`;
  if (!hasApiKey()) {
    void streamMockSlides(res, items).then(() => track("slides", t0, true, meta + " (mock)"));
    return;
  }
  void streamSlides(res, items, carousel).then((ok) =>
    track("slides", t0, ok, meta, ok ? undefined : "SlideGenerationError"),
  );
});

async function streamSlides(
  res: Response,
  outline: OutlineSlide[],
  carousel: boolean,
): Promise<boolean> {
  initSSE(res);
  const outlineJson = JSON.stringify(outline);
  let emitted = 0;
  const system =
    SLIDES_SYSTEM +
    (carousel
      ? "\n\n[4:5 카드뉴스] 세로 캔버스다. title-bullets/kpi-cards/section을 우선하고, 텍스트는 짧게, 페이지 번호·발표자 정보는 절대 넣지 마라. 마지막 장은 section 레이아웃의 CTA로."
      : "");

  for (const item of outline) {
    if (res.writableEnded) return false;
    try {
      const spec = await completeValidatedJson(
        {
          system,
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
    return false;
  }
  endSSE(res);
  return true;
}

// ===== POST /api/ai-image (Demo Act 5.5 AI 이미지) =====
// config.php openai_api_key/openai_model 사용. 키 없거나 실패 시 501 → 클라가 그라디언트 대체.
aiRouter.post("/ai-image", async (req: Request, res: Response) => {
  const { prompt, size } = (req.body ?? {}) as { prompt?: unknown; size?: unknown };
  if (typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ error: "prompt가 필요합니다." });
    return;
  }
  const key = (process.env.OPENAI_API_KEY ?? "").trim();
  const model = (process.env.OPENAI_MODEL ?? "").trim();
  if (!key || !model) {
    res.status(501).json({ error: "AI 이미지 키가 설정되지 않았습니다." });
    return;
  }
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        prompt: prompt.trim(),
        n: 1,
        size: typeof size === "string" ? size : "1024x1024",
        response_format: "b64_json",
      }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { data?: { b64_json?: string; url?: string }[] };
    const item = j.data?.[0];
    const image = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
    if (!image) throw new Error("이미지 응답이 비었습니다.");
    logEvent({ ts: Date.now(), kind: "regen", ok: true, ms: 0, meta: `AI 이미지 · ${prompt.trim().slice(0, 40)}` });
    res.json({ image });
  } catch (e) {
    console.warn("[ai-image] 실패:", e);
    res.status(502).json({ error: "이미지 생성에 실패했습니다." });
  }
});

// ===== ③ POST /api/edit (Magic Edit / 슬라이드 재생성) =====
interface EditBody {
  instruction?: unknown;
  slide?: unknown;
  theme?: unknown;
  model?: unknown; // 선택 모델 (미지정 시 주력 → 폴백 체인)
}

aiRouter.post("/edit", async (req: Request, res: Response) => {
  const { instruction, slide, theme, model } = (req.body ?? {}) as EditBody;
  if (typeof instruction !== "string" || !instruction.trim()) {
    res.status(400).json({ error: "instruction이 필요합니다." });
    return;
  }
  if (getSettings().maintenance) {
    res.status(503).json({ error: "점검 중입니다. 잠시 후 다시 시도해주세요." });
    return;
  }
  const t0 = Date.now();
  let parsedSlide: ServerSlide;
  try {
    parsedSlide = slideSchema.parse(slide);
  } catch {
    res.status(400).json({ error: "유효한 slide가 필요합니다." });
    return;
  }

  const chain = fallbackChain(typeof model === "string" ? model : undefined);
  if (chain.length === 0) {
    res.json({ slide: mockEdit(parsedSlide, instruction.trim()), model: "mock" });
    return;
  }

  const opts = {
    system: EDIT_SYSTEM,
    maxTokens: 2000,
    user: `테마 요약: ${JSON.stringify(theme ?? {})}\n\n현재 슬라이드:\n${JSON.stringify(parsedSlide)}\n\n사용자 지시: ${instruction.trim()}`,
  };
  // 선택 모델 → 실패 시 폴백 (anthropic 주력 → openai_chat → gemini_text)
  let lastError: unknown = null;
  for (const m of chain) {
    try {
      const edited = await completeValidatedJsonWith(m, opts, (raw) =>
        slideSchema.parse(raw),
      );
      // id는 원본 유지 (교체 대상 식별)
      track("edit", t0, true, `${instruction.trim().slice(0, 50)} · ${m}`);
      res.json({ slide: { ...edited, id: parsedSlide.id }, model: m });
      return;
    } catch (e) {
      lastError = e;
      console.warn(`[edit] ${m} 실패 — 다음 모델로 폴백:`, e instanceof Error ? e.message : e);
    }
  }
  console.warn("[edit] 전 모델 실패:", lastError);
  track("edit", t0, false, instruction.trim().slice(0, 50), "MagicEditError");
  res.status(502).json({ error: "AI 수정에 실패했습니다. 다시 시도해주세요." });
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

async function streamMockOutline(
  res: Response,
  prompt: string,
  count: number,
  carousel = false,
) {
  console.warn("[outline] ANTHROPIC_API_KEY 미설정 — 모의 아웃라인으로 응답합니다.");
  initSSE(res);
  const topic = prompt.length > 24 ? prompt.slice(0, 24) + "…" : prompt;

  if (carousel) {
    // 카드뉴스: 훅 → 긴장 → 아이디어 → 체크리스트 → CTA
    for (let i = 0; i < count; i++) {
      await sleep(400);
      const isFirst = i === 0;
      const isLast = i === count - 1;
      const isSecond = i === 1;
      sendEvent(res, "slide", {
        index: i,
        title: isFirst
          ? `아직도 이렇게 하세요? ${topic}`
          : isLast
            ? "저장하고 오늘 하나만 해보세요"
            : isSecond
              ? "대부분 여기서 실수합니다"
              : `핵심 아이디어 ${i - 1}`,
        bullets: isFirst
          ? [`${topic} — 3장이면 감 잡힙니다`]
          : isLast
            ? ["지금 바로: 첫 번째 항목부터", "팔로우하면 다음 편도 받아요"]
            : isSecond
              ? ["흔한 실수 하나", "그 실수의 진짜 비용"]
              : ["한 줄 포인트", "바로 써먹는 팁"],
        viz: !isFirst && !isLast && i === count - 2 ? { type: "kpi-cards", note: "저장용 체크 카드" } : null,
      });
    }
    endSSE(res);
    return;
  }
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
