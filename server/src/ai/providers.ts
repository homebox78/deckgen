// LLM 공급자 디스패치 — config.php(키 단일 소스)의 모델 포지션 설계를 코드로 반영.
//   anthropic_model    : 주력 (아웃라인·슬라이드·수정·재생성)
//   openai_chat_model  : Claude 폴백 텍스트
//   gemini_text_model  : 저비용 보조 + 2차 폴백
import { getClient, getModel, stripJsonFences } from "./anthropic.js";

export type Provider = "anthropic" | "openai" | "gemini";

export interface ModelInfo {
  id: string;
  provider: Provider;
  label: string;
  role: string;
  default?: boolean;
}

const env = (k: string): string => (process.env[k] ?? "").trim();

/** "sonnet-4-6" → "Sonnet 4.6", "3-flash-preview" → "3 Flash" */
function prettyName(slug: string): string {
  return slug
    .replace(/-preview$/, "")
    .split("-")
    .map((t) => (/^\d+$/.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1)))
    .join(" ")
    .replace(/(\d) (\d)/g, "$1.$2");
}

/** 키가 있는 공급자의 텍스트 모델 목록 (재생성 레이어 셀렉트에 사용) */
export function listModels(): ModelInfo[] {
  const models: ModelInfo[] = [];
  if (env("ANTHROPIC_API_KEY")) {
    models.push({
      id: getModel(),
      provider: "anthropic",
      label: `Claude ${prettyName(getModel().replace(/^claude-/, ""))}`,
      role: "주력 — 분석·설계·수정",
      default: true,
    });
  }
  if (env("OPENAI_API_KEY") && env("OPENAI_CHAT_MODEL")) {
    models.push({
      id: env("OPENAI_CHAT_MODEL"),
      provider: "openai",
      label: `GPT ${prettyName(env("OPENAI_CHAT_MODEL").replace(/^gpt-/, ""))}`,
      role: "폴백 텍스트",
    });
  }
  if (env("GEMINI_API_KEY") && env("GEMINI_TEXT_MODEL")) {
    models.push({
      id: env("GEMINI_TEXT_MODEL"),
      provider: "gemini",
      label: `Gemini ${prettyName(env("GEMINI_TEXT_MODEL").replace(/^gemini-/, ""))}`,
      role: "저비용 보조",
    });
  }
  return models;
}

export function providerOf(model: string): Provider {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt") || model.startsWith("o")) return "openai";
  if (model.startsWith("gemini")) return "gemini";
  return "anthropic";
}

export interface CompleteOptions {
  system: string;
  user: string;
  maxTokens: number;
}

async function completeAnthropic(model: string, o: CompleteOptions): Promise<string> {
  const res = await getClient().messages.create({
    model,
    max_tokens: o.maxTokens,
    system: o.system,
    messages: [{ role: "user", content: o.user }],
  });
  return res.content
    .filter((b): b is { type: "text"; text: string } & typeof b => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function completeOpenAI(model: string, o: CompleteOptions): Promise<string> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("OPENAI_API_KEY")}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: o.maxTokens,
      messages: [
        { role: "system", content: o.system },
        { role: "user", content: o.user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI 응답에 텍스트가 없습니다.");
  return text;
}

async function completeGemini(model: string, o: CompleteOptions): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env("GEMINI_API_KEY")}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.user }] }],
      generationConfig: { maxOutputTokens: o.maxTokens },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini 응답에 텍스트가 없습니다.");
  return text;
}

export async function completeText(model: string, o: CompleteOptions): Promise<string> {
  switch (providerOf(model)) {
    case "anthropic":
      return completeAnthropic(model, o);
    case "openai":
      return completeOpenAI(model, o);
    case "gemini":
      return completeGemini(model, o);
  }
}

/** 선택 모델 → 실패 시 폴백 순서: anthropic 주력 → openai_chat → gemini_text (§config LLM 설계) */
export function fallbackChain(selected?: string): string[] {
  const chain: string[] = [];
  const push = (m: string | undefined) => {
    if (m && !chain.includes(m)) chain.push(m);
  };
  push(selected);
  for (const m of listModels()) push(m.id);
  return chain;
}

/** JSON 강제(§8.1)를 공급자 무관으로: 파싱/검증 실패 시 오류를 포함해 같은 모델에 1회 재요청 */
export async function completeValidatedJsonWith<T>(
  model: string,
  opts: CompleteOptions,
  validate: (raw: unknown) => T,
): Promise<T> {
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const user =
      attempt === 0
        ? opts.user
        : `${opts.user}\n\n[이전 응답이 유효하지 않았다: ${lastErr}]\n요구된 스키마의 JSON만 다시 출력하라. 마크다운 백틱 금지.`;
    const text = await completeText(model, { ...opts, user });
    try {
      return validate(JSON.parse(stripJsonFences(text)));
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 300) : String(e);
    }
  }
  throw new Error(`JSON 검증 실패 (${model}): ${lastErr}`);
}
