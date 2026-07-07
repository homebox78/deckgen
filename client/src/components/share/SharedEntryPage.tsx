// /s/:token — 공유 링크 입장: 덱·권한 조회 → 이름 입력 → 협업 세션으로 에디터 진입
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchShared } from "../../api/collab";
import type { SharedDeckInfo } from "../../api/collab";
import { getTheme } from "../../engine/themes";
import {
  getGuestName,
  saveGuestSession,
  setGuestName,
} from "../../store/collabStore";
import { clearHistory, useDeckStore } from "../../store/deckStore";
import { useUiStore } from "../../store/uiStore";
import { StatusBadge } from "../ui/StatusBadge";

export function SharedEntryPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<SharedDeckInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(() => getGuestName());

  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetchShared(token)
      .then((i) => alive && setInfo(i))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "조회 실패"));
    return () => {
      alive = false;
    };
  }, [token]);

  const join = () => {
    if (!info || !token) return;
    const trimmed = name.trim() || "게스트";
    setGuestName(trimmed);
    saveGuestSession(info.deckId, { token, role: info.role, isGuest: true });
    useDeckStore.getState().setDeck(info.deck);
    useUiStore.getState().setCurrentSlideIndex(0);
    clearHistory();
    navigate(`/deck/${info.deckId}/edit`);
  };

  const theme = info ? getTheme(info.deck.themeId) : null;

  return (
    <div className="flex h-full items-center justify-center bg-app-bg px-6">
      <div className="w-[440px] max-w-full overflow-hidden rounded-2xl bg-white shadow-[0_20px_56px_rgba(0,0,0,.12)]">
        <div className="bg-[#17151F] px-7 pt-7 pb-6">
          <div className="mb-4 h-6 w-6 rounded-[7px] bg-app-accent" />
          {error ? (
            <>
              <p className="text-[20px] leading-snug font-extrabold text-white">
                링크를 열 수 없어요
              </p>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/60">{error}</p>
            </>
          ) : !info ? (
            <p className="animate-dg-pulse text-[15px] font-semibold text-white/70">
              공유 덱 불러오는 중…
            </p>
          ) : (
            <>
              <p className="text-[12px] font-semibold tracking-wide text-white/45">
                공유된 덱에 초대됐어요
              </p>
              <p className="mt-1.5 text-[21px] leading-snug font-extrabold break-keep text-white">
                {info.deck.title}
              </p>
              <div className="mt-3.5 flex items-center gap-2">
                <StatusBadge status={info.role === "edit" ? "generating" : "queued"} showDot={false}>
                  {info.role === "edit" ? "✎ 편집 권한" : "👁 보기 전용"}
                </StatusBadge>
                <span className="text-[11.5px] text-white/55">
                  {info.deck.slides.length}장 · {theme?.name}
                </span>
              </div>
            </>
          )}
        </div>
        {info && (
          <div className="px-6 pt-5 pb-6">
            <label className="mb-1.5 block text-[11px] font-bold tracking-[.06em] text-app-faint">
              참여자 이름 {info.role === "edit" && "— 다른 사람에게 커서/작업 위치로 표시돼요"}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") join();
              }}
              placeholder="예: 홈박스"
              maxLength={20}
              className="w-full rounded-[10px] border border-app-border px-3.5 py-2.5 text-[13.5px] focus:border-app-accent focus:!outline-none"
            />
            <button
              onClick={join}
              className="mt-3 w-full rounded-[10px] bg-app-text py-3.5 text-[14px] font-bold text-white hover:opacity-90"
            >
              {info.role === "edit" ? "함께 편집하기" : "덱 보기"}
            </button>
          </div>
        )}
        {error && (
          <div className="px-6 py-5">
            <button
              onClick={() => navigate("/")}
              className="w-full rounded-[10px] border border-app-border bg-white py-3 text-[13px] font-medium text-app-muted hover:bg-app-bg"
            >
              홈으로 이동
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
