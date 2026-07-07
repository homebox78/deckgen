import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { postEdit } from "../../api/client";
import { renderSlideToDataURL } from "../../engine/fabricRenderer";
import type { Slide, SlideDims } from "../../engine/schema";
import { SLIDE_H, SLIDE_W } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { useDeckStore } from "../../store/deckStore";
import { useGenerationStore } from "../../store/generationStore";
import { showToast } from "../ui/toast";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
  applied?: boolean; // 수정이 실제 반영된 응답 → '적용됨 · 되돌리기' 표시
}

/** AI 수정안 — 바로 덮어쓰지 않고 before/after를 보고 적용/버리기 결정 */
interface PendingEdit {
  slideId: string;
  edited: Slide;
  beforeUrl: string;
  afterUrl: string;
}

interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
  pending: PendingEdit | null;
  push: (m: ChatMessage) => void;
  setBusy: (b: boolean) => void;
  setPending: (p: PendingEdit | null) => void;
}

// 세션 내 유지되는 채팅 히스토리 (탭 전환에도 유지)
const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  busy: false,
  pending: null,
  push: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setBusy: (busy) => set({ busy }),
  setPending: (pending) => set({ pending }),
}));

const SUGGESTION_CHIPS = ["제목을 더 임팩트 있게", "차트를 파이로 바꿔줘", "불릿 하나 추가해줘"];

