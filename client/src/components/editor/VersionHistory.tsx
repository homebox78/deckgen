// 버전 히스토리 모달 (Demo Act 5) — 스냅샷 저장 + 복원
import { useState } from "react";
import type { Deck } from "../../engine/schema";
import { useDeckStore } from "../../store/deckStore";
import { listVersions, saveVersion } from "../../store/versionStore";
import type { DeckVersion } from "../../store/versionStore";
import { showToast } from "../ui/toast";

function absTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const ap = h < 12 ? "오전" : "오후";
  const h12 = h % 12 || 12;
  return `${ap} ${String(h12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const THEME_NAMES: Record<string, string> = {
  "clean-light": "Clean Light",
  "ink-dark": "Ink Dark",
  "warm-craft": "Warm Craft",
  "violet-bold": "Violet Bold",
};
const themeName = (id: string) => THEME_NAMES[id] ?? id;

// 슬라이드 제목/구성 diff (버전 ↔ 현재)
function slideTitle(slide: { elements: { type: string; text?: string; role?: string }[] }): string {
  const t = slide.elements.find(
    (e) => e.type === "text" && (e.role === "title" || e.role === "heading"),
  );
  return (t?.text || "(제목 없음)").split("\n")[0];
}

function buildDiff(oldSlides: Deck["slides"], newSlides: Deck["slides"]) {
  const rows: { a: string; b: string; mark: string; markColor: string }[] = [];
  const n = Math.max(oldSlides.length, newSlides.length);
  let added = 0,
    removed = 0,
    changed = 0;
  for (let i = 0; i < n; i++) {
    const o = oldSlides[i];
    const c = newSlides[i];
    if (o && !c) {
      rows.push({ a: slideTitle(o), b: "", mark: "삭제", markColor: "#E5484D" });
      removed++;
    } else if (!o && c) {
      rows.push({ a: "", b: slideTitle(c), mark: "추가", markColor: "#1A9C5B" });
      added++;
    } else if (o && c) {
      const ta = slideTitle(o);
      const tb = slideTitle(c);
      const diff = ta !== tb || o.elements.length !== c.elements.length || o.layout !== c.layout;
      if (diff) changed++;
      rows.push({ a: ta, b: tb, mark: diff ? "변경" : "", markColor: "#6B6B66" });
    }
  }
  return { rows, added, removed, changed };
}

export function VersionHistory({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [versions, setVersions] = useState<DeckVersion[]>(() => listVersions(deck.id));
  const [compareId, setCompareId] = useState<string | null>(null);
  const compareVer = versions.find((v) => v.id === compareId);
  const diff = compareVer ? buildDiff(compareVer.slides, deck.slides) : null;

  if (compareVer && diff) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.45)] p-4" onClick={onClose}>
        <div
          className="max-h-[80vh] w-[560px] max-w-[94vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,.28)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-app-border px-5 py-3.5">
            <span className="text-[15px] font-bold">버전 비교</span>
            <button onClick={() => setCompareId(null)} className="rounded-md border border-app-border px-2.5 py-1 text-[12px] text-app-muted hover:border-app-accent">
              <span className="mi align-middle text-[14px] mr-0.5">arrow_back</span>목록
            </button>
          </div>
          <div className="px-5 py-3 text-[12px] text-app-muted">
            <b className="text-app-text">{compareVer.label}</b>{" "}
            <span className="mi align-middle text-[13px]">sync_alt</span> 현재 · 추가 {diff.added} · 삭제{" "}
            {diff.removed} · 변경 {diff.changed}
          </div>
          <div className="max-h-[56vh] overflow-y-auto px-5 pb-4">
            <div className="mb-1.5 flex gap-3 text-[10.5px] font-bold tracking-wide text-app-faint uppercase">
              <span className="flex-1">이 버전</span>
              <span className="w-12 text-center">변경</span>
              <span className="flex-1">현재</span>
            </div>
            <div className="flex flex-col divide-y divide-app-border-soft">
              {diff.rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-2 text-[12px]">
                  <span
                    className={`min-w-0 flex-1 truncate ${r.mark === "삭제" ? "text-app-danger line-through" : "text-app-muted"}`}
                  >
                    {r.a || "—"}
                  </span>
                  <span
                    className="w-12 shrink-0 text-center text-[10.5px] font-bold"
                    style={{ color: r.markColor }}
                  >
                    {r.mark}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate ${r.mark === "추가" ? "font-semibold text-app-success" : r.mark === "변경" ? "font-semibold text-app-text" : "text-app-muted"}`}
                  >
                    {r.b || "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-app-border px-5 py-3">
            <button
              onClick={() => {
                const st = useDeckStore.getState();
                if (!st.deck) return;
                st.setDeck({ ...st.deck, slides: JSON.parse(JSON.stringify(compareVer.slides)), updatedAt: Date.now() });
                showToast("이 버전으로 복원했어요");
                onClose();
              }}
              className="rounded-lg bg-app-text px-3.5 py-2 text-[12px] font-semibold text-white hover:opacity-90"
            >
              이 버전으로 복원
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.45)] p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-[440px] max-w-[94vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-app-border px-5 py-3.5">
          <span className="text-[15px] font-bold">버전 히스토리</span>
          <button onClick={onClose} className="text-[15px] text-app-faint hover:text-app-text"><span className="mi text-[15px]">close</span></button>
        </div>
        <p className="px-5 pt-3 text-[11.5px] leading-relaxed text-app-faint">
          생성·AI 수정 시 자동 저장됩니다. 복원해도 이후 버전은 사라지지 않아요.
        </p>
        <div className="p-4">
          <button
            onClick={() => {
              const v = saveVersion(deck.id, deck.slides, `${deck.slides.length}장 · 수동 저장`);
              if (v) {
                setVersions((p) => [v, ...p]);
                showToast("현재 상태를 버전으로 저장했어요");
              } else {
                setVersions(listVersions(deck.id)); // 밀려난 목록 반영
                showToast("저장 공간이 부족해요 — 오래된 버전이나 다른 덱을 정리한 뒤 다시 시도하세요");
              }
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
                {versions.map((v, vi) => (
                  <div key={v.id} className="flex items-center gap-2.5 rounded-lg border border-app-border-soft px-3 py-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${vi === 0 ? "bg-app-accent" : "bg-app-border"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold">{v.label}</div>
                      <div className="text-[11px] text-app-faint">
                        {absTime(v.createdAt)} · {v.slides.length}장 · {themeName(deck.themeId)}
                      </div>
                    </div>
                    {vi === 0 && (
                      <span className="flex-none rounded-full bg-app-bg px-2 py-0.5 text-[10px] font-semibold text-app-muted">현재</span>
                    )}
                    <button
                      onClick={() => setCompareId(v.id)}
                      className="flex-none rounded-md border border-app-border bg-white px-2.5 py-1 text-[11px] font-semibold hover:border-app-accent"
                    >
                      비교
                    </button>
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
