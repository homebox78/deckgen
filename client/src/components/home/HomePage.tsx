import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { uid } from "../../engine/schema";
import { DEFAULT_THEME_ID, getTheme, themes } from "../../engine/themes";
import { WIREFRAME_LIBRARIES, createStoryboardDeck } from "../../engine/wireframes";
import { clearHistory, useDeckStore } from "../../store/deckStore";
import { useGenerationStore } from "../../store/generationStore";
import { useOutlineStore } from "../../store/outlineStore";
import type { DeckSummary } from "../../store/storage";
import { deleteDeck, listDecks, saveDeck } from "../../store/storage";
import { Dropdown } from "../ui/Dropdown";
import { StatusBadge } from "../ui/StatusBadge";
import { showToast } from "../ui/toast";

const MIN_SLIDES = 3;
const MAX_SLIDES = 12;

// 디자인 시안(1b) 제안 칩 — 클릭 시 주제·테마·장수 프리필
const SUGGESTIONS = [
  {
    label: "분기 실적 보고",
    prompt: "2026년 2분기 실적 보고서를 만들어줘: 매출, 핵심 지표, 이슈, 다음 분기 계획",
    themeId: "ink-dark",
    count: 6,
  },
  {
    label: "스타트업 피치덱",
    prompt: "헬스케어 AI 스타트업 투자유치 피치덱을 만들어줘: 문제, 솔루션, 트랙션, 팀",
    themeId: "violet-bold",
    count: 8,
  },
  {
    label: "제안서",
    prompt: "소상공인 경영바우처 지원 제안서를 만들어줘",
    themeId: "clean-light",
    count: 5,
  },
  {
    label: "브랜드 협업 제안",
    prompt: "로컬 브랜드 협업 제안서를 만들어줘: 브랜드 소개, 협업 아이디어, 기대 효과",
    themeId: "warm-craft",
    count: 6,
  },
];

