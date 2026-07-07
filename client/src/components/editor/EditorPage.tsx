import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchShared } from "../../api/collab";
import { renderSlideToDataURL } from "../../engine/fabricRenderer";
import { exportDeckToFigmaZip } from "../../engine/figmaExporter";
import { exportDeckToPptx } from "../../engine/pptxExporter";
import { createSampleDeck } from "../../engine/sampleDeck";
import type { Slide, SlideDims, SlideElement } from "../../engine/schema";
import { aspectDims, uid } from "../../engine/schema";
import { getTheme, themes } from "../../engine/themes";
import {
  MY_COLOR,
  getCollabSession,
  getGuestName,
  useCollabStore,
} from "../../store/collabStore";
import { clearHistory, useDeckStore, useTemporal } from "../../store/deckStore";
import { useGenerationStore } from "../../store/generationStore";
import type { SlideGenStatus } from "../../store/generationStore";
import { loadDeck, saveDeck, saveDeckThumbnail } from "../../store/storage";
import { useUiStore } from "../../store/uiStore";
import { Dropdown } from "../ui/Dropdown";
import { StatusBadge } from "../ui/StatusBadge";
import { showToast } from "../ui/toast";
import { canvasApi } from "./canvasApi";
import { ChatPanel } from "./ChatPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { ShareDialog } from "./ShareDialog";
import { SlideCanvas } from "./SlideCanvas";
import { SlideThumbnail } from "./SlideThumbnail";
import { useCollabSync } from "./useCollabSync";

type RightTab = "chat" | "props" | "notes";

interface ContextMenuState {
  x: number;
  y: number;
  slideId: string;
}

const INSERT_ITEMS = [
  { key: "text", name: "텍스트 상자" },
  { key: "rect", name: "사각형" },
  { key: "ellipse", name: "원" },
  { key: "badge", name: "라운드 배지" },
];

function buildInsertElement(kind: string, dims: SlideDims): SlideElement {
  const cx = dims.w / 2;
  const cy = dims.h / 2;
  switch (kind) {
    case "rect":
      return {
        id: uid(),
        type: "shape",
        shape: "rect",
        x: cx - 200,
        y: cy - 150,
        w: 400,
        h: 300,
        fill: "@accent",
        opacity: 0.22,
      };
    case "ellipse":
      return {
        id: uid(),
        type: "shape",
        shape: "ellipse",
        x: cx - 110,
        y: cy - 110,
        w: 220,
        h: 220,
        fill: "@accent",
        opacity: 0.22,
      };
    case "badge":
      return {
        id: uid(),
        type: "shape",
        shape: "roundRect",
        x: cx - 190,
        y: cy - 48,
        w: 380,
        h: 96,
        radius: 48,
        fill: "@accent",
        opacity: 0.16,
      };
    default:
      return {
        id: uid(),
        type: "text",
        text: "텍스트를 입력하세요",
        role: "body",
        x: cx - 250,
        y: cy - 40,
        w: 500,
        h: 80,
      };
  }
}

function ViewOnlyNotice() {
  return (
    <div className="px-4 py-8 text-center text-[12.5px] leading-relaxed text-app-faint">
      <p className="text-[20px]">👁</p>
      <p className="mt-2 font-semibold text-app-muted">보기 전용 링크로 접속 중</p>
      <p className="mt-1">
        편집하려면 소유자에게
        <br />
        편집 링크를 요청하세요.
      </p>
    </div>
  );
}

