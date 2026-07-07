import { useEffect, useState } from "react";
import { publishDeck } from "../../api/collab";
import type { Deck } from "../../engine/schema";
import {
  getShareTokens,
  saveShareTokens,
  useCollabStore,
} from "../../store/collabStore";
import { showToast } from "../ui/toast";

type Mode = "view" | "edit";

const MODES: { id: Mode; name: string; desc: string }[] = [
  { id: "view", name: "보기 전용", desc: "열람과 PPTX 다운로드만 — 편집 불가" },
  {
    id: "edit",
    name: "편집 허용",
    desc: "링크를 받은 사람도 같은 덱을 실시간으로 함께 편집",
  },
];

export function ShareDialog({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [tokens, setTokens] = useState(() => getShareTokens(deck.id));
  const [mode, setMode] = useState<Mode>("view");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 최초 공유: 서버에 덱 등록 → 토큰 발급 → 협업 세션 활성화
  useEffect(() => {
    if (tokens) return;
    let alive = true;
    publishDeck(deck)
      .then((t) => {
        if (!alive) return;
        saveShareTokens(deck.id, t);
        setTokens(t);
        useCollabStore.getState().bumpSession(); // 소유자도 즉시 동기화 시작
        showToast("공유가 시작됐어요 — 이제 이 덱은 서버와 동기화됩니다");
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "공유 실패"));
    return () => {
      alive = false;
    };
    // eslint 규칙: deck 전체가 아닌 최초 1회만 발행
  }, [deck.id]);

  // 서브경로 배포(/deckGen/) 대응 — BASE_URL을 포함해 링크 조립
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const url = tokens
    ? `${window.location.origin}${base}/s/${mode === "edit" ? tokens.editToken : tokens.viewToken}`
    : "";

  const copy = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      showToast("링크가 클립보드에 복사됐어요");
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-[rgba(20,20,26,.45)]"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-w-[92vw] rounded-2xl bg-white p-5.5 shadow-[0_24px_64px_rgba(0,0,0,.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-bold">링크 공유</span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-app-bg text-[13px] text-app-muted hover:bg-app-border-soft"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 mb-4 text-[12.5px] text-app-muted">
          링크가 있는 누구나 접근할 수 있어요. 권한별로 링크가 다릅니다.
        </p>

        {error && (
          <div className="mb-3 rounded-lg border border-app-danger-border bg-app-danger-soft p-3 text-[12.5px] text-app-danger">
            {error}
          </div>
        )}
        {!tokens && !error && (
          <div className="mb-3 rounded-lg border border-app-border bg-app-bg p-3 text-[12.5px] text-app-muted">
            <span className="animate-dg-pulse">공유 준비 중…</span>
          </div>
        )}

        <div className="mb-4 flex flex-col gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left ${
                mode === m.id
                  ? "border-[1.5px] border-app-accent bg-[#F7F4FF]"
                  : "border-app-border hover:border-app-accent-border"
              }`}
            >
              <span
                className={`h-4 w-4 shrink-0 rounded-full bg-white ${
                  mode === m.id
                    ? "border-[5px] border-app-accent"
                    : "border-[1.5px] border-[#C9C9C4]"
                }`}
              />
              <span>
                <span className="block text-[13px] font-semibold">{m.name}</span>
                <span className="block text-[11.5px] text-app-muted">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {tokens && (
          <div className="flex items-center gap-2 rounded-[10px] border border-app-border bg-[#FBFBFA] py-1.5 pr-1.5 pl-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[#4A4A45]">
              {url}
            </span>
            <button
              onClick={copy}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white ${
                copied ? "bg-app-success" : "bg-app-accent hover:opacity-90"
              }`}
            >
              {copied ? "복사됨 ✓" : "복사"}
            </button>
          </div>
        )}

        <p className="mt-3.5 border-t border-app-border-soft pt-3 text-[11.5px] leading-relaxed text-app-faint">
          같은 슬라이드를 동시에 고치면 나중 저장이 반영돼요. 서로 다른 슬라이드를 나눠
          작업하는 걸 추천합니다.
        </p>
      </div>
    </div>
  );
}
