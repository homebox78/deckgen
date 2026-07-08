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
import { StoryboardGallery } from "./StoryboardGallery";
import {
  addFolder,
  deckFolderMap,
  emptyTrash as emptyTrashStore,
  listFavs,
  listFolders,
  listTrash,
  purgeDeck,
  removeFolder,
  restoreDeck,
  setDeckFolder,
  toggleFav as toggleFavStore,
  trashDeck,
  type Folder,
  type TrashedDeck,
} from "../../store/deckMeta";
import { useGenerationStore } from "../../store/generationStore";
import { useOutlineStore } from "../../store/outlineStore";
import type { DeckSummary } from "../../store/storage";
import { listDecks, loadDeck, saveDeck } from "../../store/storage";
import { getSettings } from "../../store/settingsStore";
import { removeSavedTemplate, useSavedTemplates } from "../../store/savedTemplateStore";
import { Dropdown } from "../ui/Dropdown";
import { Logo } from "../ui/Logo";
import { StatusBadge } from "../ui/StatusBadge";
import { showToast } from "../ui/toast";
import { OnboardingWizard } from "./OnboardingWizard";
import { SettingsModal } from "./SettingsModal";

const MIN_SLIDES = 3;
const MAX_SLIDES = 12;

// 생성 모델 (프로토타입 — 자동 + 5종, 유료는 Plus 배지)
const GEN_MODELS: { key: string; name: string; icon: string; plus?: boolean }[] = [
  { key: "auto", name: "자동", icon: "tune" },
  { key: "deckgen-1.1", name: "DeckGen 1.1", icon: "bolt" },
  { key: "deckgen-1.0-pro", name: "DeckGen 1.0 Pro", icon: "bolt", plus: true },
  { key: "claude-fable-5", name: "Claude Fable 5", icon: "psychology", plus: true },
  { key: "gemini-3.1-pro", name: "Gemini 3.1 Pro", icon: "auto_awesome", plus: true },
  { key: "gpt-5.5", name: "GPT-5.5", icon: "smart_toy", plus: true },
];

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
            <span className="mi text-[11px] text-[#8A8A84]">check</span>
            <span className="h-[3px] flex-1 rounded-sm bg-[#DEDEDA]" />
          </div>
          <div className="flex flex-1 items-center gap-1.5 rounded-[4px] border border-[#E4E4E0] bg-[#F3F3F0] px-1.5">
            <span className="mi text-[11px] text-[#8A8A84]">close</span>
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