function relTime(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function DeckCard({ deck, onDelete }: { deck: DeckSummary; onDelete: () => void }) {
  const theme = getTheme(deck.themeId);
  const gen = useGenerationStore();
  const generating = gen.deckId === deck.id && gen.active;

  return (
    <Link
      to={`/deck/${deck.id}/edit`}
      className="group overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-[0_1px_4px_rgba(0,0,0,.04)] transition-all hover:border-app-accent hover:shadow-[0_4px_14px_rgba(109,74,255,.15)]"
    >
      <div
        className="aspect-video w-full border-b border-app-border-soft"
        style={{ background: theme.bg }}
      >
        {deck.thumbnail ? (
          <img src={deck.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col justify-center gap-1.5 px-4">
            <div className="h-[3px] w-[10%]" style={{ background: theme.accent }} />
            <div
              className="text-[11px] leading-snug font-bold"
              style={{ color: theme.textPrimary }}
            >
              {deck.title}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{deck.title}</p>
          <p className="mt-0.5 text-[11.5px] text-app-faint">
            {deck.slideCount}장 · {theme.name} · {relTime(deck.updatedAt)}
          </p>
        </div>
        {generating && (
          <StatusBadge status="generating" size="sm">
            생성 중
          </StatusBadge>
        )}
        <button
          title="덱 삭제"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 rounded-[7px] border border-app-danger-border bg-app-danger-soft px-2 py-1 text-[11px] font-semibold text-app-danger opacity-0 transition-opacity group-hover:opacity-100"
        >
          삭제
        </button>
      </div>
    </Link>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const begin = useOutlineStore((s) => s.begin);
  const [prompt, setPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [query, setQuery] = useState("");
  const [decks, setDecks] = useState<DeckSummary[]>(() => listDecks());
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const theme = getTheme(themeId);

  const create = () => {
    if (!prompt.trim()) return;
    const deckId = uid();
    begin({ deckId, prompt: prompt.trim(), slideCount, themeId });
    navigate(`/deck/${deckId}/outline`);
  };

  const removeDeck = (d: DeckSummary) => {
    if (!window.confirm(`'${d.title}' 덱을 삭제할까요? 되돌릴 수 없어요.`)) return;
    deleteDeck(d.id);
    setDecks(listDecks());
    showToast(`'${d.title}' 삭제됨`);
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? decks.filter((d) => d.title.toLowerCase().includes(q)) : decks;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 상단 바 */}
      <header className="flex shrink-0 items-center justify-between border-b border-app-border bg-app-surface px-7 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="h-[22px] w-[22px] rounded-md bg-app-accent" />
          <span className="text-[15px] font-bold tracking-tight">DeckGen</span>
        </div>
        <span className="text-[12px] text-app-faint">로컬에 자동 저장됨</span>
      </header>

      {/* 히어로 + 프롬프트 카드 */}
      <div className="flex flex-col items-center px-6 pt-14 pb-10">
        <h1 className="text-[30px] font-bold tracking-[-.02em]">어떤 발표를 만들까요?</h1>
        <p className="mt-2 mb-7 text-[14px] text-app-muted">
          주제를 입력하면 AI가 아웃라인을 먼저 설계하고, 확인 후 슬라이드를 만듭니다.
        </p>
        <div className="w-[720px] max-w-[92vw] rounded-2xl border border-app-border bg-app-surface p-4.5 pb-3.5 shadow-[0_4px_20px_rgba(0,0,0,.06)]">
          <textarea
            ref={promptRef}
            className="h-20 w-full resize-none text-[15px] leading-relaxed focus:outline-none"
            placeholder="예: 소상공인 경영바우처 지원 제안서를 만들어줘"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) create();
            }}
          />
          <div className="flex items-center gap-2.5 border-t border-app-border-soft pt-3">
            {/* 슬라이드 수 스텝퍼 */}
            <div className="flex items-center overflow-hidden rounded-[9px] border border-app-border">
              <button
                onClick={() => setSlideCount((n) => Math.max(MIN_SLIDES, n - 1))}
                className="border-r border-app-border bg-white px-2.5 py-1.5 text-[13px] text-app-muted hover:bg-app-bg"
              >
                −
              </button>
              <span className="px-3 py-1.5 text-[12.5px] font-semibold">{slideCount}장</span>
              <button
                onClick={() => setSlideCount((n) => Math.min(MAX_SLIDES, n + 1))}
                className="border-l border-app-border bg-white px-2.5 py-1.5 text-[13px] text-app-muted hover:bg-app-bg"
              >
                +
              </button>
            </div>
            {/* 테마 드롭다운 */}
            <Dropdown
              items={Object.values(themes).map((t) => ({
                key: t.id,
                name: t.name,
                swatch: t.accent,
              }))}
              activeKey={themeId}
              onSelect={setThemeId}
              triggerClassName="flex items-center gap-2 rounded-[9px] border border-app-border bg-white px-3 py-2 hover:border-app-accent data-open:border-app-accent"
            >
              <span
                className="h-[11px] w-[11px] rounded-[3px]"
                style={{ background: theme.accent }}
              />
              <span className="text-[12.5px] font-medium">{theme.name}</span>
              <span className="text-[9px] text-app-faint">▾</span>
            </Dropdown>
            <span className="flex-1" />
            <button
              onClick={create}
              disabled={!prompt.trim()}
              className="rounded-[10px] bg-app-accent px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_2px_8px_rgba(109,74,255,.3)] hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
            >
              ✦ 아웃라인 생성
            </button>
          </div>
        </div>
        {/* 제안 칩 */}
        <div className="mt-3.5 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => {
                setPrompt(s.prompt);
                setThemeId(s.themeId);
                setSlideCount(s.count);
                promptRef.current?.focus();
                showToast(`'${s.label}' 템플릿 적용 — 내용을 다듬고 생성하세요`);
              }}
              className="rounded-full border border-app-border bg-app-surface px-3.5 py-1.5 text-[12px] text-app-muted transition-colors hover:border-app-accent hover:text-app-accent"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 스토리보드 템플릿 (§13) — 완성 장표가 아니라 팀이 함께 채우는 와이어프레임 */}
      <div className="mx-auto w-[880px] max-w-[92vw] pb-12">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="text-[16px] font-semibold">스토리보드로 시작</h2>
          <span className="text-[12px] text-app-faint">
            와이어프레임 골격을 만들고, 공유해서 팀이 함께 채워요
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {WIREFRAME_LIBRARIES.map((lib) => (
            <button
              key={lib.id}
              onClick={() => {
                const deck = createStoryboardDeck(lib.id, themeId);
                if (!deck) return;
                saveDeck(deck);
                useDeckStore.getState().setDeck(deck);
                clearHistory();
                navigate(`/deck/${deck.id}/edit`);
                showToast(`'${lib.name}' ${lib.frames.length}프레임 생성 — 자리를 채우고 공유하세요`);
              }}
              className="group rounded-xl border border-app-border bg-app-surface p-3 text-left shadow-[0_1px_4px_rgba(0,0,0,.04)] transition-all hover:border-app-accent hover:shadow-[0_4px_14px_rgba(109,74,255,.15)]"
            >
              {/* 와이어프레임 미니 프리뷰 */}
              <div className="flex aspect-[16/10] flex-col justify-center gap-1.5 rounded-lg border border-app-border-soft bg-[#FBFBFA] p-3">
                <div className="h-[5px] w-2/5 rounded-sm bg-[#C9C9C4]" />
                <div className="mt-1 flex flex-1 gap-1.5">
                  <div className="flex flex-1 flex-col justify-center gap-1">
                    <div className="h-[3px] w-full rounded-sm bg-[#DEDEDA]" />
                    <div className="h-[3px] w-4/5 rounded-sm bg-[#DEDEDA]" />
                    <div className="h-[3px] w-[90%] rounded-sm bg-[#DEDEDA]" />
                  </div>
                  <div className="flex flex-1 items-center justify-center rounded-[4px] border border-dashed border-[#C9C9C4] bg-[#F3F3F0]">
                    <span className="text-[8px] text-app-faint">AREA</span>
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-[12.5px] font-semibold group-hover:text-app-accent">
                {lib.name}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-app-faint">
                {lib.frames.length}프레임 · {lib.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 내 덱 */}
      <div className="mx-auto w-[880px] max-w-[92vw] pb-16">
        <div className="mb-3.5 flex items-center gap-3">
          <h2 className="shrink-0 text-[16px] font-semibold">내 덱</h2>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[9px] border border-app-border bg-app-surface px-3 py-2">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="#8A8A84"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="덱 제목 검색"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] focus:outline-none"
            />
            {q && (
              <button
                onClick={() => setQuery("")}
                className="text-[11px] text-app-faint hover:text-app-text"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
          {filtered.map((d) => (
            <DeckCard key={d.id} deck={d} onDelete={() => removeDeck(d)} />
          ))}
          {!q && (
            <button
              onClick={() => promptRef.current?.focus()}
              className="flex min-h-35 flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#D4D4CE] text-app-muted transition-colors hover:border-app-accent hover:text-app-accent"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-app-border-soft text-[15px]">
                +
              </span>
              <span className="text-[12.5px] font-medium">새 덱 만들기</span>
            </button>
          )}
        </div>

        {filtered.length === 0 && q && (
          <div className="flex flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[#D4D4CE] bg-app-surface px-6 py-8">
            <p className="text-[13.5px] font-bold">검색 결과가 없어요</p>
            <p className="text-[12px] text-app-faint">
              '{query}'에 해당하는 덱이 없습니다. 검색어를 바꿔보세요.
            </p>
            <button
              onClick={() => setQuery("")}
              className="mt-1 rounded-[9px] border border-app-border bg-white px-3.5 py-2 text-[12px] font-medium text-app-muted hover:bg-app-bg"
            >
              검색 초기화
            </button>
          </div>
        )}
        {decks.length === 0 && !q && (
          <p className="mt-3 text-center text-[12.5px] leading-relaxed text-app-faint">
            아직 만든 덱이 없어요. 위 입력창에 주제를 적으면 AI가 아웃라인부터 만들어
            드립니다.
          </p>
        )}
      </div>
    </div>
  );
}
