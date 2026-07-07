// 버전 히스토리 모달 (Demo Act 5) — 스냅샷 저장 + 복원
import { useState } from "react";
import type { Deck } from "../../engine/schema";
import { useDeckStore } from "../../store/deckStore";
import { listVersions, saveVersion } from "../../store/versionStore";
import type { DeckVersion } from "../../store/versionStore";
import { showToast } from "../ui/toast";

function rel(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export function VersionHistory({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [versions, setVersions] = useState<DeckVersion[]>(() => listVersions(deck.id));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.45)] p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-[440px] max-w-[94vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-app-border px-5 py-3.5">
          <span className="text-[15px] font-bold">버전 히스토리</span>
          <button onClick={onClose} className="text-[15px] text-app-faint hover:text-app-text">✕</button>
        </div>
        <div className="p-4">
          <button
            onClick={() => {
              const v = saveVersion(deck.id, deck.slides, `${deck.slides.length}장 · 수동 저장`);
              setVersions((p) => [v, ...p]);
              showToast("현재 상태를 버전으로 저장했어요");
            }}
            className="mb-3 w-full rounded-lg bg-app-text py-2.5 text-[12.5px] font-semibold text-white hover:opacity-90"
          >
            + 현재 상태를 버전으로 저장
          </button>
          <div className="max-h-[52vh] overflow-y-auto">
            {versions.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-app-faint">
                저장된 버전이 없어요.
                <br />
                위 버튼으로 현재 상태를 스냅샷하세요.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 rounded-lg border border-app-border-soft px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold">{v.label}</div>
                      <div className="text-[11px] text-app-faint">{rel(v.createdAt)}</div>
                    </div>
                    <button
                      onClick={() => {
                        const st = useDeckStore.getState();
                        if (!st.deck) return;
                        st.setDeck({ ...st.deck, slides: JSON.parse(JSON.stringify(v.slides)), updatedAt: Date.now() });
                        showToast("이 버전으로 복원했어요");
                        onClose();
                      }}
                      className="flex-none rounded-md border border-app-border bg-white px-2.5 py-1 text-[11px] font-semibold hover:border-app-accent hover:text-app-accent"
                    >
                      복원
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