function DeckCard({
  deck,
  onDelete,
  fav,
  onToggleFav,
  folders,
  onMoveFolder,
  onDragStart,
  onDragEnd,
  onContext,
}: {
  deck: DeckSummary;
  onDelete: () => void;
  fav: boolean;
  onToggleFav: () => void;
  folders: Folder[];
  onMoveFolder: (folderId: string | null) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onContext: (x: number, y: number) => void;
}) {
  const theme = getTheme(deck.themeId);
  const gen = useGenerationStore();
  const generating = gen.deckId === deck.id && gen.active;
  const [folderMenu, setFolderMenu] = useState(false);

  return (
    <Link
      to={`/deck/${deck.id}/edit`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        onContext(e.clientX, e.clientY);
      }}
      className="group relative overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-[0_1px_4px_rgba(0,0,0,.04)] transition-all hover:border-app-accent hover:shadow-[0_4px_14px_rgba(26,26,26,.15)]"
    >
      {/* 즐겨찾기 별 */}
      <button
        title={fav ? "즐겨찾기 해제" : "즐겨찾기"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFav();
        }}
        className={`absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md text-[13px] shadow-sm transition-opacity ${
          fav
            ? "bg-white/95 text-app-accent opacity-100"
            : "bg-white/90 text-app-faint opacity-0 group-hover:opacity-100 hover:text-app-accent"
        }`}
      >
        <span className="mi text-[15px]">{fav ? "star" : "star_border"}</span>
      </button>
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
            {deck.slideCount}장 · {relTime(deck.updatedAt)}
          </p>
        </div>
        {generating && (
          <StatusBadge status="generating" size="sm">
            생성 중
          </StatusBadge>
        )}
        {/* 폴더로 이동 */}
        <span className="relative shrink-0">
          <button
            title="폴더로 이동"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setFolderMenu((v) => !v);
            }}
            className="flex items-center rounded-[7px] border border-app-border bg-white px-1.5 py-1 text-app-faint opacity-0 transition-opacity group-hover:opacity-100 hover:border-app-accent"
          >
            <span className="mi text-[15px]">drive_file_move</span>
          </button>
          {folderMenu && (
            <>
              <span
                className="fixed inset-0 z-20"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFolderMenu(false);
                }}
              />
              <span className="absolute right-0 bottom-full z-30 mb-1 block w-40 rounded-lg border border-app-border bg-white py-1 shadow-lg">
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMoveFolder(null);
                    setFolderMenu(false);
                  }}
                  className="block cursor-pointer px-3 py-1.5 text-[12px] hover:bg-app-bg"
                >
                  <span className="mi align-middle text-[14px] mr-1">description</span>미분류
                </span>
                {folders.map((f) => (
                  <span
                    key={f.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onMoveFolder(f.id);
                      setFolderMenu(false);
                    }}
                    className="block cursor-pointer truncate px-3 py-1.5 text-[12px] hover:bg-app-bg"
                  >
                    <span className="mi align-middle text-[14px] mr-1">folder</span>{f.name}
                  </span>
                ))}
                {folders.length === 0 && (
                  <span className="block px-3 py-1.5 text-[11.5px] text-app-faint">
                    폴더 없음
                  </span>
                )}
              </span>
            </>
          )}
        </span>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggedOut, setLoggedOut] = useState(() => localStorage.getItem("deckgen:loggedOut") === "1");
  const [webResearch, setWebResearch] = useState(false);
  const [scrapOpen, setScrapOpen] = useState(false);
  const [scrapUrls, setScrapUrls] = useState<string[]>([]);
  const [scrapDraft, setScrapDraft] = useState("");
  const [zoomLib, setZoomLib] = useState<string | null>(null);
  // 첫 실행 시 온보딩 노출
  const [onboarding, setOnboarding] = useState(() => !getSettings().onboardingDone);
  const [query, setQuery] = useState("");
  const [deckFilter, setDeckFilter] = useState<"all" | "fav" | "done" | "generating">("all");
  const [deckView, setDeckView] = useState<"grid" | "list">("grid");
  const [decks, setDecks] = useState<DeckSummary[]>(() => listDecks());
  // 폴더 · 즐겨찾기 · 휴지통
  const [folders, setFolders] = useState<Folder[]>(() => listFolders());
  const [folderSel, setFolderSel] = useState<string>("all"); // all | uncat | <folderId> | trash
  const [folderMap, setFolderMap] = useState<Record<string, string>>(() => deckFolderMap());
  const [favs, setFavs] = useState<string[]>(() => listFavs());
  const [trash, setTrash] = useState<TrashedDeck[]>(() => listTrash());
  const [dragDeckId, setDragDeckId] = useState<string | null>(null);
  const [deckCtx, setDeckCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const [genModel, setGenModel] = useState("deckgen-1.1");
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const savedTemplates = useSavedTemplates();

  const refreshMeta = () => {
    setFolders(listFolders());
    setFolderMap(deckFolderMap());
    setFavs(listFavs());
    setTrash(listTrash());
  };
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportedPptx | null>(null);
  const [pptxModal, setPptxModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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
    // 웹 리서치·스크랩 URL을 생성 컨텍스트로 프롬프트에 첨부
    let fullPrompt = prompt.trim();
    if (webResearch) fullPrompt += "\n\n[웹 리서치를 반영해 최신 근거·수치를 포함해줘]";
    if (scrapUrls.length > 0) fullPrompt += `\n\n[참고 URL]\n${scrapUrls.join("\n")}`;
    begin({ deckId, prompt: fullPrompt, slideCount, themeId, aspect });
    // 스타일·테마·변형을 고르는 Setup 단계로 (Demo Act 3)
    navigate(`/deck/${deckId}/setup`);
  };

  // ── PPTX 가져오기 (Import = 그대로 편집 / Reference = 아웃라인 재구성) ──
  const onPickFile = async (f: File | null | undefined) => {
    if (!f) return;
    setImporting(true);
    try {
      setImported(await parsePptx(f));
      setPptxModal(false);
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

  // 삭제 = 휴지통으로 이동(복원 가능)
  const removeDeck = (d: DeckSummary) => {
    trashDeck(d);
    setDecks(listDecks());
    refreshMeta();
    showToast(`'${d.title}' 휴지통으로 이동`);
  };
  const toggleFav = (id: string) => {
    toggleFavStore(id);
    setFavs(listFavs());
  };
  const moveDeckToFolder = (deckId: string, folderId: string | null) => {
    setDeckFolder(deckId, folderId);
    setFolderMap(deckFolderMap());
    const fname = folderId ? folders.find((f) => f.id === folderId)?.name : "미분류";
    showToast(`'${fname}'(으)로 이동`);
  };
  const createFolder = () => {
    const name = window.prompt("새 폴더 이름", "새 폴더");
    if (name === null) return;
    const f = addFolder(name);
    setFolders(listFolders());
    setFolderSel(f.id);
  };
  const deleteFolder = (id: string) => {
    removeFolder(id);
    refreshMeta();
    if (folderSel === id) setFolderSel("all");
  };
  const renameDeck = (id: string) => {
    const d = decks.find((x) => x.id === id);
    const next = window.prompt("덱 이름", d?.title ?? "");
    if (next === null || !next.trim()) return;
    const deck = loadDeck(id);
    if (!deck) return;
    saveDeck({ ...deck, title: next.trim(), updatedAt: Date.now() });
    setDecks(listDecks());
    showToast("이름을 바꿨어요");
  };
  const duplicateDeck = (id: string) => {
    const deck = loadDeck(id);
    if (!deck) return;
    const now = Date.now();
    const copy = { ...deck, id: uid(), title: `${deck.title} 사본`, createdAt: now, updatedAt: now };
    saveDeck(copy);
    setDecks(listDecks());
    showToast("덱을 복제했어요");
  };

  const q = query.trim().toLowerCase();
  const inTrash = folderSel === "trash";
  const filtered = decks
    .filter((d) => {
      if (q && !d.title.toLowerCase().includes(q)) return false;
      // 폴더 칩
      if (folderSel === "uncat" && folderMap[d.id]) return false;
      if (folderSel !== "all" && folderSel !== "uncat" && folderSel !== "trash" && folderMap[d.id] !== folderSel)
        return false;
      // 상단 필터 탭
      if (deckFilter === "fav" && !favs.includes(d.id)) return false;
      if (deckFilter === "done" && d.slideCount <= 0) return false;
      if (deckFilter === "generating") return false; // 저장된 덱은 모두 완료 상태
      return true;
    })
    .sort((a, b) => {
      // 즐겨찾기 상단 정렬
      const fa = favs.includes(a.id) ? 1 : 0;
      const fb = favs.includes(b.id) ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return b.updatedAt - a.updatedAt;
    });
  const trashFiltered = trash.filter((t) => !q || t.title.toLowerCase().includes(q));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 상단 바 */}
      <header className="flex shrink-0 items-center justify-between border-b border-app-border bg-app-surface px-7 py-3.5">
        <div className="flex items-center gap-2.5">
          <Logo size={22} />
          <span className="text-[15px] font-bold tracking-tight">DeckGen</span>
          <span className="rounded-[5px] bg-app-border-soft px-1.5 py-0.5 text-[10px] font-bold text-app-faint">
            Prototype
          </span>
          <span className="mx-1 h-4 w-px bg-app-border" />
          {/* 워크스페이스 전환 */}
          <span className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setWsMenuOpen((v) => !v);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-2.5 py-1.5 text-[12.5px] font-semibold hover:border-app-accent"
            >
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] text-[10px] font-bold text-white" style={{ background: "#1A1A1A" }}>W</span>
              우진의 팀
              <span className="mi text-[15px] text-app-faint">unfold_more</span>
            </button>
            {wsMenuOpen && (
              <>
                <span className="fixed inset-0 z-40" onClick={() => setWsMenuOpen(false)} />
                <div className="absolute top-[38px] left-0 z-50 w-[250px] rounded-xl border border-app-border bg-white p-1.5 shadow-[0_14px_40px_rgba(0,0,0,.14)]">
                  <div className="px-2.5 py-1 text-[10px] font-bold tracking-wide text-app-faint uppercase">워크스페이스 전환</div>
                  {[
                    { id: "team", name: "우진의 팀", meta: "멤버 6명 · Team", initial: "W", color: "#1A1A1A", active: true },
                    { id: "personal", name: "개인 워크스페이스", meta: "나만 사용 · Free", initial: "P", color: "#3A6EA5", active: false },
                  ].map((w) => (
                    <button
                      key={w.id}
                      onClick={() => { setWsMenuOpen(false); showToast(`'${w.name}'(으)로 전환했어요`); }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-app-bg"
                      style={{ background: w.active ? "#F7F7F5" : "transparent" }}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[11px] font-bold text-white" style={{ background: w.color }}>{w.initial}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold">{w.name}</span>
                        <span className="block text-[11px] text-app-faint">{w.meta}</span>
                      </span>
                      {w.active && <span className="mi text-[16px]">check</span>}
                    </button>
                  ))}
                  <div className="my-1 border-t border-app-border-soft" />
                  <button onClick={() => { setWsMenuOpen(false); navigate("/workspace"); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-app-bg">
                    <span className="mi text-[16px] text-app-muted">groups</span>팀 워크스페이스 관리
                  </button>
                  <button onClick={() => { setWsMenuOpen(false); showToast("새 워크스페이스 만들기 (시뮬레이션)"); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-app-bg">
                    <span className="mi text-[16px] text-app-muted">add</span>새 워크스페이스
                  </button>
                </div>
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {loggedOut ? (
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-1.5 rounded-lg bg-app-accent px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90"
            >
              <span className="mi text-[15px]">login</span>로그인
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate("/workspace")}
                className="flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:border-app-accent"
              >
                <span className="mi text-[15px]">groups</span>워크스페이스
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-lg border border-app-border bg-white px-3 py-1.5 text-[12.5px] font-semibold hover:border-app-accent"
              >
                설정
              </button>
              {/* 계정 메뉴 — 설정·관리자 콘솔·로그아웃 */}
              <span className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserMenuOpen((v) => !v);
                  }}
                  title="계정"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-app-text text-[12px] font-bold text-white ring-app-accent ring-offset-1 hover:ring-2"
                >
                  우
                </button>
                {userMenuOpen && (
                  <>
                    <span className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute top-[38px] right-0 z-50 w-[236px] rounded-xl border border-app-border bg-white p-1.5 shadow-[0_14px_40px_rgba(0,0,0,.14)]">
                      <div className="flex items-center gap-2.5 px-2.5 py-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-app-text text-[13px] font-bold text-white">우</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-semibold">우진</span>
                          <span className="block truncate text-[11px] text-app-faint">woojin@deckgen.app</span>
                        </span>
                      </div>
                      <div className="my-1 border-t border-app-border-soft" />
                      <button onClick={() => { setUserMenuOpen(false); setSettingsOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-app-bg">
                        <span className="mi text-[16px] text-app-muted">settings</span>설정
                      </button>
                      <button onClick={() => { setUserMenuOpen(false); navigate("/workspace"); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-app-bg">
                        <span className="mi text-[16px] text-app-muted">groups</span>워크스페이스 관리
                      </button>
                      <button onClick={() => { setUserMenuOpen(false); navigate("/admin"); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-app-bg">
                        <span className="mi text-[16px] text-app-muted">admin_panel_settings</span>관리자 콘솔
                      </button>
                      <div className="my-1 border-t border-app-border-soft" />
                      <button
                        onClick={() => {
                          localStorage.setItem("deckgen:loggedOut", "1");
                          setLoggedOut(true);
                          setUserMenuOpen(false);
                          navigate("/login");
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-app-danger hover:bg-app-danger-soft"
                      >
                        <span className="mi text-[16px]">logout</span>로그아웃
                      </button>
                    </div>
                  </>
                )}
              </span>
            </>
          )}
        </div>
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
                ><span className="mi text-[15px]">close</span></button>
              </span>
              <div className="mt-2 flex items-center gap-3 rounded-[10px] border border-app-border px-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-app-border-soft">
                  <span className="mi text-[15px] text-app-muted">slideshow</span>
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
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-app-text px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-85"
                >
                  <span className="mi text-[14px]">upload</span>Import
                </button>
              </div>
            </div>
          )}
          {/* 비율 토글 — 카드 상단 (스냅덱 배치) */}
          <div className="mb-2.5 flex items-center gap-2">
            <div className="flex gap-0.5 rounded-[9px] bg-app-bg p-[3px]">
              {(
                [
                  ["16:9", "crop_16_9"],
                  ["4:3", "crop_landscape"],
                  ["4:5", "crop_portrait"],
                ] as const
              ).map(([a, glyph]) => (
                <button
                  key={a}
                  onClick={() => setAspect(a)}
                  className={`flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[12px] font-semibold ${
                    aspect === a ? "bg-white text-app-text shadow-sm" : "text-app-faint hover:text-app-text"
                  }`}
                >
                  <span className="mi text-[14px]">{glyph}</span>
                  {a}
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
          {/* 하단 컨트롤 바 — 장수 · 모델 · 테마 · 생성 (프로토타입 배치) */}
          <div className="flex items-center gap-2 border-t border-app-border-soft pt-3">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setSlideCount((n) => Math.max(MIN_SLIDES, n - 1))}
                className="rounded-md px-2 py-1 text-[13px] text-app-faint hover:bg-app-bg"
              ><span className="mi text-[16px]">remove</span></button>
              <span className="min-w-8 text-center text-[13px] font-semibold">
                {slideCount}장
              </span>
              <button
                onClick={() => setSlideCount((n) => Math.min(MAX_SLIDES, n + 1))}
                className="rounded-md px-2 py-1 text-app-faint hover:bg-app-bg"
              >
                <span className="mi text-[16px]">add</span>
              </button>
            </div>
            <Dropdown
              items={GEN_MODELS.map((m) => ({
                key: m.key,
                name: m.name,
                icon: <span className="mi text-[15px]">{m.icon}</span>,
                badge: m.plus ? "Plus" : undefined,
              }))}
              activeKey={genModel}
              onSelect={setGenModel}
              triggerClassName="inline-flex items-center gap-1.5 rounded-[9px] border border-app-border bg-white px-2.5 py-1.5 text-app-text hover:border-app-accent data-open:border-app-accent"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-[4px] bg-app-text text-[10px] font-bold text-white">D</span>
              <span className="text-[12px] font-semibold">
                {GEN_MODELS.find((m) => m.key === genModel)?.name ?? "DeckGen 1.1"}
              </span>
              <span className="mi text-[14px] text-app-faint">expand_more</span>
            </Dropdown>
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
              <span className="mi text-[15px] text-app-faint">expand_more</span>
            </Dropdown>
            <span className="flex-1" />
            <button
              onClick={create}
              disabled={!prompt.trim()}
              title="아웃라인 생성 (Ctrl+Enter)"
              className="flex h-9 items-center gap-1.5 rounded-[10px] bg-app-accent px-5 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(26,26,26,.3)] hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
            >
              <span className="mi text-[15px]">auto_awesome</span>
              아웃라인 생성
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
            { key: "research", label: "Web Research", icon: "search", soon: false },
            { key: "scrap", label: "Web Scrap", icon: "language", soon: false },
            { key: "pptx", label: "PPTX 가져오기", icon: "upload_file", soon: false },
            { key: "agent", label: "Auto Agent", icon: "smart_toy", soon: true },
          ].map((m) => {
            const active = (m.key === "research" && webResearch) || (m.key === "scrap" && scrapUrls.length > 0);
            return (
              <button
                key={m.key}
                disabled={m.soon || importing}
                title={
                  m.soon
                    ? "2차 로드맵 — 준비 중"
                    : m.key === "pptx"
                      ? "기존 PowerPoint를 열어 이어서 고치거나 참고자료로 재구성"
                      : m.key === "research"
                        ? "웹 리서치 컨텍스트를 생성에 포함"
                        : "스크랩할 URL을 붙여넣어 생성 컨텍스트로"
                }
                onClick={() => {
                  if (m.key === "pptx") setPptxModal(true);
                  else if (m.key === "research") setWebResearch((v) => !v);
                  else if (m.key === "scrap") setScrapOpen(true);
                }}
                className={`rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors ${
                  m.soon
                    ? "cursor-not-allowed border-app-border bg-app-bg text-app-faint opacity-60"
                    : active
                      ? "border-app-accent bg-app-accent-soft text-app-accent"
                      : "border-[#C9C9C4] bg-app-surface hover:border-app-accent hover:text-app-accent"
                }`}
              >
                <span className="mi mr-1 align-middle text-[15px]">{m.icon}</span>
                {m.label}
                {m.key === "scrap" && scrapUrls.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-app-accent px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                    {scrapUrls.length}
                  </span>
                )}
                {m.soon && (
                  <span className="ml-1.5 rounded bg-app-border-soft px-1 py-0.5 text-[9.5px] text-app-faint">
                    2차
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>


      {/* 내 템플릿 — 저장한 덱 구성 재사용 */}
      {savedTemplates.length > 0 && (
        <div className="mx-auto w-[880px] max-w-[92vw] pb-6">
          <div className="mb-3.5">
            <h2 className="text-[16px] font-semibold">내 템플릿</h2>
            <span className="text-[12px] text-app-faint">저장한 덱 구성을 다시 사용하세요</span>
          </div>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {savedTemplates.map((t) => {
              const th = getTheme(t.themeId);
              return (
                <div key={t.id} className="group overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-[0_1px_4px_rgba(0,0,0,.04)]">
                  <button
                    onClick={() => {
                      setPrompt(t.prompt);
                      setThemeId(t.themeId);
                      setSlideCount(t.count);
                      promptRef.current?.focus();
                      showToast(`'${t.name}' 템플릿을 적용했어요 — 생성하세요`);
                    }}
                    className="relative block aspect-[16/10] w-full border-b border-app-border-soft text-left"
                    style={{ background: th.bg }}
                  >
                    <span className="absolute top-1.5 right-1.5 rounded-[5px] bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      내 템플릿
                    </span>
                    <div className="flex h-full flex-col justify-center gap-1.5 px-3">
                      <div className="h-[3px] w-[24%]" style={{ background: th.accent }} />
                      <div className="line-clamp-2 text-[11px] font-bold" style={{ color: th.textPrimary }}>
                        {t.coverTitle}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold">{t.name}</p>
                      <p className="truncate text-[10.5px] text-app-faint">{t.meta}</p>
                    </div>
                    <button
                      onClick={() => {
                        removeSavedTemplate(t.id);
                        showToast(`'${t.name}' 템플릿을 삭제했어요`);
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-app-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-app-danger"
                    >
                      <span className="mi text-[15px]">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 캐러셀(4:5) 스타일 — 멀티프레임 캐러셀 라이브러리 (16:9/4:3은 아래 와이어프레임 갤러리) */}
      {isCarousel && (
      <div className="mx-auto w-[880px] max-w-[92vw] pb-12">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="text-[16px] font-semibold">캐러셀 스타일로 시작</h2>
          <span className="text-[12px] text-app-faint">
            피드에서 멈추고 · 넘기고 · 저장되는 4:5 골격
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
              className="group rounded-xl border border-app-border bg-app-surface p-3 text-left shadow-[0_1px_4px_rgba(0,0,0,.04)] transition-all hover:border-app-accent hover:shadow-[0_4px_14px_rgba(26,26,26,.15)]"
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
                {/* ⤢ 확대 (Demo Act 2) */}
                <span
                  role="button"
                  title="크게 보기"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomLib(lib.id);
                  }}
                  className="absolute top-1.5 right-5 z-20 flex h-6 w-6 items-center justify-center rounded-md border border-app-border bg-white/95 text-[12px] text-app-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:border-app-accent hover:text-app-accent"
                >
                  <span className="mi text-[15px]">open_in_full</span>
                </span>
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
      )}

      {/* 스토리보드로 시작 (§13) — 35종 와이어프레임 갤러리 (16:9/4:3) */}
      {!isCarousel && <StoryboardGallery themeId={themeId} aspect={aspect} />}

      {/* 내 덱 */}
      <div className="mx-auto w-[720px] max-w-[92vw] pb-16">
        {/* 내 덱 (프로토타입) */}
        <div className="mb-1">
          <h2 className="text-[22px] font-bold tracking-tight">내 덱</h2>
          <p className="mt-0.5 text-[12.5px] text-app-muted">
            만든 덱을 열고 폴더로 정리하고 관리하세요.
          </p>
        </div>
        {/* 폴더 칩바 — 전체 / 미분류 / 사용자 폴더 / 휴지통 (덱 드래그→드롭 이동) */}
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5 pt-2">
          {(() => {
            const uncatN = decks.filter((d) => !folderMap[d.id]).length;
            const chips: { key: string; label: string; n: number }[] = [
              { key: "all", label: "전체", n: decks.length },
              { key: "uncat", label: "미분류", n: uncatN },
              ...folders.map((f) => ({
                key: f.id,
                label: f.name,
                n: decks.filter((d) => folderMap[d.id] === f.id).length,
              })),
            ];
            return chips.map((c) => {
              const active = folderSel === c.key;
              const droppable = c.key !== "all" && c.key !== "trash";
              return (
                <span
                  key={c.key}
                  onClick={() => setFolderSel(c.key)}
                  onDragOver={(e) => {
                    if (dragDeckId && droppable) e.preventDefault();
                  }}
                  onDrop={() => {
                    if (dragDeckId && droppable)
                      moveDeckToFolder(dragDeckId, c.key === "uncat" ? null : c.key);
                    setDragDeckId(null);
                  }}
                  className={`group/chip inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    active
                      ? "border-app-accent bg-app-accent text-white"
                      : "border-app-border bg-app-surface text-app-muted hover:bg-app-bg"
                  } ${dragDeckId && droppable ? "ring-1 ring-app-accent ring-offset-1" : ""}`}
                >
                  {c.key !== "all" && <span className="mi text-[14px]">{c.key === "uncat" ? "description" : "folder"}</span>}{c.label}
                  <span className={`text-[10.5px] ${active ? "text-white/70" : "text-app-faint"}`}>
                    {c.n}
                  </span>
                  {c.key !== "all" && c.key !== "uncat" && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`'${c.label}' 폴더를 삭제할까요? (덱은 미분류로)`))
                          deleteFolder(c.key);
                      }}
                      className={`ml-0.5 hidden text-[11px] group-hover/chip:inline ${active ? "text-white/80" : "text-app-faint hover:text-app-danger"}`}
                    ><span className="mi text-[15px]">close</span></span>
                  )}
                </span>
              );
            });
          })()}
          <span
            onClick={() => setFolderSel("trash")}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              folderSel === "trash"
                ? "border-app-danger bg-app-danger-soft text-app-danger"
                : "border-app-border bg-app-surface text-app-muted hover:bg-app-bg"
            }`}
          >
            <span className="mi text-[14px] align-middle mr-1">delete</span>휴지통
            {trash.length > 0 && <span className="text-[10.5px] text-app-faint">{trash.length}</span>}
          </span>
          <button
            onClick={createFolder}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-app-border-soft bg-transparent px-3 py-1.5 text-[11.5px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
          >
            + 새 폴더
          </button>
        </div>
        <div className={`mb-3.5 flex items-center gap-2 ${inTrash ? "hidden" : ""}`}>
          {(
            [
              ["all", "전체"],
              ["fav", "즐겨찾기"],
              ["done", "완료"],
              ["generating", "생성 중"],
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
              placeholder="덱 제목 검색"
              className="w-40 min-w-0 bg-transparent text-[12.5px] focus:outline-none"
            />
            {q && (
              <button
                onClick={() => setQuery("")}
                className="text-[11px] text-app-faint hover:text-app-text"
              ><span className="mi text-[15px]">close</span></button>
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

        {inTrash ? (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex-1 text-[12px] text-app-faint">
                휴지통의 덱은 30일 후 영구 삭제됩니다
              </span>
              {trash.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm("휴지통을 완전히 비울까요? 되돌릴 수 없어요.")) {
                      emptyTrashStore();
                      setTrash(listTrash());
                      showToast("휴지통을 비웠어요");
                    }
                  }}
                  className="rounded-lg border border-app-danger-border bg-app-danger-soft px-3 py-1.5 text-[11.5px] font-semibold text-app-danger"
                >
                  휴지통 비우기
                </button>
              )}
            </div>
            {trashFiltered.length === 0 ? (
              <div className="rounded-[14px] border-[1.5px] border-dashed border-[#D4D4CE] bg-app-surface px-6 py-10 text-center text-[13px] text-app-faint">
                휴지통이 비어 있어요
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-app-border bg-app-surface">
                {trashFiltered.map((tc) => {
                  const th = getTheme(tc.themeId);
                  return (
                    <div
                      key={tc.id}
                      className="flex items-center gap-3 border-b border-app-border-soft px-3.5 py-2.5 last:border-b-0"
                    >
                      <div
                        className="h-9 w-14 shrink-0 overflow-hidden rounded-md border border-app-border"
                        style={{ background: th.bg }}
                      >
                        {tc.thumbnail && (
                          <img src={tc.thumbnail} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-app-text">
                          {tc.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-app-faint">
                          삭제됨 · {relTime(tc.delAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          restoreDeck(tc.id);
                          setDecks(listDecks());
                          refreshMeta();
                          showToast(`'${tc.title}' 복원됨`);
                        }}
                        className="shrink-0 rounded-[7px] border border-app-border bg-white px-2.5 py-1.5 text-[11px] font-semibold hover:border-app-accent"
                      >
                        복원
                      </button>
                      <button
                        title="영구 삭제"
                        onClick={() => {
                          if (window.confirm(`'${tc.title}'을(를) 완전히 삭제할까요?`)) {
                            purgeDeck(tc.id);
                            setTrash(listTrash());
                          }
                        }}
                        className="shrink-0 rounded-[7px] border border-app-danger-border bg-app-danger-soft px-2 py-1.5 text-[13px] text-app-danger"
                      >
                        <span className="mi text-[15px]">delete</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : deckView === "grid" ? (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
            {filtered.map((d) => (
              <DeckCard
                key={d.id}
                deck={d}
                onDelete={() => removeDeck(d)}
                fav={favs.includes(d.id)}
                onToggleFav={() => toggleFav(d.id)}
                folders={folders}
                onMoveFolder={(fid) => moveDeckToFolder(d.id, fid)}
                onDragStart={() => setDragDeckId(d.id)}
                onDragEnd={() => setDragDeckId(null)}
                onContext={(x, y) => setDeckCtx({ id: d.id, x, y })}
              />
            ))}
            {!q && deckFilter === "all" && folderSel === "all" && (
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
          <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-app-border bg-app-surface px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-app-bg">
              <span className="mi text-[24px] text-app-faint">slideshow</span>
            </span>
            <div>
              <p className="text-[13.5px] font-bold">아직 만든 덱이 없어요</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-app-faint">
                위 입력창에 주제를 적으면 AI가 아웃라인부터 만들어 드려요.
                <br />
                둘러보려면 예시 덱을 불러오세요.
              </p>
            </div>
            <button
              onClick={() => {
                const deck = createStoryboardDeck("proposal", themeId);
                if (!deck) return;
                saveDeck({ ...deck, title: "예시 · 제안서 덱" });
                showToast("예시 덱을 복원했어요 — 카드를 눌러 열어보세요");
                setDecks(listDecks());
              }}
              className="flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-4 py-2 text-[12.5px] font-semibold hover:border-app-accent"
            >
              <span className="mi text-[16px]">restore</span>예시 덱 복원 (프로토타입)
            </button>
          </div>
        )}
      </div>
      {/* 덱 우클릭 컨텍스트 메뉴 */}
      {deckCtx &&
        (() => {
          const d = decks.find((x) => x.id === deckCtx.id);
          if (!d) return null;
          const item = (icon: string, label: string, fn: () => void, danger = false) => (
            <span
              onClick={() => {
                setDeckCtx(null);
                fn();
              }}
              className={`flex cursor-pointer items-center gap-2.5 px-3.5 py-1.5 text-[12.5px] hover:bg-app-bg ${
                danger ? "text-app-danger" : ""
              }`}
            >
              <span className={`mi text-[15px] ${danger ? "text-app-danger" : "text-app-muted"}`}>
                {icon}
              </span>
              {label}
            </span>
          );
          return (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setDeckCtx(null)} />
              <div
                className="fixed z-[61] w-44 rounded-lg border border-app-border bg-white py-1 shadow-xl"
                style={{
                  left: Math.min(deckCtx.x, window.innerWidth - 190),
                  top: Math.min(deckCtx.y, window.innerHeight - 240),
                }}
              >
                {item("open_in_new", "열기", () => navigate(`/deck/${d.id}/edit`))}
                {item("star", favs.includes(d.id) ? "즐겨찾기 해제" : "즐겨찾기", () => toggleFav(d.id))}
                {item("edit", "이름 변경", () => renameDeck(d.id))}
                {item("content_copy", "복제", () => duplicateDeck(d.id))}
                <div className="my-1 border-t border-app-border-soft" />
                {item("delete", "삭제", () => removeDeck(d), true)}
              </div>
            </>
          );
        })()}
      {/* PPTX 가져오기 모달 (시안 07·08) */}
      {pptxModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.5)] p-4" onClick={() => setPptxModal(false)}>
          <div className="w-[440px] max-w-[94vw] rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,.3)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[16px] font-bold">PPTX 가져오기</span>
              <button onClick={() => setPptxModal(false)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-app-bg text-app-muted hover:bg-app-border-soft">
                <span className="mi text-[15px]">close</span>
              </button>
            </div>
            <p className="mb-4 text-[12px] leading-relaxed text-app-muted">
              기존 PowerPoint 파일을 아웃라인으로 변환합니다. 텍스트·구조가 추출되고 테마는 DeckGen 테마로 재적용됩니다.
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void onPickFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed px-6 py-9 text-center transition-colors ${
                dragOver ? "border-app-accent bg-app-accent-soft" : "border-app-border-soft bg-app-bg"
              }`}
            >
              {importing ? (
                <span className="animate-dg-pulse text-[13px] text-app-muted">읽는 중…</span>
              ) : (
                <>
                  <span className="mi text-[32px] text-app-faint">upload_file</span>
                  <span className="text-[13.5px] font-semibold">.pptx 파일을 여기로 드래그</span>
                  <span className="text-[11.5px] text-app-faint">또는</span>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="rounded-lg bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90"
                  >
                    파일 선택
                  </button>
                </>
              )}
            </div>
            <p className="mt-3 text-center text-[11px] text-app-faint">
              최대 50MB · 텍스트 위주 슬라이드에서 가장 정확합니다
            </p>
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onRerunOnboarding={() => setOnboarding(true)}
        />
      )}
      {onboarding && <OnboardingWizard onDone={() => setOnboarding(false)} />}
      {/* 스토리보드 ⤢ 확대 모달 (Demo Act 2) */}
      {zoomLib && (() => {
        const lib = libs.find((l) => l.id === zoomLib);
        if (!lib) return null;
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.5)] p-4" onClick={() => setZoomLib(null)}>
            <div className="w-[560px] max-w-[94vw] rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,.3)]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[16px] font-bold">{lib.name}</span>
                <button onClick={() => setZoomLib(null)} className="text-[15px] text-app-faint hover:text-app-text"><span className="mi text-[15px]">close</span></button>
              </div>
              <div className={`mx-auto mb-4 flex flex-col rounded-xl border border-app-border-soft bg-[#FBFBFA] p-5 ${lib.aspect === "4:5" ? "aspect-[4/5] w-2/3" : "aspect-[16/10] w-full"}`}>
                <PreviewArt id={lib.id} />
              </div>
              <p className="mb-4 text-[12.5px] text-app-muted">{lib.frames.length}프레임 · {lib.desc}</p>
              <button
                onClick={() => {
                  const deck = createStoryboardDeck(lib.id, themeId);
                  if (!deck) return;
                  saveDeck(deck);
                  useDeckStore.getState().setDeck(deck);
                  clearHistory();
                  void fetch(apiUrl(`/api/templates/${lib.id}/use`), { method: "POST" }).catch(() => {});
                  navigate(`/deck/${deck.id}/edit`);
                }}
                className="w-full rounded-lg bg-app-accent py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
              >
                <span className="mi align-middle text-[15px] mr-1">auto_awesome</span>이 구성으로 시작
              </button>
            </div>
          </div>
        );
      })()}
      {/* Web Scrap 모달 (Demo Act 2) */}
      {scrapOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.45)] p-4" onClick={() => setScrapOpen(false)}>
          <div className="w-[440px] max-w-[94vw] rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,.28)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[15px] font-bold">Web Scrap</span>
              <button onClick={() => setScrapOpen(false)} className="text-[15px] text-app-faint hover:text-app-text"><span className="mi text-[15px]">close</span></button>
            </div>
            <p className="mb-3 text-[12px] text-app-muted">스크랩할 URL을 붙여넣으면 생성 컨텍스트로 사용합니다.</p>
            <div className="flex gap-2">
              <input
                value={scrapDraft}
                onChange={(e) => setScrapDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && scrapDraft.trim()) {
                    setScrapUrls((p) => [...p, scrapDraft.trim()]);
                    setScrapDraft("");
                  }
                }}
                placeholder="https://..."
                className="min-w-0 flex-1 rounded-lg border border-app-border px-3 py-2 text-[12.5px] focus:border-app-accent focus:outline-none"
              />
              <button
                onClick={() => {
                  if (scrapDraft.trim()) {
                    setScrapUrls((p) => [...p, scrapDraft.trim()]);
                    setScrapDraft("");
                  }
                }}
                className="flex-none rounded-lg border border-app-border bg-white px-3 py-2 text-[12.5px] font-semibold hover:border-app-accent"
              >
                + 링크 추가
              </button>
            </div>
            {scrapUrls.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {scrapUrls.map((u, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-app-border-soft bg-[#FBFBFA] px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-app-muted">{u}</span>
                    <button onClick={() => setScrapUrls((p) => p.filter((_, x) => x !== i))} className="text-[12px] text-app-faint hover:text-app-danger"><span className="mi text-[15px]">close</span></button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setScrapUrls([]); setScrapOpen(false); }} className="rounded-lg border border-app-border px-3.5 py-2 text-[12.5px] font-semibold">비우기</button>
              <button onClick={() => setScrapOpen(false)} className="rounded-lg bg-app-text px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90">
                추가 ({scrapUrls.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
