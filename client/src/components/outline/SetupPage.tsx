// 새 덱 설정 화면 (Demo Act 3) — 스타일 4종 + 테마 갤러리 + 변형 A~E. 홈과 아웃라인 사이.
import { Link, useNavigate, useParams } from "react-router-dom";
import { themes } from "../../engine/themes";
import type { DeckStyle } from "../../store/outlineStore";
import { useOutlineStore } from "../../store/outlineStore";

const STYLES: { id: DeckStyle; name: string; desc: string }[] = [
  { id: "report", name: "Report", desc: "전략·분석·인사이트" },
  { id: "standard", name: "Standard", desc: "범용 문서형" },
  { id: "presentation", name: "Presentation", desc: "발표·제안서" },
  { id: "keynote", name: "Keynote", desc: "이미지 중심 키노트" },
];

const THEME_LIST = Object.values(themes);

export function SetupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useOutlineStore();

  // 홈에서 begin() 없이 진입한 경우 방어
  if (!id || store.deckId !== id) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-[13px] text-app-faint">설정할 덱 정보가 없어요.</p>
        <Link to="/" className="rounded-lg bg-app-text px-4 py-2 text-[13px] font-semibold text-white">홈으로</Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-app-border bg-app-surface px-7 py-3.5">
        <span className="h-[22px] w-[22px] rounded-md bg-app-accent" />
        <span className="text-[15px] font-bold">DeckGen</span>
        <span className="text-[13px] text-app-faint">/ 새 덱 설정</span>
        <span className="flex-1" />
        <span className="text-[12px] text-app-faint">1 설정 → 2 아웃라인 → 3 생성·편집</span>
      </header>

      <div className="mx-auto w-[720px] max-w-[92vw] py-10">
        <h1 className="mb-6 text-[24px] font-bold tracking-tight">스타일과 테마를 선택하세요</h1>

        {/* 스타일 4카드 */}
        <p className="mb-2 text-[11px] font-bold tracking-[.06em] text-app-faint">스타일</p>
        <div className="mb-7 grid grid-cols-4 gap-3">
          {STYLES.map((st) => (
            <button
              key={st.id}
              onClick={() => store.setSetup({ style: st.id })}
              className={`rounded-xl border p-4 text-left ${
                store.style === st.id ? "border-[1.5px] border-app-accent bg-app-accent-soft" : "border-app-border hover:border-app-muted"
              }`}
            >
              <div className="mb-2 flex h-12 items-center justify-center rounded-lg bg-app-bg text-app-faint">
                {st.id === "report" ? "▤" : st.id === "standard" ? "▦" : st.id === "presentation" ? "▧" : "▣"}
              </div>
              <div className="text-[13px] font-bold">{st.name}</div>
              <div className="text-[11px] text-app-faint">{st.desc}</div>
            </button>
          ))}
        </div>

        {/* 변형 A~E */}
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-bold tracking-[.06em] text-app-faint">테마 · 변형</p>
          <div className="flex overflow-hidden rounded-lg border border-app-border">
            {["A", "B", "C", "D", "E"].map((v) => (
              <button
                key={v}
                onClick={() => store.setSetup({ variant: v })}
                className={`border-l border-app-border px-2.5 py-1 text-[11px] font-semibold first:border-l-0 ${
                  store.variant === v ? "bg-app-accent-soft text-app-accent" : "text-app-faint"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {/* 테마 갤러리 */}
        <div className="mb-8 grid grid-cols-4 gap-3">
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              onClick={() => store.setSetup({ themeId: t.id })}
              className={`overflow-hidden rounded-xl border ${
                store.themeId === t.id ? "border-[1.5px] border-app-accent" : "border-app-border hover:border-app-muted"
              }`}
            >
              <div className="flex h-20 flex-col justify-center gap-1.5 px-4" style={{ background: t.bg }}>
                <div className="h-[3px] w-8 rounded-sm" style={{ background: t.accent }} />
                <div className="text-[15px] font-extrabold" style={{ color: t.textPrimary }}>Aa</div>
              </div>
              <div className="flex items-center gap-1 px-3 py-2">
                <span className="text-[11.5px] font-semibold">{t.name}</span>
                <span className="ml-auto flex gap-0.5">
                  {t.chartPalette.slice(0, 3).map((c, i) => (
                    <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                  ))}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-between">
          <button onClick={() => navigate("/")} className="rounded-lg border border-app-border px-4 py-2.5 text-[13px] font-semibold hover:border-app-accent">
            ← 뒤로
          </button>
          <button
            onClick={() => navigate(`/deck/${id}/outline`)}
            className="rounded-lg bg-app-accent px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
          >
            아웃라인 생성 →
          </button>
        </div>
      </div>
    </div>
  );
}
