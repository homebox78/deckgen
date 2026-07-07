import Anthropic from "@anthropic-ai/sdk";

import { getSettings } from "../store/adminStore.js";

// env는 index.ts에서 dotenv로 로드되므로 (ESM import 호이스팅 때문에) 항상 지연 조회한다.
// 관리자 콘솔 "생성 모델" 설정(§14)이 있으면 그것이 우선.
export function getModel(): string {
  try {
    const override = getSettings().genModel.trim();
    if (override) return override;
  } catch {
    /* 설정 로드 실패 시 기본값 */
  }
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
}

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  client ??= new Anthropic(); // ANTHROPIC_API_KEY 자동 사용
  return client;
}

/** 응답에서 ```json 펜스 제거 (§8.1 JSON 강제 전략) */
export function stripJsonFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

export interface CompleteJsonOptions {
  system: string;
  user: string;
  maxTokens: number;
}

/**
 * JSON 응답을 받아 파싱+검증. 실패 시 오류 메시지를 포함해 1회 자동 재요청,
 * 재실패 시 throw (라우트에서 502 처리).
 */
export async function completeValidatedJson<T>(
  opts: CompleteJsonOptions,
  validate: (raw: unknown) => T,
): Promise<T> {
  const anthropic = getClient();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.user }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic.messages.create({
      model: getModel(),
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages,
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return validate(JSON.parse(stripJsonFences(text)));
    } catch (e) {
      if (attempt === 1) throw e;
      messages.push(
        { role: "assistant", content: text },
        {
          role: "user",
          content: `응답이 유효하지 않다: ${e instanceof Error ? e.message : String(e)}\n요구된 스키마의 JSON만 다시 출력하라. 마크다운 백틱 금지.`,
        },
      );
    }
  }
  throw new Error("unreachable");
}