/** 노트 탭 — Slide.notes 편집 (blur 시 커밋 → undo 히스토리 오염 방지) */
function NotesPanel({
  slide,
  slideIndex,
  readOnly = false,
}: {
  slide: Slide;
  slideIndex: number;
  readOnly?: boolean;
}) {
  const [val, setVal] = useState(slide.notes ?? "");
  useEffect(() => {
    setVal(slide.notes ?? "");
    // eslint 경고 회피용 주석 아님 — 슬라이드가 바뀔 때만 리셋
  }, [slide.id, slide.notes]);

  const commit = () => {
    const st = useDeckStore.getState();
    if (!st.deck?.slides.some((s) => s.id === slide.id)) return;
    if ((slide.notes ?? "") === val) return;
    st.replaceSlide(slide.id, { ...slide, notes: val || undefined });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-app-border-soft px-4 py-3">
        <span className="text-[13.5px] font-bold">발표자 노트</span>
        <span className="text-[11.5px] text-app-faint">슬라이드 {slideIndex + 1}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-4">
        <textarea
          value={val}
          readOnly={readOnly}
          onChange={(e) => setVal(e.target.value)}
          onBlur={readOnly ? undefined : commit}
          placeholder={readOnly ? "노트가 없습니다." : "이 슬라이드에서 말할 내용을 적어두세요."}
          className="min-h-0 w-full flex-1 resize-none rounded-[10px] border border-app-border bg-white p-3 text-[13px] leading-relaxed focus:border-app-accent focus:!outline-none"
        />
        <div className="rounded-lg border border-app-border-soft bg-[#FBFBFA] p-2.5 text-[11.5px] leading-relaxed text-app-faint">
          노트는 덱과 함께 저장되고, PPTX 내보내기 시{" "}
          <b className="text-app-text">발표자 노트</b>로 포함됩니다.
        </div>
      </div>
    </div>
  );
}

type ExportFormat = "pptx" | "figma";

const EXPORT_FORMATS: { id: ExportFormat; name: string; desc: string }[] = [
  {
    id: "pptx",
    name: "PowerPoint (.pptx)",
    desc: "텍스트·차트 편집 가능한 네이티브 슬라이드",
  },
  {
    id: "figma",
    name: "Figma (SVG 벡터, .zip)",
    desc: "Figma에 드래그하면 슬라이드가 편집 가능한 레이어·텍스트로 열림",
  },
];