/** §6.1 시그니처 — 에이전트 작업 로그 타임라인 (모노 폰트) */
function AgentLog({ deckId }: { deckId: string }) {
  const gen = useGenerationStore();
  if (gen.deckId !== deckId || gen.logs.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-app-border-soft bg-[#FBFBFA] px-3.5 py-3">
      <p className="mb-2 text-[11px] font-bold tracking-[.06em] text-app-faint">작업 로그</p>
      <div className="max-h-36 overflow-y-auto">
        {gen.logs.map((log, i) => {
          const active = i === gen.logs.length - 1 && gen.active;
          return (
            <div key={i} className="flex gap-2.5 pb-1.5">
              <span className="flex flex-col items-center">
                <span
                  className={`mt-1 h-[7px] w-[7px] shrink-0 rounded-full ${
                    active ? "animate-dg-pulse bg-app-accent" : "bg-app-success"
                  }`}
                />
              </span>
              <span
                className={`font-mono text-[11px] ${active ? "text-app-accent" : "text-app-text"}`}
              >
                {log}
              </span>
            </div>
          );
        })}
        {gen.error && (
          <p className="mt-1 font-mono text-[11px] text-app-danger">{gen.error}</p>
        )}
      </div>
    </div>
  );
}

export function ChatPanel({
  slide,
  slideIndex,
  theme,
  deckId,
  dims = { w: SLIDE_W, h: SLIDE_H },
}: {
  slide: Slide;
  slideIndex: number;
  theme: Theme;
  deckId: string;
  dims?: SlideDims;
}) {
  const { messages, busy, pending, push, setBusy, setPending } = useChatStore();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const pendingHere = pending?.slideId === slide.id ? pending : null;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy, pending]);

  const send = async (raw?: string) => {
    const instruction = (raw ?? input).trim();
    if (!instruction || busy || pendingHere) return;
    setInput("");
    push({ role: "user", text: instruction });
    setBusy(true);
    try {
      const edited = await postEdit(instruction, slide, theme);
      const editedSlide = { ...edited, id: slide.id };
      // 바로 덮어쓰지 않고 before/after 비교를 만든다
      const [beforeUrl, afterUrl] = await Promise.all([
        renderSlideToDataURL(slide, theme, 220, dims),
        renderSlideToDataURL(editedSlide, theme, 220, dims),
      ]);
      setPending({ slideId: slide.id, edited: editedSlide, beforeUrl, afterUrl });
      push({
        role: "assistant",
        text: "수정안을 만들었어요. Before / After를 비교하고 적용할지 결정하세요.",
      });
    } catch (e) {
      push({
        role: "assistant",
        text: e instanceof Error ? e.message : "수정에 실패했어요.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const applyPending = () => {
    if (!pendingHere) return;
    const st = useDeckStore.getState();
    if (st.deck?.slides.some((s) => s.id === pendingHere.slideId)) {
      st.replaceSlide(pendingHere.slideId, pendingHere.edited);
      push({ role: "assistant", text: "적용했어요. 캔버스에서 확인해보세요.", applied: true });
    } else {
      push({ role: "assistant", text: "슬라이드를 찾을 수 없어요.", error: true });
    }
    setPending(null);
  };

  const discardPending = () => {
    setPending(null);
    push({ role: "assistant", text: "이번 수정안은 버렸어요. 원본 그대로예요." });
  };

  const undoLast = () => {
    useDeckStore.temporal.getState().undo();
    showToast("마지막 AI 수정을 되돌렸어요");
  };

  return (
    <div className="flex h-full flex-col">
      <AgentLog deckId={deckId} />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3.5">
        <div className="flex flex-col gap-2.5">
          <span className="self-center rounded-full bg-app-bg px-3 py-1 text-[11px] text-app-faint">
            현재 슬라이드 {slideIndex + 1}을(를) 수정합니다
          </span>
          {messages.length === 0 && (
            <div className="mt-1 text-[12.5px] leading-relaxed text-app-muted">
              <p>예시:</p>
              {SUGGESTION_CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() => void send(c)}
                  className="block py-0.5 text-left text-app-accent hover:underline"
                >
                  •&nbsp; {c}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[88%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "self-end rounded-[14px_14px_4px_14px] bg-app-text text-white"
                  : m.error
                    ? "self-start rounded-[14px_14px_14px_4px] border border-app-danger-border bg-app-danger-soft text-app-danger"
                    : "self-start rounded-[14px_14px_14px_4px] border border-[#E9E9E5] bg-app-bg text-app-text"
              }`}
            >
              {m.text}
              {m.applied && (
                <div className="mt-2 flex gap-1.5">
                  <span className="rounded-md bg-app-accent-soft px-2 py-1 text-[11.5px] font-semibold text-app-accent">
                    적용됨
                  </span>
                  <button
                    onClick={undoLast}
                    className="rounded-md border border-app-border bg-white px-2 py-1 text-[11.5px] font-medium text-app-muted hover:border-app-accent hover:text-app-accent"
                  >
                    <span className="mi align-middle text-[13px] mr-0.5">undo</span>되돌리기
                  </button>
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="self-start rounded-[14px_14px_14px_4px] border border-[#E9E9E5] bg-app-bg px-3.5 py-2.5 text-[13px] text-app-muted">
              <span className="animate-dg-pulse">수정 중…</span>
            </div>
          )}
          {/* Before / After 비교 카드 — 마지막 선택권은 사용자에게 */}
          {pendingHere && (
            <div className="rounded-xl border border-app-accent-border bg-[#F0F0EE] p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-[10.5px] font-bold tracking-wide text-app-faint">
                    BEFORE
                  </p>
                  <img
                    src={pendingHere.beforeUrl}
                    alt="수정 전"
                    className="w-full rounded-md border border-app-border bg-white"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10.5px] font-bold tracking-wide text-app-accent">
                    AFTER
                  </p>
                  <img
                    src={pendingHere.afterUrl}
                    alt="수정 후"
                    className="w-full rounded-md border border-app-accent-border bg-white"
                  />
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={applyPending}
                  className="flex-1 rounded-lg bg-app-accent py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                >
                  <span className="mi align-middle text-[13px] mr-0.5">check</span>적용
                </button>
                <button
                  onClick={discardPending}
                  className="flex-1 rounded-lg border border-app-border bg-white py-1.5 text-[12px] font-medium text-app-muted hover:bg-app-bg"
                >
                  버리기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-app-border-soft px-3.5 pt-2.5 pb-3.5">
        {messages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTION_CHIPS.map((c) => (
              <button
                key={c}
                disabled={busy || !!pendingHere}
                onClick={() => void send(c)}
                className="rounded-full border border-app-border bg-white px-2.5 py-1 text-[11.5px] text-app-muted hover:border-app-accent hover:text-app-accent disabled:opacity-40"
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-[11px] border border-app-border bg-white py-1.5 pr-1.5 pl-3 focus-within:border-app-accent">
          <input
            className="min-w-0 flex-1 text-[13px] focus:!outline-none"
            placeholder={
              pendingHere ? "위 수정안을 먼저 적용하거나 버려주세요" : "이 슬라이드를 어떻게 바꿀까요?"
            }
            value={input}
            disabled={busy || !!pendingHere}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void send();
            }}
          />
          <button
            onClick={() => void send()}
            disabled={busy || !!pendingHere || !input.trim()}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-app-accent text-[12px] text-white disabled:opacity-40"
            title="전송"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
