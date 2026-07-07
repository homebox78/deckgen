// 백엔드 호출 + SSE 파서
import type { LayoutId, OutlineSlide, Slide, SlideContent } from "../engine/schema";
import type { Theme } from "../engine/themes";

const INACTIVITY_MS = 31_000;

interface SSEHandlers {
  onEvent: (event: string, data: unknown) => void;
  signal?: AbortSignal;
}

/** POST + SSE 스트림 파싱. 이벤트 블록(\n\n 구분) 단위로 콜백 호출 */
async function streamSSE(url: string, body: unknown, h: SSEHandlers): Promise<void> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  h.signal?.addEventListener("abort", onOuterAbort);

  let timer = window.setTimeout(() => controller.abort(), INACTIVITY_MS);
  const resetTimer = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => controller.abort(), INACTIVITY_MS);
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      let msg = `요청 실패 (${res.status})`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* JSON 아님 */
      }
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleBlock = (block: string) => {
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) return;
      try {
        h.onEvent(event, JSON.parse(data));
      } catch {
        /* 무시 */
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      resetTimer();
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        handleBlock(buffer.slice(0, sep));
        buffer = buffer.slice(sep + 2);
      }
    }
  } finally {
    window.clearTimeout(timer);
    h.signal?.removeEventListener("abort", onOuterAbort);
  }
}

export interface OutlineStreamHandlers {
  onSlide: (slide: OutlineSlide) => void;
  onDone: () => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

/** §8.2 ③ AI 수정 (Magic Edit) — 수정된 전체 슬라이드 반환 */
export async function postEdit(
  instruction: string,
  slide: Slide,
  theme: Theme,
): Promise<Slide> {
  const themeSummary = {
    id: theme.id,
    bg: theme.bg,
    surface: theme.surface,
    accent: theme.accent,
    textPrimary: theme.textPrimary,
    textSecondary: theme.textSecondary,
    chartPalette: theme.chartPalette,
  };
  const res = await fetch("/api/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, slide, theme: themeSummary }),
  });
  const json = (await res.json()) as { slide?: Slide; error?: string };
  if (!res.ok || !json.slide) {
    throw new Error(json.error ?? `수정 요청 실패 (${res.status})`);
  }
  return json.slide;
}

export interface SlideSpec {
  index: number;
  layout: LayoutId;
  content: SlideContent;
}

export interface SlidesStreamHandlers {
  onSpec: (spec: SlideSpec) => void;
  onSlideError: (index: number, message: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

export async function streamSlides(
  req: { outline: OutlineSlide[]; themeId: string; format?: string },
  h: SlidesStreamHandlers,
): Promise<void> {
  let finished = false;
  try {
    await streamSSE("/api/slides", req, {
      signal: h.signal,
      onEvent: (event, data) => {
        if (event === "slide-spec") {
          h.onSpec(data as SlideSpec);
        } else if (event === "slide-error") {
          const d = data as { index: number; message?: string };
          h.onSlideError(d.index, d.message ?? "생성 실패");
        } else if (event === "done") {
          finished = true;
          h.onDone();
        } else if (event === "error") {
          finished = true;
          h.onError((data as { message?: string }).message ?? "생성 실패");
        }
      },
    });
    if (!finished) throw new Error("스트림이 중단되었습니다.");
  } catch (e) {
    if (h.signal?.aborted || finished) return;
    h.onError(e instanceof Error ? e.message : "생성 실패");
  }
}

export async function streamOutline(
  req: { prompt: string; slideCount: number; format?: string },
  h: OutlineStreamHandlers,
): Promise<void> {
  let finished = false;
  let received = 0;

  const attempt = () =>
    streamSSE("/api/outline", req, {
      signal: h.signal,
      onEvent: (event, data) => {
        if (event === "slide") {
          received++;
          h.onSlide(data as OutlineSlide);
        } else if (event === "done") {
          finished = true;
          h.onDone();
        } else if (event === "error") {
          finished = true;
          h.onError((data as { message?: string }).message ?? "생성 실패");
        }
      },
    });

  try {
    await attempt();
    if (!finished) throw new Error("스트림이 중단되었습니다.");
  } catch (e) {
    if (h.signal?.aborted || finished) return;
    // 무응답/네트워크 오류 시 1회 재시도 (§8.3) — 단, 일부 수신 후엔 중복 방지 위해 재시도 안 함
    if (received === 0) {
      try {
        await attempt();
        if (!finished) throw new Error("스트림이 중단되었습니다.");
        return;
      } catch (e2) {
        h.onError(e2 instanceof Error ? e2.message : "생성 실패");
        return;
      }
    }
    h.onError(e instanceof Error ? e.message : "생성 실패");
  }
}
