import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { postEdit } from "../../api/client";
import type { Slide } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { useDeckStore } from "../../store/deckStore";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
  push: (m: ChatMessage) => void;
  setBusy: (b: boolean) => void;
}

// 세션 내 유지되는 채팅 히스토리 (탭 전환에도 유지)
const useChatStore = create<ChatState>()((set) => ({
  messages: [],
  busy: false,
  push: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setBusy: (busy) => set({ busy }),
}));

const DONE_REPLIES = [
  "적용했어요. 캔버스에서 확인해보세요!",
  "반영 완료! 마음에 안 들면 Ctrl+Z로 되돌릴 수 있어요.",
  "수정했어요. 이어서 더 다듬어볼까요?",
];

export function ChatPanel({
  slide,
  slideIndex,
  theme,
}: {
  slide: Slide;
  slideIndex: number;
  theme: Theme;
}) {
  const { messages, busy, push, setBusy } = useChatStore();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  const send = async () => {
    const instruction = input.trim();
    if (!instruction || busy) return;
    setInput("");
    push({ role: "user", text: instruction });
    setBusy(true);
    try {
      const edited = await postEdit(instruction, slide, theme);
      const st = useDeckStore.getState();
      if (st.deck?.slides.some((s) => s.id === slide.id)) {
        st.replaceSlide(slide.id, { ...edited, id: slide.id });
        push({
          role: "assistant",
          text: DONE_REPLIES[Math.floor(Math.random() * DONE_REPLIES.length)],
        });
      } else {
        push({ role: "assistant", text: "슬라이드를 찾을 수 없어요.", error: true });
      }
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

  return (
    <div className="flex h-full flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-sm leading-6 text-app-muted">
            <p className="font-medium text-app-text">
              현재 슬라이드({slideIndex + 1}번)를 AI로 수정합니다.
            </p>
            <p className="mt-2">예시:</p>
            <ul className="mt-1 list-inside list-disc">
              <li>제목을 더 임팩트 있게</li>
              <li>차트를 파이로 바꿔줘</li>
              <li>불릿 하나 추가해줘</li>
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap ${
                m.role === "user"
                  ? "self-end bg-app-accent text-white"
                  : m.error
                    ? "self-start border border-app-danger/40 bg-app-danger/5 text-app-danger"
                    : "self-start bg-app-bg"
              }`}
            >
              {m.text}
            </div>
          ))}
          {busy && (
            <div className="self-start rounded-xl bg-app-bg px-3 py-2 text-sm text-app-muted">
              <span className="animate-pulse">수정 중…</span>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-app-border p-3">
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-app-border px-3 py-2 text-sm focus:border-app-accent focus:outline-none"
            placeholder="수정 지시를 입력하세요"
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void send();
            }}
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
