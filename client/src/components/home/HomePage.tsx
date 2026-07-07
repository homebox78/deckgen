import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../../api/base";
import type { ImportedPptx } from "../../engine/pptxImport";
import { parsePptx } from "../../engine/pptxImport";
import type { DeckAspect } from "../../engine/schema";
import { uid } from "../../engine/schema";
import { DEFAULT_THEME_ID, getTheme, themes } from "../../engine/themes";
import {
  CAROUSEL_LIBRARIES,
  WIREFRAME_LIBRARIES,
  createStoryboardDeck,
} from "../../engine/wireframes";
import { clearHistory, useDeckStore } from "../../store/deckStore";
import { getShareTokens } from "../../store/collabStore";
import { useGenerationStore } from "../../store/generationStore";
import { useOutlineStore } from "../../store/outlineStore";
import type { DeckSummary } from "../../store/storage";
import { deleteDeck, listDecks, saveDeck } from "../../store/storage";
import { Dropdown } from "../ui/Dropdown";
import { StatusBadge } from "../ui/StatusBadge";
import { showToast } from "../ui/toast";

const MIN_SLIDES = 3;
const MAX_SLIDES = 12;

// 4:5 카드뉴스 제안 칩 — 처음부터 SNS 결과물을 상상하게
const SUGGESTIONS_CAROUSEL = [
  {
    label: "아침 습관 5가지",
    prompt: "생산성을 높여주는 아침 습관 5가지를 설명하는 인스타그램 캐러셀을 만들어줘",
    themeId: "clean-light",
    count: 7,
  },
  {
    label: "복리의 마법",
    prompt: "복리가 시간이 지나며 자산을 어떻게 불려주는지 풀어주는 카드뉴스를 만들어줘",
    themeId: "ink-dark",
    count: 6,
  },
  {
    label: "채용 브랜딩",
    prompt: "개발팀 채용을 위한 우리 팀 문화 소개 캐러셀을 만들어줘: 일하는 방식, 성장 기회, 지원 방법",
    themeId: "violet-bold",
    count: 6,
  },
  {
    label: "행사 홍보",
    prompt: "다음 달 오프라인 세미나 홍보 캐러셀을 만들어줘: 왜 와야 하는지, 프로그램, 신청 방법",
    themeId: "warm-craft",
    count: 5,
  },
];

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

