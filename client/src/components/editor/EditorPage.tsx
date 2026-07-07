import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { trackEvent } from "../../api/client";
import { fetchShared, sendPresence } from "../../api/collab";
import { renderSlideToDataURL } from "../../engine/fabricRenderer";
import { exportDeckToFigmaZip } from "../../engine/figmaExporter";
import { exportDeckToPng } from "../../engine/pngExporter";
import { exportDeckToPptx } from "../../engine/pptxExporter";
import { createSampleDeck } from "../../engine/sampleDeck";
import type { Deck, Slide, SlideDims, SlideElement } from "../../engine/schema";
import { aspectDims, uid } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { getTheme, themes } from "../../engine/themes";
import { addSavedTemplate } from "../../store/savedTemplateStore";
import { useComments } from "../../store/commentStore";
import {
  CLIENT_ID,
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
import { CommentsPanel } from "./CommentsPanel";
import { GridOverview } from "./GridOverview";
import { MediaPicker } from "./MediaPicker";
import { PresentMode } from "./PresentMode";
import { MotionTimeline } from "./MotionTimeline";
import { getMotion } from "../../store/motionStore";
import { NotificationBell } from "./NotificationBell";
import { ShortcutsModal } from "./ShortcutsModal";
import { PropertiesPanel } from "./PropertiesPanel";
import { RegenerateLayer } from "./RegenerateLayer";
import { ShareDialog } from "./ShareDialog";
import { SlideCanvas } from "./SlideCanvas";
import { SlideThumbnail } from "./SlideThumbnail";
import { VersionHistory } from "./VersionHistory";
import { useCollabSync } from "./useCollabSync";

type RightTab = "chat" | "props" | "notes" | "comments";

interface ContextMenuState {
  x: number;
  y: number;
  slideId: string;
}

function buildInsertElement(kind: string, dims: SlideDims): SlideElement {
  const cx = dims.w / 2;
  const cy = dims.h / 2;
  const base = { id: uid(), x: cx - 150, y: cy - 150, w: 300, h: 300, fill: "@accent", opacity: 0.22 };
  switch (kind) {
    case "rect":
      return { ...base, type: "shape", shape: "rect", x: cx - 200, w: 400 };
    case "ellipse":
      return { ...base, type: "shape", shape: "ellipse", x: cx - 110, y: cy - 110, w: 220, h: 220 };
    case "triangle":
      return { ...base, type: "shape", shape: "triangle" };
    case "diamond":
      return { ...base, type: "shape", shape: "diamond" };
    case "star":
      return { ...base, type: "shape", shape: "star" };
    case "pill":
      return { ...base, type: "shape", shape: "pill", x: cx - 190, y: cy - 48, w: 380, h: 96, opacity: 0.16 };
    case "line":
      return { id: uid(), type: "shape", shape: "line", x: cx - 250, y: cy, w: 500, h: 0, stroke: "@accent", strokeWidth: 4 };
    case "arrow":
      return { id: uid(), type: "shape", shape: "arrow", x: cx - 250, y: cy - 20, w: 500, h: 40, stroke: "@accent", strokeWidth: 4 };
    case "badge":
      return { ...base, type: "shape", shape: "roundRect", x: cx - 190, y: cy - 48, w: 380, h: 96, radius: 48, opacity: 0.16 };
    case "table":
      return {
        id: uid(),
        type: "table",
        headerRow: true,
        rows: [
          ["항목", "지원 전", "지원 후"],
          ["매출", "-", "-"],
          ["효율", "-", "-"],
        ],
        x: cx - 500,
        y: cy - 200,
        w: 1000,
        h: 400,
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
      <p className="mi text-[26px] text-app-muted">visibility</p>
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
  slides,
  onJump,
}: {
  slide: Slide;
  slideIndex: number;
  readOnly?: boolean;
  slides?: Slide[];
  onJump?: (i: number) => void;
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
        {/* 전체 노트 개요 (Demo Act 6) */}
        {slides && onJump && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-1.5 text-[11px] font-bold tracking-[.06em] text-app-faint">전체 노트</p>
            {slides.filter((s) => s.notes?.trim()).length === 0 ? (
              <p className="text-[11.5px] text-app-faint">아직 작성된 노트가 없어요.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {slides.map((s, i) =>
                  s.notes?.trim() ? (
                    <button
                      key={s.id}
                      onClick={() => onJump(i)}
                      className={`rounded-lg border px-2.5 py-2 text-left ${
                        i === slideIndex ? "border-app-accent bg-app-accent-soft" : "border-app-border-soft bg-white hover:border-app-accent"
                      }`}
                    >
                      <span className="text-[10.5px] font-bold text-app-faint">슬라이드 {i + 1}</span>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] text-app-muted">{s.notes}</p>
                    </button>
                  ) : null,
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type ExportFormat = "pptx" | "figma" | "png";

const EXPORT_FORMATS: { id: ExportFormat; name: string; desc: string; lock?: boolean }[] = [
  {
    id: "png",
    name: "이미지 (.png)",
    desc: "슬라이드마다 PNG 이미지로 저장",
  },
  {
    id: "pptx",
    name: "PowerPoint (.pptx)",
    desc: "텍스트·차트 편집 가능한 네이티브 슬라이드",
    lock: true,
  },
  {
    id: "figma",
    name: "Figma (.fig)",
    desc: "Figma로 import — 텍스트·도형은 native layer로 유지",
    lock: true,
  },
];

/** 디자인 시안(1a·07)의 내보내기 팝오버 — PDF는 2차 */
function ExportPopover({
  onClose,
  onExport,
  onSaveTemplate,
}: {
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  onSaveTemplate: () => void;
}) {
  const [fmt, setFmt] = useState<ExportFormat>("pptx");
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute top-[52px] right-4 z-40 w-80 rounded-[14px] border border-app-border bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,.14)]">
        <p className="text-[14px] font-bold">덱 내보내기</p>
        <p className="mt-1 mb-2.5 text-[12px] text-app-muted">다운로드할 형식을 선택하세요.</p>
        <div className="mb-3 rounded-lg bg-app-bg px-3 py-2 text-[11px] text-app-muted">
          현재 플랜: <b className="text-app-text">Free</b> — PPTX·FIG 내보내기는 Plus부터
        </div>
        <div className="flex flex-col gap-2">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFmt(f.id)}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left ${
                fmt === f.id
                  ? "border-[1.5px] border-app-accent bg-[#F0F0EE]"
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
              <span className="flex-1">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  {f.name}
                  {f.lock && (
                    <span className="inline-flex items-center gap-0.5 rounded-[5px] bg-app-border-soft px-1.5 py-0.5 text-[10px] font-semibold text-app-faint">
                      <span className="mi text-[11px]">lock</span>Plus·Pro
                    </span>
                  )}
                </span>
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
              <p className="text-[11.5px] text-app-muted">공유나 인쇄에 적합한 고정 레이아웃</p>
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
          <span className="mi align-middle text-[14px] mr-1">download</span>{fmt === "pptx" ? "PPTX" : fmt === "png" ? "PNG" : "Figma SVG"} 다운로드
        </button>
        <div className="my-2.5 border-t border-app-border-soft" />
        <button
          onClick={onSaveTemplate}
          className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-app-border bg-white py-2.5 text-[12.5px] font-semibold hover:border-app-accent"
        >
          <span className="mi text-[15px]">bookmark_add</span>이 덱을 템플릿으로 저장
        </button>
      </div>
    </>
  );
}

function SaveTemplateModal({ deck, theme, onClose }: { deck: Deck; theme: Theme; onClose: () => void }) {
  const first = deck.slides[0]?.elements.find(
    (e) => e.type === "text" && (e.role === "title" || e.role === "heading"),
  ) as { text?: string } | undefined;
  const [name, setName] = useState(`${deck.title} 템플릿`);
  const [scope, setScope] = useState<"me" | "ws">("me");
  const save = () => {
    if (!name.trim()) {
      showToast("템플릿 이름을 입력하세요");
      return;
    }
    addSavedTemplate({
      name: name.trim(),
      coverTitle: first?.text?.split("\n")[0] ?? deck.title,
      meta: `${deck.slides.length}장 · ${theme.name} · ${scope === "ws" ? "워크스페이스" : "나만"}`,
      prompt: deck.title,
      count: deck.slides.length,
      themeId: deck.themeId,
      scope,
    });
    showToast(`'${name.trim()}' 템플릿으로 저장됐어요 — 홈 '내 템플릿'에서 사용하세요`);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.5)] p-4" onClick={onClose}>
      <div className="w-[380px] max-w-[94vw] rounded-2xl bg-white p-5.5 shadow-[0_24px_64px_rgba(0,0,0,.3)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <span className="mi text-[18px]">bookmark_add</span>
          <span className="text-[16px] font-bold">템플릿으로 저장</span>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed text-app-muted">
          현재 덱의 구성·테마·슬라이드 흐름을 재사용 가능한 템플릿으로 저장합니다.
        </p>
        <p className="mb-1.5 text-[11px] font-bold tracking-[.06em] text-app-faint">템플릿 이름</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 분기 실적 보고 표준"
          className="mb-3.5 w-full rounded-[10px] border border-app-border px-3 py-2.5 text-[13px] focus:border-app-accent focus:outline-none"
        />
        <p className="mb-1.5 text-[11px] font-bold tracking-[.06em] text-app-faint">공개 범위</p>
        <div className="mb-4 flex gap-2">
          {(
            [
              ["me", "나만", "person"],
              ["ws", "워크스페이스", "groups"],
            ] as const
          ).map(([k, label, icon]) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border py-2.5 text-[12.5px] font-semibold ${
                scope === k ? "border-[1.5px] border-app-text bg-[#F0F0EE]" : "border-app-border bg-white text-app-muted"
              }`}
            >
              <span className="mi text-[15px]">{icon}</span>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-[10px] border border-app-border bg-white px-4 py-2.5 text-[12.5px] font-semibold text-app-muted hover:border-app-accent">
            취소
          </button>
          <button onClick={save} className="flex-[1.4] rounded-[10px] bg-app-accent py-2.5 text-[12.5px] font-semibold text-white hover:opacity-90">
            템플릿 저장
          </button>
        </div>
      </div>
    </div>
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
  const allComments = useComments(deck?.id ?? "");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [regen, setRegen] = useState<{ slideId: string; x: number; y: number } | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [mediaPicker, setMediaPicker] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [slideQuery, setSlideQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [motionOpen, setMotionOpen] = useState(false);
  const [motionAnim, setMotionAnim] = useState(""); // 캔버스 재생 애니 클래스(키 리셋)
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [tplSaveOpen, setTplSaveOpen] = useState(false);
  const [followId, setFollowId] = useState<string | null>(null);
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

  // 협업 팔로우 — 팔로우 대상의 슬라이드로 자동 이동
  useEffect(() => {
    if (!followId) return;
    const target = peers.find((p) => p.clientId === followId);
    if (!target) {
      setFollowId(null);
      return;
    }
    if (target.slideIndex !== slideIndex) setCurrentSlideIndex(target.slideIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers, followId]);

  // Ctrl+Z / Ctrl+Shift+Z + ? (단축키 도움말)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      if (!inField && e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if (inField) return;
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
  const unresolvedComments = allComments.filter((c) => c.slideId === slide?.id && !c.resolved).length;
  const selectedElement =
    slide.elements.find((el) => el.id === selectedElementId) ?? null;

  const SHAPE_LABEL: Record<string, string> = {
    rect: "사각형",
    ellipse: "원",
    triangle: "삼각형",
    diamond: "다이아몬드",
    star: "별",
    pill: "알약",
    line: "선",
    arrow: "화살표",
    badge: "라운드 배지",
    table: "표",
    text: "텍스트 상자",
  };

  const insertElement = (kind: string) => {
    const el = buildInsertElement(kind, aspectDims(deck.aspect));
    useUiStore.getState().setSelectedElementId(el.id);
    addElement(slide.id, el);
    setTab("props");
    showToast(`${SHAPE_LABEL[kind] ?? "요소"}가 추가됐어요 — 드래그로 배치하세요`);
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
    const t0 = Date.now();
    const job =
      format === "pptx"
        ? exportDeckToPptx(deck).then(() =>
            showToast(`'${deck.title}.pptx' 다운로드 시작`),
          )
        : format === "png"
          ? exportDeckToPng(deck).then(() =>
              showToast(
                deck.slides.length === 1
                  ? `'${deck.title}.png' 다운로드 시작`
                  : "슬라이드별 PNG 묶음(zip) 다운로드 시작",
              ),
            )
          : exportDeckToFigmaZip(deck).then(() =>
              showToast("Figma용 SVG 묶음 다운로드 — 압축 풀어 Figma에 드래그하세요"),
            );
    job
      .then(() => trackEvent("export", true, Date.now() - t0, `${format} · ${deck.title.slice(0, 40)}`))
      .catch((e) => {
        trackEvent("export", false, Date.now() - t0, `${format} · ${deck.title.slice(0, 40)}`);
        showToast(`내보내기 실패: ${e instanceof Error ? e.message : e}`);
      })
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
          <span className="mi text-[16px]">arrow_back</span>
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
        {!readOnly && (
          <button
            onClick={() => useDeckStore.temporal.getState().undo()}
            disabled={temporal.pastStates.length === 0}
            title="실행 취소 (Ctrl+Z)"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-app-bg disabled:text-[#D4D4CE]"
          >
            <span className="mi text-[16px]">undo</span>
          </button>
        )}
        {!collab.isGuest && !readOnly && (
          <span className="flex items-center gap-1 text-[11px] text-app-faint"><span className="mi text-[13px]">cloud_done</span>자동 저장됨</span>
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
              <button
                key={p.clientId}
                onClick={() => {
                  setFollowId((cur) => (cur === p.clientId ? null : p.clientId));
                  setCurrentSlideIndex(p.slideIndex);
                }}
                title={`${p.name} — 슬라이드 ${p.slideIndex + 1} · 클릭 시 시점 팔로우`}
                className={`-ml-2 inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                  followId === p.clientId ? "ring-2 ring-app-accent ring-offset-1" : "border-2 border-white"
                }`}
                style={{ background: p.color }}
              >
                {p.name.slice(0, 1)}
              </button>
            ))}
            <span
              className={`ml-1.5 text-[11px] ${collab.connected ? "text-app-success" : "text-app-faint"}`}
            >
              {collab.connected ? `${peers.length + 1}명 접속` : "연결 중…"}
            </span>
            {followId && (
              <button
                onClick={() => setFollowId(null)}
                title="팔로우 해제"
                className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-app-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-app-text"
              >
                <span className="mi text-[12px]">visibility</span> {peers.find((p) => p.clientId === followId)?.name ?? "?"} 팔로우 중 <span className="mi text-[12px]">close</span>
              </button>
            )}
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
            <span className="mi text-[14px] text-app-faint">expand_more</span>
          </Dropdown>
        )}
        <NotificationBell deckId={deck.id} onJump={(i) => setCurrentSlideIndex(i)} />
        <button
          onClick={() => setShortcutsOpen(true)}
          title="키보드 단축키 (?)"
          className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-app-border bg-white text-[14px] text-app-muted hover:border-app-accent"
        >
          <span className="mi text-[17px]">keyboard</span>
        </button>
        <button
          onClick={() => setGridOpen(true)}
          title="슬라이드 개요 — 전체 그리드 · 드래그 순서 변경"
          className="rounded-[9px] border border-app-border bg-white px-3.5 py-2 text-[13px] font-semibold hover:border-app-accent"
        >
          개요
        </button>
        {!readOnly && (
          <button
            onClick={() => setVersionsOpen(true)}
            title="버전 히스토리 — 스냅샷 저장/복원"
            className="rounded-[9px] border border-app-border bg-white px-3.5 py-2 text-[13px] font-semibold hover:border-app-accent"
          >
            버전
          </button>
        )}
        {!readOnly && (
          <button
            onClick={() => setMotionOpen((v) => !v)}
            title="모션 타임라인 — 요소 등장 애니"
            className={`rounded-[9px] border px-3.5 py-2 text-[13px] font-semibold hover:border-app-accent ${
              motionOpen ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-white"
            }`}
          >
            <span className="mi align-middle text-[15px] mr-1">movie</span>모션
          </button>
        )}
        <button
          onClick={() => setPresenting(true)}
          title="발표 모드 — 클릭/→ 진행 · N 노트 · Esc 종료"
          className="rounded-[9px] border border-app-border bg-white px-3.5 py-2 text-[13px] font-semibold hover:border-app-accent"
        >
          <span className="mi align-middle text-[15px] mr-1">play_arrow</span>발표
        </button>
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
          className="rounded-[9px] bg-app-accent px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_6px_rgba(26,26,26,.25)] hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? "내보내는 중…" : <><span className="mi align-middle text-[14px] mr-1">download</span>PPTX 내보내기</>}
        </button>
        {exportOpen && (
          <ExportPopover
            onClose={() => setExportOpen(false)}
            onExport={runExport}
            onSaveTemplate={() => {
              setExportOpen(false);
              setTplSaveOpen(true);
            }}
          />
        )}
        {shareOpen && <ShareDialog deck={deck} onClose={() => setShareOpen(false)} />}
        {presenting && (
          <PresentMode
            deck={deck}
            theme={theme}
            startIndex={slideIndex}
            onExit={() => setPresenting(false)}
          />
        )}
        {mediaPicker && (
          <MediaPicker
            dims={dims}
            onInsert={(el) => {
              addElement(slide.id, el);
              useUiStore.getState().setSelectedElementId(el.id);
              setTab("props");
            }}
            onClose={() => setMediaPicker(false)}
          />
        )}
        {versionsOpen && <VersionHistory deck={deck} onClose={() => setVersionsOpen(false)} />}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {tplSaveOpen && <SaveTemplateModal deck={deck} theme={theme} onClose={() => setTplSaveOpen(false)} />}
        {gridOpen && (
          <GridOverview
            deck={deck}
            theme={theme}
            dims={dims}
            onClose={() => setGridOpen(false)}
            onJump={(i) => {
              setCurrentSlideIndex(i);
              setGridOpen(false);
            }}
          />
        )}
        {regen &&
          (() => {
            const target = deck.slides.find((s) => s.id === regen.slideId);
            return target ? (
              <RegenerateLayer
                slide={target}
                theme={theme}
                anchor={{ x: regen.x, y: regen.y }}
                onClose={() => setRegen(null)}
              />
            ) : null;
          })()}
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
                  { key: "ai", name: "AI로 생성" },
                  { key: "regen", name: "≡ 덱 다시 생성" },
                ]}
                onSelect={(key) => {
                  if (key === "blank") {
                    addSlide(slideIndex);
                    setCurrentSlideIndex(slideIndex + 1);
                  } else if (key === "dup") {
                    duplicateSlide(slide.id);
                    setCurrentSlideIndex(slideIndex + 1);
                  } else if (key === "ai") {
                    // 빈 슬라이드 추가 후 재생성 레이어 열기
                    addSlide(slideIndex);
                    const newIdx = slideIndex + 1;
                    setCurrentSlideIndex(newIdx);
                    setTimeout(() => {
                      const st = useDeckStore.getState();
                      const ns = st.deck?.slides[newIdx];
                      if (ns) setRegen({ slideId: ns.id, x: 280, y: 120 });
                    }, 50);
                  } else if (key === "regen") {
                    if (confirm("덱을 처음부터 다시 생성할까요? 아웃라인 화면으로 이동합니다.")) {
                      navigate(`/deck/${deck.id}/outline`);
                    }
                  }
                }}
                triggerClassName="flex-1 rounded-lg border border-app-border bg-white py-1.5 text-[12px] font-semibold text-app-text hover:border-app-accent"
                title="새 슬라이드"
              >
                새 슬라이드 <span className="mi text-[14px] text-app-faint">expand_more</span>
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
          {/* 슬라이드 검색 (제목·본문·노트) */}
          <div className="flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-2.5 py-1.5">
            <span className="mi text-[15px] text-app-faint">search</span>
            <input
              value={slideQuery}
              onChange={(e) => setSlideQuery(e.target.value)}
              placeholder="슬라이드 검색"
              className="min-w-0 flex-1 bg-transparent text-[11.5px] focus:outline-none"
            />
            {slideQuery && (
              <button onClick={() => setSlideQuery("")} className="mi text-[14px] text-app-faint hover:text-app-text">close</button>
            )}
          </div>
          {(() => {
            const q = slideQuery.trim().toLowerCase();
            const matches = q
              ? deck.slides.reduce<number>((n, s) => {
                  const hay = [
                    s.notes ?? "",
                    ...s.elements.filter((e) => e.type === "text").map((e) => (e as { text: string }).text),
                  ]
                    .join(" ")
                    .toLowerCase();
                  return n + (hay.includes(q) ? 1 : 0);
                }, 0)
              : deck.slides.length;
            return q ? (
              <p className="px-0.5 text-[10.5px] text-app-faint">
                {matches > 0 ? `${matches}개 일치` : "일치하는 슬라이드가 없어요"}
              </p>
            ) : null;
          })()}
          {deck.slides.map((s, i) => {
            const st = genStatuses?.[i];
            const badge = st ? THUMB_BADGE[st] : null;
            const isCur = i === slideIndex;
            // 검색어가 있으면 미일치 슬라이드는 숨김
            if (slideQuery.trim()) {
              const q = slideQuery.trim().toLowerCase();
              const hay = [
                s.notes ?? "",
                ...s.elements.filter((e) => e.type === "text").map((e) => (e as { text: string }).text),
              ]
                .join(" ")
                .toLowerCase();
              if (!hay.includes(q)) return null;
            }
            const showSection = s.section && s.section !== deck.slides[i - 1]?.section;
            return (
              <div key={s.id}>
              {showSection && (
                <div className="mt-2 mb-1 flex items-center gap-1.5 px-0.5">
                  <span className="mi text-[12px] text-app-faint">label</span>
                  <span className="flex-1 truncate text-[10.5px] font-bold tracking-wide text-app-muted uppercase">
                    {s.section}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => {
                        const cur = useDeckStore.getState().deck?.slides.find((x) => x.id === s.id);
                        if (cur) useDeckStore.getState().replaceSlide(s.id, { ...cur, section: undefined });
                      }}
                      className="text-app-faint hover:text-app-danger"
                    >
                      <span className="mi text-[13px]">close</span>
                    </button>
                  )}
                </div>
              )}
              <div className="flex gap-2">
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
                    className={`group relative block w-full overflow-hidden rounded-[7px] border-2 transition-colors ${
                      isCur
                        ? "border-app-accent shadow-[0_2px_8px_rgba(26,26,26,.18)]"
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
                    {/* 호버 시 재생성 버튼 (스냅덱) — 클릭하면 AI 재생성 레이어 */}
                    {!readOnly && !badge && (
                      <span
                        role="button"
                        title="AI로 이 슬라이드 재생성"
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = e.currentTarget
                            .closest("button")!
                            .getBoundingClientRect();
                          setCurrentSlideIndex(i);
                          setRegen({ slideId: s.id, x: r.right + 10, y: r.top - 4 });
                        }}
                        className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-md border border-app-border bg-white/95 text-app-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:border-app-accent hover:text-app-accent"
                      >
                        <span className="mi text-[15px]">refresh</span>
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
                    <div className="mt-1 grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => {
                          duplicateSlide(s.id);
                          setCurrentSlideIndex(i + 1);
                        }}
                        className="rounded-md border border-app-border bg-white py-1 text-[10.5px] font-semibold text-app-muted hover:bg-app-bg"
                      >
                        복제
                      </button>
                      <button
                        onClick={() => {
                          const cur = useDeckStore.getState().deck?.slides.find((x) => x.id === s.id);
                          const locked = cur?.elements.every((e) => e.locked);
                          cur?.elements.forEach((e) =>
                            useDeckStore.getState().updateElement(s.id, e.id, { locked: !locked }),
                          );
                          showToast(locked ? "슬라이드 잠금 해제" : "슬라이드를 잠갔어요");
                        }}
                        className="rounded-md border border-app-border bg-white py-1 text-[10.5px] font-semibold text-app-muted hover:bg-app-bg"
                      >
                        {s.elements.length > 0 && s.elements.every((e) => e.locked) ? "해제" : "잠금"}
                      </button>
                      <button
                        onClick={() => {
                          const name = window.prompt("섹션 이름", s.section ?? "");
                          if (name === null) return;
                          const cur = useDeckStore.getState().deck?.slides.find((x) => x.id === s.id);
                          if (cur) useDeckStore.getState().replaceSlide(s.id, { ...cur, section: name.trim() || undefined });
                        }}
                        className="rounded-md border border-app-border bg-white py-1 text-[10.5px] font-semibold text-app-muted hover:bg-app-bg"
                      >
                        + 섹션
                      </button>
                      <button
                        onClick={() => removeSlide(s.id)}
                        className="rounded-md border border-app-danger-border bg-app-danger-soft py-1 text-[10.5px] font-semibold text-app-danger hover:opacity-80"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>
              </div>
            );
          })}
        </aside>

        {/* 중앙: 캔버스 + 줌 툴바 */}
        <main className="relative min-w-0 flex-1">
          <div key={motionAnim} className={`h-full w-full ${motionAnim ? `dg-motion-${getMotion(deck.id).effect}` : ""}`}>
          <SlideCanvas
            slide={slide}
            theme={theme}
            readOnly={readOnly}
            dims={dims}
            onInsertAt={insertElement}
            peers={peers.filter((p) => p.slideIndex === slideIndex)}
            onCursor={
              isCollab
                ? (x, y) => {
                    const sess = getCollabSession(deck.id);
                    if (!sess) return;
                    void sendPresence(deck.id, {
                      token: sess.token,
                      clientId: CLIENT_ID,
                      name: getGuestName() || "게스트",
                      color: MY_COLOR,
                      slideIndex,
                      cursor: { x, y },
                    }).catch(() => {});
                  }
                : undefined
            }
          />
          </div>
          {/* AI 편집 affordance (스냅덱 — 마퀴→AI 수정) */}
          {!readOnly && !motionOpen && (
            <button
              onClick={() => setTab("chat")}
              className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-app-border bg-white/95 px-3.5 py-1.5 text-[11.5px] font-semibold text-app-muted shadow-[0_2px_10px_rgba(0,0,0,.08)] backdrop-blur hover:border-app-accent hover:text-app-text"
            >
              <span className="mi text-[14px]">auto_awesome</span>
              영역을 드래그해 AI로 수정
            </button>
          )}
          {motionOpen && !readOnly && (
            <MotionTimeline
              deckId={deck.id}
              onPlay={() => setMotionAnim(`m${Date.now()}`)}
              onClose={() => setMotionOpen(false)}
            />
          )}
          {/* 미니맵 (좌하단) — 슬라이드 바 클릭 점프 */}
          <div className="absolute bottom-3.5 left-3.5 z-10 flex items-center gap-1.5 rounded-[11px] border border-app-border bg-white px-2.5 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,.08)]">
            <span className="mi text-[15px] text-app-muted">map</span>
            {deck.slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrentSlideIndex(i)}
                title={`슬라이드 ${i + 1}`}
                className={`h-4 rounded-[3px] border transition-all ${
                  i === slideIndex
                    ? "w-6 border-[1.5px] border-app-text bg-app-accent-soft"
                    : "w-[18px] border-app-border bg-app-bg hover:border-app-muted"
                }`}
              />
            ))}
            <span className="ml-0.5 text-[10.5px] font-semibold text-app-muted">
              {slideIndex + 1} / {deck.slides.length}
            </span>
          </div>
          {/* 하단 중앙 툴바 (시안 도구 스트립) — 선택·손·댓글 / T·도형·미디어·정렬·AI / undo·redo / 줌 */}
          <div className="absolute bottom-3.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[12px] border border-app-border bg-white p-1 shadow-[0_2px_10px_rgba(0,0,0,.08)]">
            {!readOnly && (
              <>
                <button
                  onClick={() => useUiStore.getState().setSelectedElementId(null)}
                  title="선택 도구"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-app-bg px-1.5 text-app-text"
                >
                  <span className="mi text-[17px]">near_me</span>
                </button>
                <button
                  onClick={() => showToast("Space를 누른 채 드래그하면 화면을 이동할 수 있어요")}
                  title="손 도구 — Space+드래그로 팬"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
                >
                  <span className="mi text-[17px]">pan_tool</span>
                </button>
                <button
                  onClick={() => setTab("comments")}
                  title="댓글"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
                >
                  <span className="mi text-[17px]">chat_bubble</span>
                </button>
                <span className="mx-0.5 h-4 w-px bg-app-border" />
                <button
                  onClick={() => insertElement("text")}
                  title="텍스트 상자"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
                >
                  <span className="mi text-[17px]">title</span>
                </button>
                {/* 도형 드롭다운 (위로 열림) */}
                <Dropdown
                  direction="up"
                  items={[
                    { key: "rect", name: "사각형" },
                    { key: "ellipse", name: "원" },
                    { key: "triangle", name: "삼각형" },
                    { key: "diamond", name: "다이아몬드" },
                    { key: "star", name: "별" },
                    { key: "pill", name: "알약" },
                    { key: "line", name: "선" },
                    { key: "arrow", name: "화살표" },
                    { key: "table", name: "표" },
                  ]}
                  onSelect={(key) => insertElement(key)}
                  triggerClassName="flex h-8 items-center justify-center gap-0.5 rounded-lg px-2 text-app-muted hover:bg-app-bg hover:text-app-text data-open:bg-app-bg"
                  title="도형"
                >
                  <span className="mi text-[17px]">category</span><span className="mi text-[13px]">expand_more</span>
                </Dropdown>
                {/* 미디어 삽입 (YouTube/이미지/Pexels/GIPHY/아이콘/AI) */}
                <button
                  onClick={() => setMediaPicker(true)}
                  title="미디어 삽입 — 이미지·YouTube·Pexels·GIPHY·아이콘·AI"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
                >
                  <span className="mi text-[17px]">image</span>
                </button>
                {/* 정렬·분배 드롭다운 (위로 열림) */}
                <Dropdown
                  direction="up"
                  items={[
                    { key: "left", name: "왼쪽 정렬" },
                    { key: "hcenter", name: "가로 가운데" },
                    { key: "right", name: "오른쪽 정렬" },
                    { key: "top", name: "위 정렬" },
                    { key: "vcenter", name: "세로 가운데" },
                    { key: "bottom", name: "아래 정렬" },
                    { key: "disth", name: "가로 분배" },
                    { key: "distv", name: "세로 분배" },
                  ]}
                  onSelect={(key) => {
                    const api = canvasApi();
                    if (!api) return;
                    if (key === "disth") api.distribute("h");
                    else if (key === "distv") api.distribute("v");
                    else api.align(key as never);
                  }}
                  triggerClassName="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text data-open:bg-app-bg"
                  title="정렬 · 분배"
                >
                  <span className="mi text-[17px]">format_align_center</span>
                </Dropdown>
                <button
                  onClick={() => setTab("chat")}
                  title="AI로 수정"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
                >
                  <span className="mi text-[17px]">auto_awesome</span>
                </button>
                <span className="mx-0.5 h-4 w-px bg-app-border" />
                <button
                  onClick={() => useDeckStore.temporal.getState().undo()}
                  disabled={temporal.pastStates.length === 0}
                  title="실행 취소 (Ctrl+Z)"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] text-app-muted hover:bg-app-bg disabled:text-[#D4D4CE]"
                >
                  <span className="mi text-[16px]">undo</span>
                </button>
                <button
                  onClick={() => useDeckStore.temporal.getState().redo()}
                  disabled={temporal.futureStates.length === 0}
                  title="다시 실행 (Ctrl+Shift+Z)"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] text-app-muted hover:bg-app-bg disabled:text-[#D4D4CE]"
                >
                  <span className="mi text-[16px]">redo</span>
                </button>
                <span className="mx-0.5 h-4 w-px bg-app-border" />
              </>
            )}
            <button
              onClick={() => canvasApi()?.zoomOut()}
              className="rounded-md px-2.5 py-1 text-[12px] text-app-muted hover:bg-app-bg"
            >
              <span className="mi text-[16px]">remove</span>
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
                ["comments", "댓글"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1 px-3 py-2 text-[13px] font-semibold ${
                  tab === key
                    ? "border-b-2 border-app-accent text-app-text"
                    : "border-b-2 border-transparent text-app-faint hover:text-app-text"
                }`}
              >
                {label}
                {key === "comments" && unresolvedComments > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-app-danger px-1 text-[9px] font-bold text-white">
                    {unresolvedComments}
                  </span>
                )}
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
              <NotesPanel
                slide={slide}
                slideIndex={slideIndex}
                readOnly={readOnly}
                slides={deck.slides}
                onJump={setCurrentSlideIndex}
              />
            )}
            {tab === "comments" && (
              <CommentsPanel
                deckId={deck.id}
                slideId={slide.id}
                slideIndex={slideIndex}
                readOnly={readOnly}
              />
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
