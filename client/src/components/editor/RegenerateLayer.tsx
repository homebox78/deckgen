// 슬라이드 재생성 레이어 — 썸네일 호버 ↻ 클릭 시 등장 (스냅덱 참고)
// 지시 입력(비우면 기본 재구성 지시) + LLM 모델 선택 → /api/edit 경유 재생성
import { useEffect, useRef, useState } from "react";
import type { ModelInfo } from "../../api/client";
import { fetchModels, postEdit } from "../../api/client";
import type { Slide } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { useDeckStore } from "../../store/deckStore";
import { showToast } from "../ui/toast";

const DEFAULT_INSTRUCTION =
  "이 슬라이드를 같은 주제로 다시 구성해줘. 문구를 더 명확하고 임팩트 있게 다듬고, 필요하면 요소 구성을 개선해도 된다.";

interface Props {
  slide: Slide;
  theme: Theme;
  anchor: { x: number; y: number };
  onClose: () => void;
}

export function RegenerateLayer({ slide, theme, anchor, onClose }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const downOnBackdrop = useRef(false);
  const replaceSlide = useDeckStore((s) => s.replaceSlide);

  useEffect(() => {
    void fetchModels().then((m) => {
      setModels(m);
      setModelId(m.find((x) => x.default)?.id ?? m[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const edited = await postEdit(
        text.trim() || DEFAULT_INSTRUCTION,
        slide,
        theme,
        modelId || undefined,
      );
      replaceSlide(slide.id, { ...edited, id: slide.id });
      showToast("슬라이드를 재생성했어요 — Ctrl+Z로 되돌릴 수 있어요");
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "재생성에 실패했어요");
      setBusy(false);
    }
  };

  // 화면 밖으로 나가지 않게 위치 클램프
  const top = Math.min(anchor.y, Math.max(8, window.innerHeight - 300));
  const left = Math.min(anchor.x, window.innerWidth - 480);

  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="absolute w-[460px] rounded-2xl border border-app-border bg-white shadow-[0_12px_40px_rgba(0,0,0,.16)]"
        style={{ top, left }}
      >
        <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
          <span className="text-[13.5px] font-bold">✦ 슬라이드 재생성</span>
          <button
            onClick={onClose}
            className="rounded-md px-1.5 text-[15px] text-app-faint hover:bg-app-bg hover:text-app-text"
            title="닫기"
          >
            ×
          </button>
        </div>
        <div className="px-4 pb-3.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="이 슬라이드를 어떻게 바꿀지 설명해 주세요. (비우면 전체 재구성)"
            rows={5}
            disabled={busy}
            autoFocus
            className="w-full resize-none rounded-xl border border-app-border px-3.5 py-3 text-[13px] leading-relaxed placeholder:text-app-faint focus:border-app-accent focus:outline-none disabled:opacity-60"
          />
          <div className="mt-2.5 flex items-center justify-between">
            {/* 모델 선택 — config.php 키 기반 목록 (주력/폴백/저비용) */}
            <div className="flex items-center gap-1.5 rounded-full border border-app-border bg-app-bg px-3 py-1.5">
              <span className="text-[12px]">✦</span>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={busy || models.length === 0}
                className="max-w-[240px] bg-transparent text-[12px] font-semibold focus:outline-none"
                title="사용할 AI 모델"
              >
                {models.length === 0 && <option value="">모의 모드 (키 없음)</option>}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} · {m.role}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => void submit()}
              disabled={busy}
              title="재생성 실행"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-app-text text-[14px] text-white hover:opacity-85 disabled:opacity-50"
            >
              {busy ? <span className="animate-pulse">…</span> : "↵"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