/** 라이브러리별 미니 와이어프레임 프리뷰 — 각 스토리보드의 성격을 압축해 보여준다 */
function PreviewArt({ id }: { id: string }) {
  // ── 4:5 캐러셀 프리뷰 ──
  if (id === "carousel-magazine") {
    return (
      <>
        <div className="h-[5px] w-3/5 rounded-sm bg-[#C9C9C4]" />
        <div className="mt-1.5 flex flex-1 items-center justify-center rounded-[4px] border border-dashed border-[#C9C9C4] bg-[#F3F3F0]">
          <div className="h-[55%] w-[55%] rounded-md bg-[#DAD9D4]" />
        </div>
        <div className="mt-1.5 h-[3px] w-4/5 rounded-sm bg-[#DEDEDA]" />
      </>
    );
  }
  if (id === "carousel-guide") {
    return (
      <>
        <div className="h-[5px] w-3/5 rounded-sm bg-[#C9C9C4]" />
        <div className="mt-1.5 flex flex-1 flex-col justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-[2px] border border-[#B4B4AE]" />
              <span className="h-[3px] flex-1 rounded-sm bg-[#DEDEDA]" />
            </div>
          ))}
        </div>
        <div className="h-[6px] w-2/5 self-center rounded-full bg-[#C9C9C4]" />
      </>
    );
  }
  if (id === "carousel-event") {
    return (
      <>
        <div className="self-start rounded-full border border-[#C9C9C4] px-1.5 py-0.5 text-[6px] leading-none text-[#8A8A84]">
          D-7 · SAT
        </div>
        <div className="mt-1.5 h-[6px] w-4/5 rounded-sm bg-[#C9C9C4]" />
        <div className="mt-1 h-[6px] w-3/5 rounded-sm bg-[#C9C9C4]" />
        <div className="mt-auto flex h-[16%] items-center justify-center rounded-[4px] bg-[#DAD9D4]">
          <span className="text-[6px] font-bold text-white">신청하기</span>
        </div>
      </>
    );
  }
  if (id === "carousel-playbook") {
    return (
      <>
        <div className="h-[5px] w-3/5 rounded-sm bg-[#C9C9C4]" />
        <div className="mt-1.5 flex flex-1 flex-col justify-center gap-1.5">
          <div className="flex flex-1 items-center gap-1.5 rounded-[4px] border border-[#E4E4E0] bg-white px-1.5">
            <span className="text-[8px] text-[#8A8A84]">✓</span>
            <span className="h-[3px] flex-1 rounded-sm bg-[#DEDEDA]" />
          </div>
          <div className="flex flex-1 items-center gap-1.5 rounded-[4px] border border-[#E4E4E0] bg-[#F3F3F0] px-1.5">
            <span className="text-[8px] text-[#8A8A84]">✗</span>
            <span className="h-[3px] flex-1 rounded-sm bg-[#DEDEDA]" />
          </div>
        </div>
      </>
    );
  }
  // 제안서: 불릿 논리 전개 + 근거 차트
  if (id === "proposal") {
    return (
      <>
        <div className="h-[5px] w-2/5 rounded-sm bg-[#C9C9C4]" />
        <div className="mt-1 flex flex-1 gap-1.5">
          <div className="flex flex-1 flex-col justify-center gap-1">
            <div className="h-[3px] w-full rounded-sm bg-[#DEDEDA]" />
            <div className="h-[3px] w-4/5 rounded-sm bg-[#DEDEDA]" />
            <div className="h-[3px] w-[90%] rounded-sm bg-[#DEDEDA]" />
            <div className="h-[3px] w-3/5 rounded-sm bg-[#DEDEDA]" />
          </div>
          <div className="flex flex-1 items-end justify-center gap-[3px] rounded-[4px] border border-dashed border-[#C9C9C4] bg-[#F3F3F0] px-2 pt-2 pb-1.5">
            <div className="w-1.5 rounded-t-[2px] bg-[#C9C9C4]" style={{ height: "40%" }} />
            <div className="w-1.5 rounded-t-[2px] bg-[#B4B4AE]" style={{ height: "70%" }} />
            <div className="w-1.5 rounded-t-[2px] bg-[#C9C9C4]" style={{ height: "55%" }} />
            <div className="w-1.5 rounded-t-[2px] bg-[#8A8A84]" style={{ height: "95%" }} />
          </div>
        </div>
      </>
    );
  }
  // 피치덱: 지표 카드 3장 + 진행 바 (트랙션/BM)
  if (id === "pitch") {
    return (
      <>
        <div className="h-[5px] w-1/2 rounded-sm bg-[#C9C9C4]" />
        <div className="mt-1.5 flex gap-1.5">
          {[
            ["65%", "Growth"],
            ["2.4x", "ROI"],
            ["12M", "ARR"],
          ].map(([v, l]) => (
            <div
              key={l}
              className="flex-1 rounded-[4px] border border-[#E4E4E0] bg-white px-1 py-1 text-center"
            >
              <div className="text-[9px] leading-none font-bold text-[#6B6B66]">{v}</div>
              <div className="mt-0.5 text-[5.5px] leading-none text-[#B4B4AE]">{l}</div>
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-1">
          <div className="h-[5px] flex-[1.4] rounded-full bg-[#8A8A84]" />
          <div className="h-[5px] flex-1 rounded-full bg-[#DEDEDA]" />
        </div>
      </>
    );
  }
  // 제품 소개: 데모 이미지 중심 (키노트형)
  if (id === "product") {
    return (
      <>
        <div className="h-[5px] w-2/5 rounded-sm bg-[#C9C9C4]" />
        <div className="mt-1 flex flex-1 items-center justify-center rounded-[4px] border border-dashed border-[#C9C9C4] bg-[#F3F3F0]">
          <div className="flex h-[58%] w-[40%] items-center justify-center rounded-md bg-[#DAD9D4]">
            <div className="h-1/2 w-1/2 rounded-[4px] bg-[#C4C3BD]" />
          </div>
        </div>
      </>
    );
  }
  // 빈 스토리보드: 최소 골격 + 비어 있는 캔버스
  return (
    <>
      <div className="h-[5px] w-2/5 rounded-sm bg-[#C9C9C4]" />
      <div className="mt-1 h-[3px] w-3/5 rounded-sm bg-[#DEDEDA]" />
      <div className="h-[3px] w-2/5 rounded-sm bg-[#DEDEDA]" />
      <div className="mt-1 flex flex-1 items-center justify-center rounded-[4px] border border-dashed border-[#DEDEDA]">
        <span className="text-[11px] leading-none text-[#C9C9C4]">+</span>
      </div>
    </>
  );
}

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
  const [aspect, setAspect] = useState<DeckAspect>("16:9");
  const [query, setQuery] = useState("");
  const [deckFilter, setDeckFilter] = useState<"all" | "recent" | "shared">("all");
  const [deckView, setDeckView] = useState<"grid" | "list">("grid");
  const [decks, setDecks] = useState<DeckSummary[]>(() => listDecks());
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportedPptx | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const theme = getTheme(themeId);
  const isCarousel = aspect === "4:5";
  const chips = isCarousel ? SUGGESTIONS_CAROUSEL : SUGGESTIONS;

  // 관리자 템플릿 설정(§14) 반영 — 노출/순서/이름. 서버 응답 없으면 기본 라이브러리 그대로
  const [tplMeta, setTplMeta] = useState<{ id: string; name: string; on: boolean }[]>([]);
  useEffect(() => {
    void fetch(apiUrl("/api/templates"))
      .then((r) => r.json())
      .then((j: { templates?: { id: string; name: string; on: boolean }[] }) =>
        setTplMeta(j.templates ?? []),
      )
      .catch(() => {});
  }, []);
  const baseLibs = isCarousel ? CAROUSEL_LIBRARIES : WIREFRAME_LIBRARIES;
  const libs =
    tplMeta.length === 0
      ? baseLibs
      : tplMeta
          .filter((m) => m.on)
          .map((m) => {
            const lib = baseLibs.find((l) => l.id === m.id);
            return lib ? { ...lib, name: m.name || lib.name } : null;
          })
          .filter((l): l is (typeof baseLibs)[number] => l !== null)
          .concat(baseLibs.filter((l) => !tplMeta.some((m) => m.id === l.id)));

  const create = () => {
    if (!prompt.trim()) return;
    const deckId = uid();
    begin({ deckId, prompt: prompt.trim(), slideCount, themeId, aspect });
    navigate(`/deck/${deckId}/outline`);
  };

  // ── PPTX 가져오기 (Import = 그대로 편집 / Reference = 아웃라인 재구성) ──
  const onPickFile = async (f: File | null | undefined) => {
    if (!f) return;
    setImporting(true);
    try {
      setImported(await parsePptx(f));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "PPTX를 읽지 못했어요");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const importAsDeck = () => {
    if (!imported) return;
    saveDeck(imported.deck);
    useDeckStore.getState().setDeck(imported.deck);
    clearHistory();
    setImported(null);
    navigate(`/deck/${imported.deck.id}/edit`);
    showToast(
      `'${imported.deck.title}' ${imported.slideCount}장 가져왔어요 — 필요한 부분만 고치세요`,
    );
  };

  const importAsReference = () => {
    if (!imported) return;
    const deckId = uid();
    begin({
      deckId,
      prompt: `"${imported.fileName}" 내용을 참고해 새로 구성`,
      slideCount: imported.outline.length,
      themeId,
      aspect: imported.deck.aspect,
      slides: imported.outline,
      status: "done",
    });
    setImported(null);
    navigate(`/deck/${deckId}/outline`);
    showToast("추출한 아웃라인을 확인·수정한 뒤 슬라이드를 생성하세요");
  };

  const removeDeck = (d: DeckSummary) => {
    if (!window.confirm(`'${d.title}' 덱을 삭제할까요? 되돌릴 수 없어요.`)) return;
    deleteDeck(d.id);
    setDecks(listDecks());
    showToast(`'${d.title}' 삭제됨`);
  };

  const q = query.trim().toLowerCase();
  const RECENT_MS = 72 * 3600 * 1000;
  const filtered = decks.filter(
    (d) =>
      (!q || d.title.toLowerCase().includes(q)) &&
      (deckFilter === "all" ||
        (deckFilter === "recent" && Date.now() - d.updatedAt < RECENT_MS) ||
        (deckFilter === "shared" && !!getShareTokens(d.id))),
  );

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
          {/* PPTX 첨부 칩 + Import/Reference 인라인 (스냅덱 배치) */}
          {imported && (
            <div className="mb-3">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-app-border bg-app-bg px-2 py-1 text-[11.5px] font-medium">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-[#D14423]" />
                <span className="max-w-48 truncate">{imported.fileName}</span>
                <button
                  onClick={() => setImported(null)}
                  className="text-app-faint hover:text-app-text"
                >
                  ✕
                </button>
              </span>
              <div className="mt-2 flex items-center gap-3 rounded-[10px] border border-app-border px-3 py-2.5">
                <span className="h-6 w-6 shrink-0 rounded-md bg-[#FBE9E4] text-center text-[13px] leading-6">
                  🟥
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold">
                    Import PPTX?{" "}
                    <span className="font-normal text-app-faint">as editable deck</span>
                  </p>
                  <p className="truncate text-[11px] text-app-faint">
                    {imported.fileName} · {imported.slideCount}장
                    {imported.skipped > 0 ? ` · 차트/표 ${imported.skipped}개 제외` : ""}
                  </p>
                </div>
                <button
                  onClick={importAsReference}
                  title="내용을 아웃라인으로 추출해 새로 구성"
                  className="shrink-0 text-[12.5px] font-medium text-app-muted hover:text-app-accent"
                >
                  Reference
                </button>
                <button
                  onClick={importAsDeck}
                  title="양식 그대로 열어서 편집"
                  className="shrink-0 rounded-lg bg-app-text px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-85"
                >
                  ⬆ Import
                </button>
              </div>
            </div>
          )}
          {/* 비율 토글 — 카드 상단 (스냅덱 배치) */}
          <div className="mb-2.5 flex items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-app-border">
              {(
                [
                  ["16:9", "▭ 16:9"],
                  ["4:5", "▯ 4:5"],
                ] as const
              ).map(([a, label], i) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={`px-3 py-1 text-[12px] font-semibold ${
                    i === 1 ? "border-l border-app-border" : ""
                  } ${aspect === a ? "bg-app-text text-white" : "bg-white text-app-faint hover:bg-app-bg"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11.5px] text-app-faint">
              {isCarousel ? "카드뉴스 캐러셀" : "발표자료"}
            </span>
          </div>
          {/* 시도해보기 + Tab 적용 */}
          {!prompt && (
            <p className="mb-1 text-[12.5px] text-app-faint">
              시도해보기: <span className="text-app-muted">{chips[0].prompt}</span>
              <span className="mx-1.5 rounded border border-app-border bg-app-bg px-1.5 py-0.5 font-mono text-[10.5px]">
                Tab
              </span>
              키를 눌러 적용하세요.
            </p>
          )}
          <textarea
            ref={promptRef}
            className="h-20 w-full resize-none text-[15px] leading-relaxed focus:outline-none"
            placeholder="주제와 핵심 포인트를 입력하세요…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !prompt) {
                e.preventDefault();
                setPrompt(chips[0].prompt);
                setThemeId(chips[0].themeId);
                setSlideCount(chips[0].count);
              }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) create();
            }}
          />
          {/* 하단 컨트롤 바 — 모델 · 장수 · 테마 · 첨부 · 전송 (스냅덱 배치) */}
          <div className="flex items-center gap-2 border-t border-app-border-soft pt-3">
            <span
              title="현재 텍스트 모델 (환경변수 ANTHROPIC_MODEL로 변경)"
              className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-text px-3 py-1.5 text-[12px] font-semibold text-white"
            >
              ✦ Claude Sonnet 4.6
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setSlideCount((n) => Math.max(MIN_SLIDES, n - 1))}
                className="rounded-md px-2 py-1 text-[13px] text-app-faint hover:bg-app-bg"
              >
                −
              </button>
              <span className="min-w-5 text-center text-[13px] font-semibold">
                {slideCount}
              </span>
              <button
                onClick={() => setSlideCount((n) => Math.min(MAX_SLIDES, n + 1))}
                className="rounded-md px-2 py-1 text-[13px] text-app-faint hover:bg-app-bg"
              >
                +
              </button>
            </div>
            <Dropdown
              items={Object.values(themes).map((t) => ({
                key: t.id,
                name: t.name,
                swatch: t.accent,
              }))}
              activeKey={themeId}
              onSelect={setThemeId}
              triggerClassName="flex items-center gap-1.5 rounded-full border border-app-border bg-white px-3 py-1.5 hover:border-app-accent data-open:border-app-accent"
            >
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ background: theme.accent }}
              />
              <span className="text-[12px] font-medium">{theme.name}</span>
              <span className="text-[9px] text-app-faint">▾</span>
            </Dropdown>
            <span className="flex-1" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              title="PPTX 첨부"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-app-border bg-white text-app-muted hover:border-app-accent hover:text-app-accent disabled:opacity-50"
            >
              {importing ? (
                <span className="animate-dg-pulse text-[11px]">…</span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              )}
            </button>
            <button
              onClick={create}
              disabled={!prompt.trim()}
              title="아웃라인 생성 (Ctrl+Enter)"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-app-accent text-[15px] text-white shadow-[0_2px_8px_rgba(109,74,255,.3)] hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
            >
              ↵
            </button>
          </div>
        </div>
        {/* 제안 칩 (비율별) */}
        <div className="mt-3.5 flex flex-wrap justify-center gap-2">
          {chips.map((s) => (
            <button
              key={s.label}
              onClick={() => {
                setPrompt(s.prompt);
                setThemeId(s.themeId);
                setSlideCount(s.count);
                promptRef.current?.focus();
                showToast(`'${s.label}' 예시 적용 — 내용을 다듬고 생성하세요`);
              }}
              className="rounded-full border border-app-border bg-app-surface px-3.5 py-1.5 text-[12px] text-app-muted transition-colors hover:border-app-accent hover:text-app-accent"
            >
              {s.label}
            </button>
          ))}
        </div>
        {/* 모드 버튼 행 (스냅덱 배치) — Import PPTX만 활성, 나머지 2차 */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pptx,.ppt"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
          {[
            { key: "research", label: "🔍 Web Research", soon: true },
            { key: "scrap", label: "🌐 Web Scrap", soon: true },
            { key: "pptx", label: "🟥 Import PPTX", soon: false },
            { key: "agent", label: "🤖 Auto Agent", soon: true },
          ].map((m) => (
            <button
              key={m.key}
              disabled={m.soon || importing}
              title={m.soon ? "2차 로드맵 — 준비 중" : "기존 PowerPoint를 열어 이어서 고치거나 참고자료로 재구성"}
              onClick={() => {
                if (!m.soon) fileRef.current?.click();
              }}
              className={`rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors ${
                m.soon
                  ? "cursor-not-allowed border-app-border bg-app-bg text-app-faint opacity-60"
                  : "border-[#C9C9C4] bg-app-surface hover:border-app-accent hover:text-app-accent"
              }`}
            >
              {m.label}
              {m.soon && (
                <span className="ml-1.5 rounded bg-app-border-soft px-1 py-0.5 text-[9.5px] text-app-faint">
                  2차
                </span>
              )}
            </button>
          ))}
        </div>
      </div>


      {/* 스토리보드 템플릿 (§13) — 완성 장표가 아니라 팀이 함께 채우는 와이어프레임 */}
      <div className="mx-auto w-[880px] max-w-[92vw] pb-12">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="text-[16px] font-semibold">
            {isCarousel ? "캐러셀 스타일로 시작" : "스토리보드로 시작"}
          </h2>
          <span className="text-[12px] text-app-faint">
            {isCarousel
              ? "피드에서 멈추고 · 넘기고 · 저장되는 4:5 골격"
              : "와이어프레임 골격을 만들고, 공유해서 팀이 함께 채워요"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          {libs.map((lib) => (
            <button
              key={lib.id}
              onClick={() => {
                const deck = createStoryboardDeck(lib.id, themeId);
                if (!deck) return;
                saveDeck(deck);
                useDeckStore.getState().setDeck(deck);
                clearHistory();
                // 관리자 템플릿 사용 횟수 집계 (fire-and-forget)
                void fetch(apiUrl(`/api/templates/${lib.id}/use`), { method: "POST" }).catch(() => {});
                navigate(`/deck/${deck.id}/edit`);
                showToast(`'${lib.name}' ${lib.frames.length}프레임 생성 — 자리를 채우고 공유하세요`);
              }}
              className="group rounded-xl border border-app-border bg-app-surface p-3 text-left shadow-[0_1px_4px_rgba(0,0,0,.04)] transition-all hover:border-app-accent hover:shadow-[0_4px_14px_rgba(109,74,255,.15)]"
            >
              {/* 와이어프레임 미니 프리뷰 — 호버 시 뒤 슬라이드 레이어들이 라벨 위로 스르륵 펼쳐짐 */}
              <div
                className={`relative ${
                  lib.aspect === "4:5" ? "mx-auto aspect-[4/5] w-3/4" : "aspect-[16/10]"
                }`}
              >
                <div className="pointer-events-none absolute inset-x-4 inset-y-0 rounded-lg border border-app-border bg-white shadow-[0_3px_8px_rgba(0,0,0,.08)] transition-transform duration-300 ease-out group-hover:translate-y-[42px] group-hover:scale-x-[.82] group-hover:scale-y-[.96] delay-150" />
                <div className="pointer-events-none absolute inset-x-2.5 inset-y-0 rounded-lg border border-app-border bg-white shadow-[0_3px_8px_rgba(0,0,0,.08)] transition-transform duration-300 ease-out group-hover:translate-y-[28px] group-hover:scale-x-[.88] group-hover:scale-y-[.98] delay-75" />
                <div className="pointer-events-none absolute inset-x-1 inset-y-0 rounded-lg border border-app-border bg-white shadow-[0_3px_8px_rgba(0,0,0,.08)] transition-transform duration-300 ease-out group-hover:translate-y-[14px] group-hover:scale-x-[.94]" />
                <div className="absolute inset-0 z-10 flex flex-col rounded-lg border border-app-border-soft bg-[#FBFBFA] p-3 shadow-[0_1px_3px_rgba(0,0,0,.05)] transition-transform duration-300 ease-out group-hover:-translate-y-1">
                  <PreviewArt id={lib.id} />
                </div>
              </div>
              {/* 라벨은 시트 아래로 — 펼쳐질 때 가려지고, 남는 부분은 페이드아웃 */}
              <p className="mt-2.5 text-[12.5px] font-semibold transition-opacity duration-200 group-hover:opacity-0">
                {lib.name}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-app-faint transition-opacity duration-200 group-hover:opacity-0">
                {lib.frames.length}프레임 · {lib.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 내 덱 */}
      <div className="mx-auto w-[880px] max-w-[92vw] pb-16">
        {/* 대시보드 (스냅덱 배치) */}
        <div className="mb-1">
          <h2 className="text-[22px] font-bold tracking-tight">대시보드</h2>
          <p className="mt-0.5 text-[12.5px] text-app-muted">
            슬라이드 파일을 열고 정렬하고 관리하세요.
          </p>
        </div>
        <div className="mb-3.5 flex items-center gap-2 pt-2">
          {(
            [
              ["all", "전체"],
              ["recent", "최근"],
              ["shared", "공유됨"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDeckFilter(key)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                deckFilter === key
                  ? "bg-app-text text-white"
                  : "border border-app-border bg-app-surface text-app-muted hover:bg-app-bg"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex min-w-0 items-center gap-2 rounded-[9px] border border-app-border bg-app-surface px-3 py-2">
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
              placeholder="파일 검색"
              className="w-40 min-w-0 bg-transparent text-[12.5px] focus:outline-none"
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
          <div className="flex overflow-hidden rounded-[9px] border border-app-border">
            {(
              [
                ["grid", "⊞", "그리드 보기"],
                ["list", "≡", "리스트 보기"],
              ] as const
            ).map(([key, glyph, title], i) => (
              <button
                key={key}
                title={title}
                onClick={() => setDeckView(key)}
                className={`px-2.5 py-1.5 text-[13px] ${i === 1 ? "border-l border-app-border" : ""} ${
                  deckView === key ? "bg-app-text text-white" : "bg-white text-app-faint hover:bg-app-bg"
                }`}
              >
                {glyph}
              </button>
            ))}
          </div>
        </div>

        {deckView === "grid" ? (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
            {filtered.map((d) => (
              <DeckCard key={d.id} deck={d} onDelete={() => removeDeck(d)} />
            ))}
            {!q && deckFilter === "all" && (
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
        ) : (
          <div className="overflow-hidden rounded-xl border border-app-border bg-app-surface">
            <div className="flex items-center gap-3 border-b border-app-border-soft px-4 py-2.5 text-[11.5px] font-semibold text-app-faint">
              <span className="flex-1">이름</span>
              <span className="w-16 text-center">슬라이드</span>
              <span className="w-20 text-center">업데이트</span>
              <span className="w-8" />
            </div>
            {filtered.map((d) => {
              const th = getTheme(d.themeId);
              return (
                <div
                  key={d.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-app-border-soft px-4 py-2.5 last:border-b-0 hover:bg-app-bg"
                  onClick={() => navigate(`/deck/${d.id}/edit`)}
                >
                  <div
                    className="h-10 w-[62px] shrink-0 overflow-hidden rounded-md border border-app-border"
                    style={{ background: th.bg }}
                  >
                    {d.thumbnail && (
                      <img src={d.thumbnail} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                    {d.title}
                  </span>
                  <span className="w-16 text-center text-[12.5px] text-app-muted">
                    {d.slideCount}장
                  </span>
                  <span className="w-20 text-center text-[12px] text-app-faint">
                    {relTime(d.updatedAt)}
                  </span>
                  <span className="w-8" onClick={(e) => e.stopPropagation()}>
                    <Dropdown
                      items={[
                        { key: "open", name: "열기" },
                        { key: "delete", name: "삭제" },
                      ]}
                      onSelect={(key) => {
                        if (key === "open") navigate(`/deck/${d.id}/edit`);
                        else removeDeck(d);
                      }}
                      align="right"
                      triggerClassName="rounded-md px-2 py-1 text-[13px] text-app-faint hover:bg-app-border-soft"
                    >
                      ···
                    </Dropdown>
                  </span>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-4 py-8 text-center text-[12.5px] text-app-faint">
                해당하는 덱이 없어요.
              </p>
            )}
          </div>
        )}

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
