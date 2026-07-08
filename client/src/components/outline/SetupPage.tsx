// 새 덱 설정 화면 (Demo Act 3) — 스타일 4종 + 테마 갤러리 + 변형 A~E. 홈과 아웃라인 사이.
import { Link, useNavigate, useParams } from "react-router-dom";
import { Logo } from "../ui/Logo";
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

// 테마별 설명 (프로토타입)
const THEME_DESC: Record<string, string> = {
  "clean-light": "밝은 비즈니스 기본",
  "ink-dark": "다크 발표용",
  "warm-craft": "웜톤 제안서",
  "violet-bold": "스타트업 피치",
};

/** 스타일 카드 미니어처 (프로토타입 시안 — 형태로 성격 표현) */
function StylePreview({ id }: { id: DeckStyle }) {
  if (id === "report") {
    return (
      <div className="flex h-full w-full items-end gap-1 px-4 pb-3 pt-4">
        {[40, 62, 82, 100].map((h, i) => (
          <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: i === 3 ? "#1A1A1A" : "#C9C9C4" }} />
        ))}
        <div className="ml-1.5 flex flex-1 flex-col gap-1.5 self-center">
          <div className="h-1.5 rounded bg-[#D4D4CE]" />
          <div className="h-1.5 w-3/4 rounded bg-[#E4E4E0]" />
        </div>
      </div>
    );
  }
  if (id === "standard") {
    return (
      <div className="flex h-full w-full items-center gap-3 px-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-1.5 rounded bg-[#C9C9C4]" />
          <div className="h-1.5 rounded bg-[#E4E4E0]" />
          <div className="h-1.5 w-4/5 rounded bg-[#E4E4E0]" />
          <div className="h-1.5 w-2/3 rounded bg-[#E4E4E0]" />
        </div>
        <div
          className="h-10 w-10 shrink-0 rounded-full"
          style={{ background: "conic-gradient(#1A1A1A 0 130deg,#C9C9C4 130deg 360deg)" }}
        />
      </div>
    );
  }
  if (id === "presentation") {
    return (
      <div className="flex h-full w-full flex-col justify-center gap-2 px-4">
        <div className="flex gap-1.5">
          {[["65%", "Growth"], ["2.4x", "ROI"], ["$12M", "ARR"]].map(([v, l]) => (
            <div key={l} className="flex-1 rounded border border-app-border bg-white px-1.5 py-1">
              <div className="text-[9px] font-extrabold leading-none">{v}</div>
              <div className="text-[6px] text-app-faint">{l}</div>
            </div>
          ))}
        </div>
        <div className="h-1.5 rounded bg-[#1A1A1A]" />
        <div className="h-1.5 w-3/5 rounded bg-[#E4E4E0]" />
      </div>
    );
  }
  // keynote — 이미지 중심
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 px-4">
      <div className="h-1.5 w-1/3 rounded bg-[#D4D4CE]" />
      <div className="flex h-10 items-center justify-center rounded bg-[#D4D4CE]">
        <span className="mi text-[18px] text-white">image</span>
      </div>
    </div>
  );
}

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
        <Logo size={22} />
        <span className="text-[15px] font-bold">DeckGen</span>
        <span className="text-[13px] text-app-faint">/ 새 덱 설정</span>
        <span className="flex-1" />
        <span className="text-[12px] text-app-faint">1 설정 → 2 아웃라인 → 3 생성·편집</span>
      </header>

      <div className="mx-auto w-[980px] max-w-[92vw] py-10">
        <h1 className="mb-1.5 text-[22px] font-bold tracking-tight">스타일과 테마를 선택하세요</h1>
        <p className="mb-6 text-[13.5px] text-app-muted">
          덱 형식을 먼저 고른 뒤 색상 테마를 선택하세요. 두 설정 모두 전체 덱에 한 번에 적용됩니다.
        </p>

        {/* 스타일 4카드 (미니어처) */}
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
              <div className="mb-2 h-24 overflow-hidden rounded-lg border border-app-border bg-white">
                <StylePreview id={st.id} />
              </div>
              <div className="text-center text-[13px] font-bold">{st.name}</div>
              <div className="text-center text-[11px] text-app-faint">{st.desc}</div>
            </button>
          ))}
        </div>

        {/* 테마 헤더 + 변형 A~E */}
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-bold">
            테마 <span className="font-normal text-app-faint">— {THEME_LIST.find((t) => t.id === store.themeId)?.name ?? "Clean Light"}</span>
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-app-faint">변형</span>
            <div className="flex overflow-hidden rounded-lg border border-app-border">
              {["A", "B", "C", "D", "E"].map((v) => (
                <button
                  key={v}
                  onClick={() => store.setSetup({ variant: v })}
                  className={`border-l border-app-border px-2.5 py-1 text-[11px] font-semibold first:border-l-0 ${
                    store.variant === v ? "bg-app-text text-white" : "text-app-faint"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* 테마 갤러리 (Aa + accent/sub 바 + 역할 점 4 + 이름 + 설명) */}
        <div className="mb-8 grid grid-cols-4 gap-3">
          {THEME_LIST.map((t) => (
            <button
              key={t.id}
              onClick={() => store.setSetup({ themeId: t.id })}
              className={`overflow-hidden rounded-xl border text-left ${
                store.themeId === t.id ? "border-[1.5px] border-app-accent" : "border-app-border hover:border-app-muted"
              }`}
            >
              <div className="flex h-24 flex-col justify-center gap-2 px-4" style={{ background: t.bg }}>
                <div className="text-[18px] font-extrabold leading-none" style={{ color: t.textPrimary }}>Aa</div>
                <div className="h-[3px] w-10 rounded-sm" style={{ background: t.accent }} />
                <div className="h-[3px] w-6 rounded-sm" style={{ background: t.textSecondary }} />
                <div className="mt-0.5 flex gap-1">
                  {[t.accent, t.textPrimary, t.textSecondary, t.surface].map((c, i) => (
                    <span key={i} className="h-2 w-2 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </div>
              </div>
              <div className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: t.accent }} />
                  <span className="text-[11.5px] font-semibold">{t.name}</span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-app-faint">{THEME_DESC[t.id] ?? ""}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-between">
          <button onClick={() => navigate("/")} className="bg-transparent px-2 py-2.5 text-[13px] font-semibold text-app-muted hover:text-app-text">
            <span className="mi align-middle text-[14px] mr-0.5">arrow_back</span>뒤로
          </button>
          <button
            onClick={() => navigate(`/deck/${id}/outline`)}
            className="rounded-lg bg-app-accent px-6 py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
          >
            아웃라인 생성 →
          </button>
        </div>
      </div>
    </div>
  );
}