/** 디자인 시안(1a·07)의 내보내기 팝오버 — PDF는 2차 */
function ExportPopover({
  onClose,
  onExport,
}: {
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
}) {
  const [fmt, setFmt] = useState<ExportFormat>("pptx");
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute top-[52px] right-4 z-40 w-80 rounded-[14px] border border-app-border bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.14)]">
        <p className="text-[14px] font-bold">덱 내보내기</p>
        <p className="mt-1 mb-3 text-[12px] text-app-muted">다운로드할 형식을 선택하세요.</p>
        <div className="flex flex-col gap-2">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFmt(f.id)}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left ${
                fmt === f.id
                  ? "border-[1.5px] border-app-accent bg-[#F7F4FF]"
                  : "border border-app-border hover:border-app-accent-border"
              }`}
            >
              <span
                className={`h-4 w-4 shrink-0 rounded-full bg-white ${
                  fmt === f.id
                    ? "border-[5px] border-app-accent"
                    : "border-[1.5px] border-[#C9C9C4]"
                }`}
              />
              <span>
                <span className="block text-[13px] font-semibold">{f.name}</span>
                <span className="block text-[11.5px] text-app-muted">{f.desc}</span>
              </span>
            </button>
          ))}
          <div className="flex cursor-not-allowed items-center gap-2.5 rounded-[10px] border border-app-border px-3 py-2.5 opacity-70">
            <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-[#C9C9C4] bg-white" />
            <div>
              <p className="text-[13px] font-semibold">
                PDF (.pdf)
                <span className="ml-1.5 rounded-[5px] bg-app-border-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-app-faint">
                  2차
                </span>
              </p>
              <p className="text-[11.5px] text-app-muted">공유·인쇄용 고정 레이아웃</p>
            </div>
          </div>
        </div>
        {fmt === "figma" && (
          <p className="mt-2.5 rounded-lg border border-app-border-soft bg-[#FBFBFA] p-2.5 text-[11px] leading-relaxed text-app-faint">
            슬라이드별 SVG 묶음이 내려받아집니다. 압축을 풀어 Figma 캔버스에 드래그하면
            레이어 순서·텍스트가 유지됩니다. Pretendard 폰트가 없으면 대체 폰트로 보일 수
            있어요.
          </p>
        )}
        <button
          onClick={() => onExport(fmt)}
          className="mt-3 w-full rounded-[10px] bg-app-accent py-2.5 text-[13px] font-semibold text-white hover:opacity-90"
        >
          ⬇ {fmt === "pptx" ? "PPTX" : "Figma SVG"} 다운로드
        </button>
      </div>
    </>
  );
}

const THUMB_BADGE: Partial<Record<SlideGenStatus, { status: "queued" | "generating" | "error"; label: string }>> = {
  queued: { status: "queued", label: "Queued" },
  generating: { status: "generating", label: "Generating" },
  failed: { status: "error", label: "오류" },
};

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const deck = useDeckStore((s) => s.deck);
  const {
    setDeck,
    setDeckTitle,
    setThemeId,
    addSlide,
    duplicateSlide,
    deleteSlide,
    addElement,
  } = useDeckStore.getState();
  const temporal = useTemporal();

  const currentSlideIndex = useUiStore((s) => s.currentSlideIndex);
  const setCurrentSlideIndex = useUiStore((s) => s.setCurrentSlideIndex);
  const selectedElementId = useUiStore((s) => s.selectedElementId);
  const zoom = useUiStore((s) => s.zoom);

  const [tab, setTab] = useState<RightTab>("chat");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const collab = useCollabStore();
  useCollabSync(deck);
  const isCollab = !!deck && collab.deckId === deck.id;
  const readOnly = isCollab && collab.role === "view";
  const peers = isCollab ? collab.peers : [];
  const gen = useGenerationStore();
  const genStatuses = deck && gen.deckId === deck.id ? gen.statuses : null;
  const genDone = genStatuses?.filter((s) => s === "done").length ?? 0;

  // 덱 로드: localStorage → 협업 세션(서버) → 샘플
  useEffect(() => {
    if (!id) return;
    if (deck?.id === id) return;
    const local = loadDeck(id) ?? (id === "sample" ? createSampleDeck() : null);
    if (local) {
      setDeck(local);
      setCurrentSlideIndex(0);
      clearHistory();
      return;
    }
    // 게스트 새로고침: 서버에서 공유 덱 복구
    const sess = getCollabSession(id);
    if (sess) {
      let alive = true;
      void fetchShared(sess.token)
        .then((info) => {
          if (!alive) return;
          setDeck(info.deck);
          setCurrentSlideIndex(0);
          clearHistory();
        })
        .catch(() => alive && setDeck(null));
      return () => {
        alive = false;
      };
    }
    setDeck(null);
    // deck은 의도적으로 deps에서 제외 — id 변경 시에만 로드
  }, [id]);

  // 자동 저장 (debounce 1초) + 홈 목록용 1번 슬라이드 썸네일 갱신
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!deck) return;
    // 공유 링크로 들어온 게스트는 로컬 목록에 저장하지 않는다 (§12)
    if (getCollabSession(deck.id)?.isGuest) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveDeck(deck);
      const first = deck.slides[0];
      if (first) {
        void renderSlideToDataURL(
          first,
          getTheme(deck.themeId),
          320,
          aspectDims(deck.aspect),
        ).then((url) => saveDeckThumbnail(deck.id, url));
      }
    }, 1000);
    return () => window.clearTimeout(saveTimer.current);
  }, [deck]);

  // Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      const { undo, redo } = useDeckStore.temporal.getState();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 컨텍스트 메뉴 닫기
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  if (!deck) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-app-muted">덱을 찾을 수 없습니다.</p>
        <Link to="/" className="rounded-[10px] bg-app-text px-4 py-2 text-sm text-white">
          홈으로
        </Link>
      </div>
    );
  }

  const theme = getTheme(deck.themeId);
  const dims = aspectDims(deck.aspect);
  const slideIndex = Math.min(currentSlideIndex, deck.slides.length - 1);
  const slide = deck.slides[slideIndex];
  const selectedElement =
    slide.elements.find((el) => el.id === selectedElementId) ?? null;

  const insertElement = (kind: string) => {
    const el = buildInsertElement(kind, aspectDims(deck.aspect));
    useUiStore.getState().setSelectedElementId(el.id);
    addElement(slide.id, el);
    setTab("props");
    showToast(
      `${INSERT_ITEMS.find((i) => i.key === kind)?.name ?? "요소"}가 추가됐어요 — 드래그로 배치하세요`,
    );
  };

  const removeSlide = (slideId: string) => {
    if (deck.slides.length <= 1) {
      showToast("마지막 슬라이드는 삭제할 수 없어요");
      return;
    }
    const i = deck.slides.findIndex((s) => s.id === slideId);
    deleteSlide(slideId);
    setCurrentSlideIndex(
      Math.max(0, Math.min(i <= slideIndex ? slideIndex - (i < slideIndex ? 1 : 0) : slideIndex, deck.slides.length - 2)),
    );
  };

  const runExport = (format: ExportFormat) => {
    setExportOpen(false);
    setExporting(true);
    const job =
      format === "pptx"
        ? exportDeckToPptx(deck).then(() =>
            showToast(`'${deck.title}.pptx' 다운로드 시작`),
          )
        : exportDeckToFigmaZip(deck).then(() =>
            showToast("Figma용 SVG 묶음 다운로드 — 압축 풀어 Figma에 드래그하세요"),
          );
    job
      .catch((e) => showToast(`내보내기 실패: ${e instanceof Error ? e.message : e}`))
      .finally(() => setExporting(false));
  };

  return (
    <div className="flex h-full min-w-[1080px] flex-col">
      {/* 상단 바 (시안 1f) */}
      <header className="relative z-20 flex shrink-0 items-center gap-3 border-b border-app-border bg-app-surface px-4 py-2">
        <button
          onClick={() => navigate("/")}
          title="홈으로"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-app-border text-[13px] text-app-muted hover:bg-app-bg"
        >
          ←
        </button>
        <span className="h-5 w-5 shrink-0 rounded-md bg-app-accent" />
        <input
          className="w-56 rounded-md border-b border-dashed border-transparent px-1 py-0.5 text-[14px] font-bold hover:border-app-border focus:border-app-accent focus:!outline-none read-only:hover:border-transparent"
          value={deck.title}
          readOnly={readOnly}
          onChange={(e) => setDeckTitle(e.target.value)}
          title={readOnly ? "보기 전용" : "덱 제목 (클릭해서 수정)"}
        />
        {gen.active && genStatuses && (
          <StatusBadge status="generating">
            생성 중 {genDone}/{genStatuses.length}
          </StatusBadge>
        )}
        {readOnly && <StatusBadge status="queued">보기 전용</StatusBadge>}
        {!collab.isGuest && !readOnly && (
          <span className="text-[11px] text-app-faint">✓ 자동 저장됨</span>
        )}
        <span className="flex-1" />
        {/* 프레즌스 아바타 (§12) */}
        {isCollab && (
          <div className="flex items-center">
            <span
              title={`${getGuestName() || "나"} (나)`}
              className="relative z-[3] inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white"
              style={{ background: MY_COLOR }}
            >
              {(getGuestName() || "나").slice(0, 1)}
            </span>
            {peers.map((p) => (
              <span
                key={p.clientId}
                title={`${p.name} — 슬라이드 ${p.slideIndex + 1} 보는 중`}
                className="-ml-2 inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white"
                style={{ background: p.color }}
              >
                {p.name.slice(0, 1)}
              </span>
            ))}
            <span
              className={`ml-1.5 text-[11px] ${collab.connected ? "text-app-success" : "text-app-faint"}`}
            >
              {collab.connected ? `● ${peers.length + 1}명 접속` : "연결 중…"}
            </span>
          </div>
        )}
        {!readOnly && (
          <Dropdown
            items={Object.values(themes).map((t) => ({
              key: t.id,
              name: t.name,
              swatch: t.accent,
            }))}
            activeKey={deck.themeId}
            onSelect={setThemeId}
            align="right"
            triggerClassName="flex items-center gap-2 rounded-[9px] border border-app-border bg-white px-3 py-2 hover:border-app-accent data-open:border-app-accent"
            title="슬라이드 테마"
          >
            <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: theme.accent }} />
            <span className="text-[12.5px] font-medium">{theme.name}</span>
            <span className="text-[9px] text-app-faint">▾</span>
          </Dropdown>
        )}
        {!collab.isGuest && (
          <button
            onClick={() => setShareOpen(true)}
            className="rounded-[9px] border border-app-border bg-white px-3.5 py-2 text-[13px] font-semibold hover:border-app-accent"
          >
            공유
          </button>
        )}
        <button
          onClick={() => setExportOpen((o) => !o)}
          disabled={exporting}
          className="rounded-[9px] bg-app-accent px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_6px_rgba(109,74,255,.25)] hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? "내보내는 중…" : "⬇ PPTX 내보내기"}
        </button>
        {exportOpen && (
          <ExportPopover onClose={() => setExportOpen(false)} onExport={runExport} />
        )}
        {shareOpen && <ShareDialog deck={deck} onClose={() => setShareOpen(false)} />}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 좌측: 썸네일 */}
        <aside className="flex w-54 shrink-0 flex-col gap-2.5 overflow-y-auto border-r border-app-border bg-app-surface px-3 py-3.5">
          {/* 좌패널 헤더 (스냅덱 배치) — 덱 정보 + New slide */}
          <div className="mb-0.5">
            <p className="truncate text-[13px] leading-snug font-bold">{deck.title}</p>
            <p className="text-[11px] text-app-faint">
              {deck.aspect === "4:5" ? "Carousel · 4:5" : "Presentation · 16:9"}
            </p>
          </div>
          {!readOnly && (
            <div className="flex gap-1.5">
              <Dropdown
                items={[
                  { key: "blank", name: "+ 빈 슬라이드" },
                  { key: "dup", name: "⧉ 현재 슬라이드 복제" },
                ]}
                onSelect={(key) => {
                  if (key === "blank") {
                    addSlide(slideIndex);
                    setCurrentSlideIndex(slideIndex + 1);
                  } else {
                    duplicateSlide(slide.id);
                    setCurrentSlideIndex(slideIndex + 1);
                  }
                }}
                triggerClassName="flex-1 rounded-lg border border-app-border bg-white py-1.5 text-[12px] font-semibold text-app-text hover:border-app-accent"
                title="새 슬라이드"
              >
                New slide <span className="text-[9px] text-app-faint">▾</span>
              </Dropdown>
              <button
                onClick={() => {
                  addSlide(slideIndex);
                  setCurrentSlideIndex(slideIndex + 1);
                }}
                title="빈 슬라이드 추가"
                className="w-9 rounded-lg border border-app-border bg-white text-[14px] text-app-muted hover:border-app-accent hover:text-app-accent"
              >
                +
              </button>
            </div>
          )}
          {deck.slides.map((s, i) => {
            const st = genStatuses?.[i];
            const badge = st ? THUMB_BADGE[st] : null;
            const isCur = i === slideIndex;
            return (
              <div key={s.id} className="flex gap-2">
                <span
                  className={`w-3.5 pt-1 text-right text-[11px] font-bold ${
                    isCur ? "text-app-accent" : "text-app-faint"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => setCurrentSlideIndex(i)}
                    onContextMenu={(e) => {
                      if (readOnly) return;
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, slideId: s.id });
                    }}
                    className={`relative block w-full overflow-hidden rounded-[7px] border-2 transition-colors ${
                      isCur
                        ? "border-app-accent shadow-[0_2px_8px_rgba(109,74,255,.18)]"
                        : "border-transparent hover:border-app-border"
                    }`}
                  >
                    <SlideThumbnail slide={s} theme={theme} dims={dims} />
                    {badge && (
                      <span className="absolute top-1 right-1">
                        <StatusBadge status={badge.status} size="sm">
                          {badge.label}
                        </StatusBadge>
                      </span>
                    )}
                  </button>
                  <div className="mt-1 flex items-center gap-1 px-0.5 text-[10px] text-app-faint">
                    <span className="flex-1 truncate">
                      {i + 1} · {s.layout}
                    </span>
                    {peers
                      .filter((p) => p.slideIndex === i)
                      .map((p) => (
                        <span
                          key={p.clientId}
                          title={`${p.name} 보는 중`}
                          className="h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{ background: p.color }}
                        />
                      ))}
                  </div>
                  {isCur && !readOnly && (
                    <div className="mt-1 flex gap-1.5">
                      <button
                        onClick={() => {
                          duplicateSlide(s.id);
                          setCurrentSlideIndex(i + 1);
                        }}
                        className="flex-1 rounded-md border border-app-border bg-white py-1 text-[10.5px] font-semibold text-app-muted hover:bg-app-bg"
                      >
                        복제
                      </button>
                      <button
                        onClick={() => removeSlide(s.id)}
                        className="flex-1 rounded-md border border-app-danger-border bg-app-danger-soft py-1 text-[10.5px] font-semibold text-app-danger hover:opacity-80"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </aside>

        {/* 중앙: 캔버스 + 줌 툴바 */}
        <main className="relative min-w-0 flex-1">
          <SlideCanvas slide={slide} theme={theme} readOnly={readOnly} dims={dims} />
          {/* 하단 중앙 툴바 (스냅덱 배치) — 도구 · undo/redo · 줌 */}
          <div className="absolute bottom-3.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[12px] border border-app-border bg-white p-1 shadow-[0_2px_10px_rgba(0,0,0,.08)]">
            {!readOnly && (
              <>
                {(
                  [
                    ["text", "T", "텍스트 상자"],
                    ["rect", "▭", "사각형"],
                    ["ellipse", "○", "원"],
                    ["badge", "◖◗", "라운드 배지"],
                  ] as const
                ).map(([kind, glyph, title]) => (
                  <button
                    key={kind}
                    onClick={() => insertElement(kind)}
                    title={title}
                    className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-[13px] text-app-muted hover:bg-app-bg hover:text-app-text"
                  >
                    {glyph}
                  </button>
                ))}
                <span className="mx-0.5 h-4 w-px bg-app-border" />
                <button
                  onClick={() => useDeckStore.temporal.getState().undo()}
                  disabled={temporal.pastStates.length === 0}
                  title="실행 취소 (Ctrl+Z)"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] text-app-muted hover:bg-app-bg disabled:text-[#D4D4CE]"
                >
                  ↺
                </button>
                <button
                  onClick={() => useDeckStore.temporal.getState().redo()}
                  disabled={temporal.futureStates.length === 0}
                  title="다시 실행 (Ctrl+Shift+Z)"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] text-app-muted hover:bg-app-bg disabled:text-[#D4D4CE]"
                >
                  ↻
                </button>
                <span className="mx-0.5 h-4 w-px bg-app-border" />
              </>
            )}
            <button
              onClick={() => canvasApi()?.zoomOut()}
              className="rounded-md px-2.5 py-1 text-[12px] text-app-muted hover:bg-app-bg"
            >
              −
            </button>
            <span className="min-w-11 px-1 text-center text-[12px] font-semibold">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => canvasApi()?.zoomIn()}
              className="rounded-md px-2.5 py-1 text-[12px] text-app-muted hover:bg-app-bg"
            >
              +
            </button>
            <span className="mx-0.5 h-4 w-px bg-app-border" />
            <button
              onClick={() => canvasApi()?.fit()}
              className="rounded-md px-2.5 py-1 text-[11.5px] font-medium hover:bg-app-bg"
            >
              화면 맞춤
            </button>
          </div>
        </main>

        {/* 우측: 탭 패널 */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-app-border bg-app-surface">
          <div className="flex shrink-0 gap-1 border-b border-app-border px-3 pt-2">
            {(
              [
                ["chat", "AI 채팅"],
                ["props", "속성"],
                ["notes", "노트"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-2 text-[13px] font-semibold ${
                  tab === key
                    ? "border-b-2 border-app-accent text-app-text"
                    : "border-b-2 border-transparent text-app-faint hover:text-app-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "chat" &&
              (readOnly ? (
                <ViewOnlyNotice />
              ) : (
                <ChatPanel
                  slide={slide}
                  slideIndex={slideIndex}
                  theme={theme}
                  deckId={deck.id}
                  dims={dims}
                />
              ))}
            {tab === "props" &&
              (readOnly ? (
                <ViewOnlyNotice />
              ) : (
                <PropertiesPanel
                  slideId={slide.id}
                  element={selectedElement}
                  theme={theme}
                  dims={dims}
                />
              ))}
            {tab === "notes" && (
              <NotesPanel slide={slide} slideIndex={slideIndex} readOnly={readOnly} />
            )}
          </div>
        </aside>
      </div>

      {/* 슬라이드 우클릭 메뉴 */}
      {menu && (
        <div
          className="fixed z-50 w-32 overflow-hidden rounded-xl border border-app-border bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,.16)]"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            className="block w-full rounded-lg px-3 py-2 text-left text-[12.5px] hover:bg-app-accent-soft/60"
            onClick={() => {
              duplicateSlide(menu.slideId);
              setMenu(null);
            }}
          >
            복제
          </button>
          <button
            className="block w-full rounded-lg px-3 py-2 text-left text-[12.5px] text-app-danger hover:bg-app-danger-soft"
            onClick={() => {
              removeSlide(menu.slideId);
              setMenu(null);
            }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}
