import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { trackEvent } from "../../api/client";
import { fetchShared, sendPresence } from "../../api/collab";
import { renderSlideToDataURL } from "../../engine/fabricRenderer";
import { exportDeckToFigmaZip } from "../../engine/figmaExporter";
import { exportDeckToPng } from "../../engine/pngExporter";
import { exportDeckToPptx } from "../../engine/pptxExporter";
import { createSampleDeck } from "../../engine/sampleDeck";
import type { Deck, ImageElement, Slide, SlideDims, SlideElement } from "../../engine/schema";
import { aspectDims, uid } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { getTheme, themes } from "../../engine/themes";
import { addSavedTemplate } from "../../store/savedTemplateStore";
import { addComment, addReply, deleteComment, moveComment, toggleResolve, useComments } from "../../store/commentStore";
import {
  CLIENT_ID,
  MY_COLOR,
  getCollabSession,
  getGuestName,
  useCollabStore,
} from "../../store/collabStore";
import { clearHistory, useDeckStore, useTemporal } from "../../store/deckStore";
import { getAnon } from "../../store/privacyStore";
import { useGenerationStore } from "../../store/generationStore";
import type { SlideGenStatus } from "../../store/generationStore";
import { loadDeck, saveDeck, saveDeckThumbnail } from "../../store/storage";
import { useUiStore } from "../../store/uiStore";
import { Dropdown } from "../ui/Dropdown";
import { Logo } from "../ui/Logo";
import { StatusBadge } from "../ui/StatusBadge";
import { showToast } from "../ui/toast";
import { canvasApi } from "./canvasApi";
import { ChatPanel } from "./ChatPanel";
import { CommentsPanel } from "./CommentsPanel";
import { LibraryPanel } from "./LibraryPanel";
import { GridOverview } from "./GridOverview";
import { MediaPicker } from "./MediaPicker";
import { PresentMode } from "./PresentMode";
import { WhiteboardMode } from "./WhiteboardMode";
import { ImageCropModal } from "./ImageCropModal";
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

type RightTab = "chat" | "props" | "notes" | "comments" | "library";

interface ContextMenuState {
  x: number;
  y: number;
  slideId: string;
}

// 스티키 노트 색 팔레트 (Miro식 12색)
const STICKY_COLORS = [
  "#FFE066", "#FFD43B", "#FFC078", "#FFA94D", "#FFA8A8", "#FF8787",
  "#F783AC", "#B2F2BB", "#69DB7C", "#96F2D7", "#A5D8FF", "#D0BFFF",
];

// 고객 여정맵(CJM) — 제목 + 여정 단계×스테이지 편집 표 + 고객 이해도 정렬 스케일
function buildCjmElements(dims: SlideDims): SlideElement[] {
  const M = 80;
  return [
    {
      id: uid(),
      type: "text",
      text: "고객 여정맵 (Customer Journey Map)",
      role: "heading",
      x: M,
      y: 48,
      w: dims.w - M * 2,
      h: 90,
    },
    {
      id: uid(),
      type: "table",
      headerRow: true,
      rows: [
        ["여정 단계", "1. 인지", "2. 탐색", "3. 결정", "4. 사용"],
        ["스토리", "", "", "", ""],
        ["행동 (Actions)", "", "", "", ""],
        ["접점 (Touchpoints)", "", "", "", ""],
        ["감정 (Emotions)", "", "", "", ""],
        ["불만/장애물 (Pain points)", "", "", "", ""],
      ],
      x: M,
      y: 168,
      w: dims.w - M * 2,
      h: dims.h - 168 - M,
    },
  ];
}

// 우선순위 표(Prioritization) — 기능 목록 + 영향도/노력/점수 편집 표
function buildPrioritizationElements(dims: SlideDims): SlideElement[] {
  const M = 100;
  return [
    {
      id: uid(),
      type: "text",
      text: "기능 우선순위 (Prioritization)",
      role: "heading",
      x: M,
      y: 56,
      w: dims.w - M * 2,
      h: 90,
    },
    {
      id: uid(),
      type: "table",
      headerRow: true,
      rows: [
        ["우선순위", "기능", "영향도", "노력", "점수"],
        ["1", "새 기능 A", "높음", "중간", "9"],
        ["2", "새 기능 B", "높음", "낮음", "8"],
        ["3", "개선 C", "중간", "낮음", "6"],
        ["4", "개선 D", "낮음", "중간", "3"],
      ],
      x: M,
      y: 176,
      w: dims.w - M * 2,
      h: dims.h - 176 - M - 60,
    },
  ];
}

function buildInsertElement(kind: string, dims: SlideDims): SlideElement {
  const cx = dims.w / 2;
  const cy = dims.h / 2;
  const base = { id: uid(), x: cx - 150, y: cy - 150, w: 300, h: 300, fill: "@accent" };
  switch (kind) {
    case "rect":
      return { ...base, type: "shape", shape: "rect", x: cx - 200, w: 400 };
    case "circle":
      return { ...base, type: "shape", shape: "ellipse", x: cx - 130, y: cy - 130, w: 260, h: 260 };
    case "ellipse":
      return { ...base, type: "shape", shape: "ellipse", x: cx - 200, y: cy - 120, w: 400, h: 240 };
    case "triangle":
      return { ...base, type: "shape", shape: "triangle" };
    case "diamond":
      return { ...base, type: "shape", shape: "diamond" };
    case "star":
      return { ...base, type: "shape", shape: "star" };
    case "parallelogram":
      return { ...base, type: "shape", shape: "parallelogram", x: cx - 200, y: cy - 100, w: 400, h: 200 };
    case "pill":
      return { ...base, type: "shape", shape: "pill", x: cx - 190, y: cy - 48, w: 380, h: 96 };
    case "line":
      return { id: uid(), type: "shape", shape: "line", x: cx - 250, y: cy, w: 500, h: 0, stroke: "@accent", strokeWidth: 4 };
    case "arrow":
      return { id: uid(), type: "shape", shape: "arrow", x: cx - 250, y: cy - 20, w: 500, h: 40, stroke: "@accent", strokeWidth: 4 };
    case "badge":
      return { ...base, type: "shape", shape: "roundRect", x: cx - 190, y: cy - 48, w: 380, h: 96, radius: 48 };
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
    case "w-poll":
    case "w-dotvote":
      return {
        id: uid(),
        type: "widget",
        widget: kind === "w-poll" ? "poll" : "dotvote",
        title: kind === "w-poll" ? "투표" : "닷 보팅",
        options: [
          { id: uid(), label: "선택지 A", votes: 0 },
          { id: uid(), label: "선택지 B", votes: 0 },
          { id: uid(), label: "선택지 C", votes: 0 },
        ],
        x: cx - 360,
        y: cy - 220,
        w: 720,
        h: 440,
      };
    case "w-timer":
      return {
        id: uid(),
        type: "widget",
        widget: "timer",
        title: "타이머",
        seconds: 300,
        endsAt: null,
        remainingMs: 300000,
        x: cx - 280,
        y: cy - 190,
        w: 560,
        h: 380,
      };
    case "w-spinner":
      return {
        id: uid(),
        type: "widget",
        widget: "spinner",
        title: "돌림판",
        options: [
          { id: uid(), label: "분석", votes: 0 },
          { id: uid(), label: "디자인", votes: 0 },
          { id: uid(), label: "개발", votes: 0 },
          { id: uid(), label: "리뷰", votes: 0 },
        ],
        result: null,
        x: cx - 340,
        y: cy - 220,
        w: 680,
        h: 440,
      };
    case "w-alignment":
      return {
        id: uid(),
        type: "widget",
        widget: "alignment",
        title: "정렬 스케일",
        scaleValue: 50,
        scaleLeft: "동의 안 함",
        scaleRight: "매우 동의",
        x: cx - 400,
        y: cy - 150,
        w: 800,
        h: 300,
      };
    case "w-wordcloud":
      return {
        id: uid(),
        type: "widget",
        widget: "wordcloud",
        title: "워드클라우드",
        words: [],
        x: cx - 400,
        y: cy - 240,
        w: 800,
        h: 480,
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

/** 도형 드롭다운 항목의 미리보기 아이콘 (프로토타입 시안 — 아웃라인 currentColor) */
function shapeIcon(kind: string) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.4 } as const;
  const p = (d: string) => <path d={d} {...s} strokeLinejoin="round" strokeLinecap="round" />;
  const inner = (() => {
    switch (kind) {
      case "rect":
        return <rect x="2.5" y="4" width="11" height="8" rx="1.5" {...s} />;
      case "circle":
        return <circle cx="8" cy="8" r="5" {...s} />;
      case "ellipse":
        return <ellipse cx="8" cy="8" rx="6" ry="4" {...s} />;
      case "triangle":
        return p("M8 3 L13.5 13 L2.5 13 Z");
      case "diamond":
        return p("M8 2.5 L13.5 8 L8 13.5 L2.5 8 Z");
      case "star":
        return p("M8 2.5 l1.55 3.15 3.45.5-2.5 2.45.6 3.45L8 12.9 4.9 14.55l.6-3.45-2.5-2.45 3.45-.5z");
      case "parallelogram":
        return p("M5 4 H14 L11 12 H2 Z");
      case "line":
        return p("M2.5 12.5 L13.5 3.5");
      case "arrow":
        return p("M2.5 8 H12 M9 5 L12.5 8 L9 11");
      case "table":
        return (
          <>
            <rect x="2.5" y="3.5" width="11" height="9" rx="1" {...s} />
            <path d="M2.5 7 H13.5 M8 3.5 V12.5" {...s} />
          </>
        );
      default:
        return <rect x="2.5" y="4" width="11" height="8" rx="1.5" {...s} />;
    }
  })();
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4">
      {inner}
    </svg>
  );
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
    addElements,
    updateElement,
  } = useDeckStore.getState();
  const temporal = useTemporal();

  const currentSlideIndex = useUiStore((s) => s.currentSlideIndex);
  const setCurrentSlideIndex = useUiStore((s) => s.setCurrentSlideIndex);
  const selectedElementId = useUiStore((s) => s.selectedElementId);
  const pinPicking = useUiStore((s) => s.pinPicking);
  const zoom = useUiStore((s) => s.zoom);

  const [tab, setTab] = useState<RightTab>("chat");
  const allComments = useComments(deck?.id ?? "");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [regen, setRegen] = useState<{ slideId: string; x: number; y: number } | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [whiteboard, setWhiteboard] = useState(false);
  const [mediaPicker, setMediaPicker] = useState(false);
  // 펜(자유 드로잉) 도구
  const [penMode, setPenMode] = useState(false);
  const [penColor, setPenColor] = useState("#1A1A1A");
  const [penWidth, setPenWidth] = useState(4);
  const [penOpacity, setPenOpacity] = useState(1);
  // 펜 종류(시안): 펜/마커/형광펜/연필/지우개 — 종류별 굵기·불투명도 프리셋
  const [penType, setPenType] = useState<"pen" | "marker" | "highlighter" | "pencil" | "eraser">("pen");
  const PEN_PRESET: Record<string, { w: number; o: number }> = {
    pen: { w: 1, o: 1 },
    marker: { w: 2.6, o: 1 },
    highlighter: { w: 4.5, o: 0.35 },
    pencil: { w: 0.55, o: 0.85 },
    eraser: { w: 3, o: 1 },
  };
  const effWidth = Math.round(penWidth * PEN_PRESET[penType].w);
  const effOpacity = penType === "highlighter" ? 0.35 : penOpacity * PEN_PRESET[penType].o;
  const [penPopover, setPenPopover] = useState(false);
  const [stickyPop, setStickyPop] = useState(false);
  const [mmOpen, setMmOpen] = useState(true); // 미니맵 접기/펼치기
  const [pinPop, setPinPop] = useState<{ id: string; x: number; y: number } | null>(null);
  const [mediaTab, setMediaTab] = useState<"image" | "youtube" | "library" | "ai">("image");
  const [replaceImageId, setReplaceImageId] = useState<string | null>(null);
  const [cropId, setCropId] = useState<string | null>(null);
  const openMedia = (t: "image" | "youtube" | "library" | "ai") => {
    setReplaceImageId(null);
    setMediaTab(t);
    setMediaPicker(true);
  };
  // 이미지 요소 교체(Pexels/GIPHY/업로드/AI) — 선택한 이미지의 src만 바꾼다
  const startReplaceImage = (elId: string, t: "image" | "ai") => {
    setReplaceImageId(elId);
    setMediaTab(t);
    setMediaPicker(true);
  };
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

  // 선택 변경 시 프레즌스 브로드캐스트 → 피어에게 "선택 중" 라벨 즉시 반영
  useEffect(() => {
    if (!isCollab) return;
    const sess = getCollabSession(deck.id);
    if (!sess) return;
    void sendPresence(deck.id, {
      token: sess.token,
      clientId: CLIENT_ID,
      name: getGuestName() || "게스트",
      color: MY_COLOR,
      slideIndex,
      selectedId: selectedElementId ?? undefined,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementId]);

  // 오브젝트 선택 시 우측 패널을 속성 탭으로 자동 전환
  // (읽기 전용·핀 찍기 모드는 제외 — 댓글 핀 배치 흐름을 방해하지 않게)
  useEffect(() => {
    if (readOnly) return;
    if (!selectedElementId) return;
    if (useUiStore.getState().pinPicking) return;
    setTab("props");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementId, readOnly]);

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

  // 화면 캡처/이미지 클립보드 붙여넣기 (Ctrl+V) — 현재 슬라이드에 이미지로 추가
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const st = useDeckStore.getState();
      const d = st.deck;
      if (!d) return;
      // 입력창 포커스 중이면 기본 붙여넣기 유지
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // 공유 보기 권한 / 잠긴 슬라이드는 무시
      const cs = useCollabStore.getState();
      if (cs.deckId === d.id && cs.role === "view") return;
      const idx = useUiStore.getState().currentSlideIndex;
      const sl = d.slides[idx];
      if (!sl || sl.locked) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (!it.type.startsWith("image/")) continue;
        const file = it.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const im = new Image();
          im.onload = () => {
            const dm = aspectDims(d.aspect);
            const nw = im.naturalWidth || 720;
            const nh = im.naturalHeight || 450;
            const scale = Math.min((dm.w * 0.7) / nw, (dm.h * 0.7) / nh, 1) || 1;
            const w = Math.round(nw * scale);
            const h = Math.round(nh * scale);
            const newEl: ImageElement = {
              id: uid(),
              type: "image",
              src: dataUrl,
              fit: "contain",
              x: Math.round(dm.w / 2 - w / 2),
              y: Math.round(dm.h / 2 - h / 2),
              w,
              h,
            };
            st.addElement(sl.id, newEl);
            useUiStore.getState().setSelectedElementId(newEl.id);
            showToast("붙여넣은 이미지를 추가했어요");
          };
          im.src = dataUrl;
        };
        reader.readAsDataURL(file);
        return;
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

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
  const slideLocked = !!slide?.locked; // 슬라이드 잠금 — 편집·삽입·펜 전부 차단
  const canEdit = !readOnly && !slideLocked;
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
    if (slideLocked) {
      showToast("잠긴 슬라이드예요 — 잠금을 해제한 뒤 편집하세요");
      return;
    }
    const el = buildInsertElement(kind, aspectDims(deck.aspect));
    useUiStore.getState().setSelectedElementId(el.id);
    addElement(slide.id, el);
    setTab("props");
    showToast(`${SHAPE_LABEL[kind] ?? "요소"}가 추가됐어요 — 드래그로 배치하세요`);
  };

  // 스티키 노트 — 색 카드(roundRect) + 가운데 텍스트를 같은 groupId로 묶어 삽입(카드=이동, 텍스트=더블클릭 편집)
  const insertSticky = (color: string) => {
    if (slideLocked) {
      showToast("잠긴 슬라이드예요 — 잠금을 해제한 뒤 편집하세요");
      return;
    }
    const dm = aspectDims(deck.aspect);
    const size = 300;
    const x = Math.round(dm.w / 2 - size / 2);
    const y = Math.round(dm.h / 2 - size / 2);
    const g = uid();
    const card: SlideElement = {
      id: uid(),
      type: "shape",
      shape: "roundRect",
      radius: 14,
      fill: color,
      shadow: true,
      groupId: g,
      x,
      y,
      w: size,
      h: size,
    };
    const text: SlideElement = {
      id: uid(),
      type: "text",
      text: "메모를 입력하세요",
      role: "body",
      align: "center",
      color: "#1A1A1A",
      groupId: g,
      x: x + 24,
      y: y + size / 2 - 44,
      w: size - 48,
      h: 88,
    };
    addElements(slide.id, [card, text]);
    useUiStore.getState().setSelectedElementId(text.id);
    showToast("스티키 노트 추가 — 더블클릭해서 내용을 입력하세요");
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
      <header className="relative z-20 flex shrink-0 items-center gap-3 border-b border-app-border bg-app-surface px-4 py-[9px]">
        <button
          onClick={() => navigate("/")}
          title="홈으로"
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border border-app-border text-[13px] text-app-muted hover:bg-app-bg"
        >
          <span className="mi text-[15px]">arrow_back</span>
        </button>
        {/* DeckGen 로고 (시안 1f) */}
        <Logo size={20} />
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
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-app-border bg-white text-app-muted hover:bg-app-bg disabled:text-[#D4D4CE]"
          >
            <span className="mi text-[16px]">undo</span>
          </button>
        )}
        {!collab.isGuest && !readOnly && (
          <span className="flex items-center gap-1 text-[11px] text-app-faint"><span className="mi text-[13px]">cloud_done</span>자동 저장됨</span>
        )}
        <span className="flex-1" />
        <button
          onClick={() => setGridOpen(true)}
          title="슬라이드 개요 — 전체 그리드 · 드래그 순서 변경"
          className="rounded-lg border border-app-border bg-white px-[11px] py-[7px] text-[12px] font-semibold hover:border-app-accent"
        >
          <span className="mi align-middle text-[14px] mr-1">grid_view</span>개요
        </button>
        {!readOnly && (
          <button
            onClick={() => setMotionOpen((v) => !v)}
            title="모션 타임라인 — 요소 등장 애니"
            className={`rounded-lg border px-[11px] py-[7px] text-[12px] font-semibold hover:border-app-accent ${
              motionOpen ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-white"
            }`}
          >
            <span className="mi align-middle text-[14px] mr-1">movie</span>모션
          </button>
        )}
        {!readOnly && (
          <button
            onClick={() => setVersionsOpen(true)}
            title="버전 히스토리 — 스냅샷 저장/복원"
            className="rounded-lg border border-app-border bg-white px-[11px] py-[7px] text-[12px] font-semibold hover:border-app-accent"
          >
            <span className="mi align-middle text-[14px] mr-1">history</span>버전
          </button>
        )}
        {!readOnly && (
          <button
            onClick={() => setWhiteboard(true)}
            title="화이트보드 — 덱을 무한 캔버스로 전환해 워크샵 진행"
            className="rounded-lg border border-app-border bg-white px-[11px] py-[7px] text-[12px] font-semibold hover:border-app-accent"
          >
            <span className="mi align-middle text-[14px] mr-1">dashboard</span>화이트보드
          </button>
        )}
        <button
          onClick={() => setPresenting(true)}
          title="발표 모드 — 클릭/→ 진행 · N 노트 · Esc 종료"
          className="rounded-lg bg-app-text px-[11px] py-[7px] text-[12px] font-semibold text-white hover:opacity-90"
        >
          <span className="mi align-middle text-[14px] mr-1">play_arrow</span>발표
        </button>
        {!collab.isGuest && (
          <button
            onClick={() => setShareOpen(true)}
            className="rounded-lg border border-app-border bg-white px-[11px] py-[7px] text-[12px] font-semibold hover:border-app-accent"
          >
            <span className="mi align-middle text-[14px] mr-1">share</span>공유
          </button>
        )}
        {/* 프레즌스 아바타 (§12) — 호버 시 툴팁, 클릭 시 시점 팔로우 */}
        {isCollab && (
          <div className="flex items-center">
            <div className="group/av relative z-[3]">
              <span
                className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white"
                style={{ background: MY_COLOR }}
              >
                {(getGuestName() || "나").slice(0, 1)}
              </span>
              <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-app-text px-2 py-1 text-[10.5px] font-medium text-white shadow-lg group-hover/av:block">
                {getGuestName() || "나"} (나) · 슬라이드 {slideIndex + 1}
              </span>
            </div>
            {peers.map((p) => (
              <div key={p.clientId} className="group/av relative -ml-2">
                <button
                  onClick={() => {
                    setFollowId((cur) => (cur === p.clientId ? null : p.clientId));
                    setCurrentSlideIndex(p.slideIndex);
                  }}
                  className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                    followId === p.clientId ? "ring-2 ring-app-accent ring-offset-1" : "border-2 border-white"
                  }`}
                  style={{ background: p.color }}
                >
                  {p.name.slice(0, 1)}
                </button>
                {/* 호버 툴팁 — 이름 · 보고 있는 슬라이드 · 팔로우 안내 */}
                <span className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 hidden -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-md bg-app-text px-2 py-1 text-[10.5px] font-medium text-white shadow-lg group-hover/av:flex">
                  <span>{p.name} · 슬라이드 {p.slideIndex + 1} 보는 중</span>
                  <span className="text-[9.5px] text-white/60">
                    {followId === p.clientId ? "클릭 시 팔로우 해제" : "클릭 시 시점 팔로우"}
                  </span>
                </span>
              </div>
            ))}
            {!followId && peers.length > 0 && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] text-app-text">
                <span className="h-1.5 w-1.5 rounded-full bg-app-text" />
                {peers.length + 1}명 접속
              </span>
            )}
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
        <button
          onClick={() => setShortcutsOpen(true)}
          title="키보드 단축키 (?)"
          className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-app-border bg-white text-[14px] text-app-text hover:border-app-accent"
        >
          <span className="mi text-[17px]">keyboard</span>
        </button>
        <NotificationBell deckId={deck.id} onJump={(i) => setCurrentSlideIndex(i)} />
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
            triggerClassName="flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-2.5 py-[7px] hover:border-app-accent data-open:border-app-accent"
            title="슬라이드 테마"
          >
            <span className="mi text-[14px] text-[#55554F]">palette</span>
            <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: theme.accent }} />
            <span className="text-[12px] font-medium">{theme.name}</span>
            <span className="mi text-[13px] text-app-faint">keyboard_arrow_down</span>
          </Dropdown>
        )}
        <button
          onClick={() => setExportOpen((o) => !o)}
          disabled={exporting}
          className="rounded-lg bg-app-accent px-[13px] py-[7px] text-[12px] font-semibold text-white shadow-[0_2px_6px_rgba(26,26,26,.25)] hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? "내보내는 중…" : <><span className="mi align-middle text-[14px] mr-1">download</span>내보내기<span className="mi align-middle text-[13px] ml-0.5">keyboard_arrow_down</span></>}
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
        {/* 전체 화면 모달은 body로 포털 — header(relative z-20) 안에 있으면 캔버스 오버레이(핀 등)에 가림 */}
        {createPortal(
          <>
        {shareOpen && <ShareDialog deck={deck} onClose={() => setShareOpen(false)} />}
        {whiteboard && <WhiteboardMode deck={deck} onExit={() => setWhiteboard(false)} />}
        {cropId &&
          (() => {
            const el = slide.elements.find((e) => e.id === cropId);
            if (!el || el.type !== "image") return null;
            return (
              <ImageCropModal
                src={el.src}
                onApply={(dataUrl) => updateElement(slide.id, cropId, { src: dataUrl } as Partial<SlideElement>)}
                onClose={() => setCropId(null)}
              />
            );
          })()}
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
            initialTab={mediaTab}
            onInsert={(el) => {
              // 교체 모드: 선택 이미지의 src만 바꾸고 새 요소는 추가하지 않는다
              if (replaceImageId && el.type === "image") {
                updateElement(slide.id, replaceImageId, { src: el.src } as Partial<SlideElement>);
                useUiStore.getState().setSelectedElementId(replaceImageId);
                setReplaceImageId(null);
                setTab("props");
                setMediaPicker(false);
                showToast("이미지를 교체했어요");
                return;
              }
              addElement(slide.id, el);
              useUiStore.getState().setSelectedElementId(el.id);
              setTab("props");
            }}
            onClose={() => {
              setReplaceImageId(null);
              setMediaPicker(false);
            }}
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
          </>,
          document.body,
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
                  { key: "blank", name: "빈 슬라이드", icon: <span className="mi text-[16px]">add</span> },
                  { key: "ai", name: "AI로 생성", icon: <span className="mi text-[16px]">auto_awesome</span> },
                  { key: "cjm", name: "고객 여정맵", icon: <span className="mi text-[16px]">map</span> },
                  { key: "prioritization", name: "우선순위 표", icon: <span className="mi text-[16px]">format_list_numbered</span> },
                  { key: "regen", name: "덱 다시 생성", icon: <span className="mi text-[16px]">refresh</span> },
                ]}
                onSelect={(key) => {
                  if (key === "blank") {
                    addSlide(slideIndex);
                    setCurrentSlideIndex(slideIndex + 1);
                  } else if (key === "cjm" || key === "prioritization") {
                    // 템플릿 슬라이드 추가 후 요소 채우기
                    addSlide(slideIndex);
                    const newIdx = slideIndex + 1;
                    setCurrentSlideIndex(newIdx);
                    const dm = aspectDims(deck.aspect);
                    const els = key === "cjm" ? buildCjmElements(dm) : buildPrioritizationElements(dm);
                    const ns = useDeckStore.getState().deck?.slides[newIdx];
                    if (ns) addElements(ns.id, els);
                    showToast(key === "cjm" ? "고객 여정맵 템플릿을 추가했어요" : "우선순위 표 템플릿을 추가했어요");
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
                rootClassName="flex-1"
                triggerClassName="flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-app-border bg-white py-1.5 text-[12px] font-semibold text-app-text hover:border-app-accent"
                title="새 슬라이드"
              >
                <span className="mi text-[16px]">add</span>새 슬라이드{" "}
                <span className="mi text-[14px] text-app-faint">expand_more</span>
              </Dropdown>
              <button
                onClick={() => {
                  addSlide(slideIndex);
                  setCurrentSlideIndex(slideIndex + 1);
                }}
                title="빈 슬라이드 추가"
                className="flex w-9 shrink-0 items-center justify-center rounded-lg border border-app-border bg-white text-app-muted hover:border-app-accent hover:text-app-accent"
              >
                <span className="mi text-[18px]">add</span>
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
                  <span className="h-1.5 w-1.5 shrink-0 rounded-[2px] bg-app-text" />
                  {readOnly ? (
                    <span className="flex-1 truncate text-[10.5px] font-bold tracking-wide text-app-muted uppercase">
                      {s.section}
                    </span>
                  ) : (
                    <input
                      value={s.section ?? ""}
                      onChange={(e) => {
                        const cur = useDeckStore.getState().deck?.slides.find((x) => x.id === s.id);
                        if (cur) useDeckStore.getState().replaceSlide(s.id, { ...cur, section: e.target.value });
                      }}
                      title="섹션 이름 (클릭해서 수정)"
                      className="min-w-0 flex-1 border-b border-dashed border-transparent bg-transparent text-[10.5px] font-bold tracking-wide text-app-muted uppercase hover:border-app-border focus:border-app-accent focus:outline-none"
                    />
                  )}
                  {!readOnly && (
                    <button
                      onClick={() => {
                        const cur = useDeckStore.getState().deck?.slides.find((x) => x.id === s.id);
                        if (cur) useDeckStore.getState().replaceSlide(s.id, { ...cur, section: undefined });
                      }}
                      title="섹션 제거"
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
                    <span className="truncate">
                      {i + 1} · {s.layout}
                    </span>
                    {s.locked && (
                      <span className="mi text-[12px]" title="잠김">lock</span>
                    )}
                    {s.notes && s.notes.trim() && (
                      <span className="mi text-[12px]" title="발표자 노트 있음">sticky_note_2</span>
                    )}
                    {!readOnly && isCur && (
                      <button
                        onClick={() => {
                          setCurrentSlideIndex(i);
                          setTab("props");
                        }}
                        title="이 슬라이드 편집"
                        className="flex items-center text-app-faint hover:text-app-accent"
                      >
                        <span className="mi text-[13px]">edit</span>
                      </button>
                    )}
                    <span className="flex-1" />
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
                    <div className="mt-1 grid grid-cols-4 gap-1">
                      <button
                        onClick={() => {
                          if (s.locked) return showToast("잠긴 슬라이드는 복제 전에 잠금을 해제하세요");
                          duplicateSlide(s.id);
                          setCurrentSlideIndex(i + 1);
                        }}
                        title="복제"
                        className="flex items-center justify-center rounded-md border border-app-border bg-white py-1.5 text-app-muted hover:border-app-accent hover:text-app-accent"
                      >
                        <span className="mi text-[16px]">content_copy</span>
                      </button>
                      <button
                        onClick={() => {
                          const cur = useDeckStore.getState().deck?.slides.find((x) => x.id === s.id);
                          if (!cur) return;
                          useDeckStore.getState().replaceSlide(s.id, { ...cur, locked: !cur.locked || undefined });
                          showToast(cur.locked ? "슬라이드 잠금을 해제했어요" : "슬라이드를 잠갔어요 — 편집·펜·삽입이 차단됩니다");
                        }}
                        title={s.locked ? "잠금 해제" : "슬라이드 잠금"}
                        className={`flex items-center justify-center rounded-md border py-1.5 ${
                          s.locked
                            ? "border-app-accent bg-app-accent-soft text-app-accent"
                            : "border-app-border bg-white text-app-muted hover:border-app-accent hover:text-app-accent"
                        }`}
                      >
                        <span className="mi text-[16px]">{s.locked ? "lock" : "lock_open"}</span>
                      </button>
                      <button
                        onClick={() => {
                          const name = window.prompt("섹션 이름", s.section ?? "");
                          if (name === null) return;
                          const cur = useDeckStore.getState().deck?.slides.find((x) => x.id === s.id);
                          if (cur) useDeckStore.getState().replaceSlide(s.id, { ...cur, section: name.trim() || undefined });
                        }}
                        title="섹션 지정"
                        className="flex items-center justify-center rounded-md border border-app-border bg-white py-1.5 text-app-muted hover:border-app-accent hover:text-app-accent"
                      >
                        <span className="mi text-[16px]">bookmark_add</span>
                      </button>
                      <button
                        onClick={() => removeSlide(s.id)}
                        title="삭제"
                        className="flex items-center justify-center rounded-md border border-app-danger-border bg-app-danger-soft py-1.5 text-app-danger hover:opacity-80"
                      >
                        <span className="mi text-[16px]">delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              </div>
            );
          })}
          {!readOnly && !slideQuery.trim() && (
            <button
              onClick={() => {
                addSlide(deck.slides.length - 1);
                setCurrentSlideIndex(deck.slides.length);
              }}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-app-border py-2.5 text-[11.5px] font-semibold text-app-faint hover:border-app-accent hover:text-app-accent"
            >
              <span className="mi text-[15px]">add</span>슬라이드 추가
            </button>
          )}
        </aside>

        {/* 중앙: 캔버스 + 줌 툴바 */}
        <main className="relative min-w-0 flex-1">
          <div key={motionAnim} className={`h-full w-full ${motionAnim ? `dg-motion-${getMotion(deck.id).effect}` : ""}`}>
          <SlideCanvas
            slide={slide}
            theme={theme}
            readOnly={!canEdit}
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
                      selectedId: useUiStore.getState().selectedElementId ?? undefined,
                    }).catch(() => {});
                  }
                : undefined
            }
            pins={allComments
              .filter((c) => c.slideId === slide?.id && c.x != null && c.y != null)
              .map((c, i) => ({ id: c.id, x: c.x!, y: c.y!, n: i + 1, resolved: c.resolved }))}
            onPinPlace={(x, y) => {
              addComment(deck.id, slide.id, getAnon(deck.id) ? "익명" : getGuestName() || "나", "이 위치 확인 부탁드립니다.", { x, y });
              useUiStore.getState().setPinPicking(false);
              setTab("comments");
              showToast("댓글이 등록됐어요");
            }}
            onPinClickAt={(id, x, y) => setPinPop({ id, x, y })}
            onPinMove={(id, x, y) => { if (!readOnly) moveComment(deck.id, id, x, y); }}
            penMode={penMode}
            penColor={penColor}
            penWidth={effWidth}
            penOpacity={effOpacity}
            penErase={penType === "eraser"}
            onPathDrawn={(d, x, y, w, h, stroke, strokeWidth) => {
              addElement(slide.id, {
                id: uid(),
                type: "path",
                x, y, w, h,
                d, stroke, strokeWidth,
                ...(effOpacity < 1 ? { opacity: effOpacity } : {}),
              });
            }}
          />
          </div>
          {/* 잠긴 슬라이드 안내 배너 */}
          {slideLocked && !readOnly && (
            <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-app-border bg-white/95 px-3.5 py-1.5 text-[11.5px] font-semibold text-app-muted shadow-[0_2px_10px_rgba(0,0,0,.08)] backdrop-blur">
              <span className="mi text-[15px]">lock</span>
              잠긴 슬라이드입니다 — 썸네일의 잠금 해제로 편집하세요
            </div>
          )}
          {/* AI 편집 affordance (스냅덱 — 마퀴→AI 수정) */}
          {canEdit && !motionOpen && (
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
          {/* 미니맵 (좌하단) — 슬라이드 바 클릭 점프 · 접기/펼치기 · 잠금 마커 */}
          <div className="absolute bottom-3.5 left-3.5 z-10 flex items-center gap-1.5 rounded-[11px] border border-app-border bg-white px-2.5 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,.08)]">
            <button
              onClick={() => setMmOpen((v) => !v)}
              title={mmOpen ? "미니맵 접기" : "미니맵 펼치기"}
              className="flex items-center text-app-muted hover:text-app-text"
            >
              <span className="mi text-[15px]">map</span>
            </button>
            {mmOpen &&
              deck.slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentSlideIndex(i)}
                  title={`슬라이드 ${i + 1}${s.locked ? " · 잠김" : ""}`}
                  className={`relative h-4 rounded-[3px] border transition-all ${
                    i === slideIndex
                      ? "w-6 border-[1.5px] border-app-text bg-app-accent-soft"
                      : "w-[18px] border-app-border bg-app-bg hover:border-app-muted"
                  }`}
                >
                  {s.locked && (
                    <span className="mi absolute -top-1 -right-1 text-[9px] leading-none text-app-muted">lock</span>
                  )}
                  {s.notes && s.notes.trim() && !s.locked && (
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-app-accent" />
                  )}
                </button>
              ))}
            <span className="ml-0.5 text-[10.5px] font-semibold text-app-muted">
              {slideIndex + 1} / {deck.slides.length}
            </span>
          </div>
          {/* 이미지 선택 시 컨텍스트 바 (시안) — 자르기·이미지 교체·이미지 생성 */}
          {canEdit && selectedElement?.type === "image" && (
            <div className="absolute bottom-[60px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-[11px] border border-app-border bg-white p-1 shadow-[0_6px_20px_rgba(0,0,0,.12)]">
              <button
                onClick={() => setCropId(selectedElement.id)}
                title="자르기 — 드래그로 영역을 골라 잘라내기"
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-app-muted hover:bg-app-bg hover:text-app-text"
              >
                <span className="mi text-[15px]">crop</span>자르기
              </button>
              <button
                onClick={() =>
                  updateElement(slide.id, selectedElement.id, {
                    fit: selectedElement.fit === "cover" ? "contain" : "cover",
                  } as Partial<SlideElement>)
                }
                title="채우기(cover)/맞춤(contain) 전환"
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-app-muted hover:bg-app-bg hover:text-app-text"
              >
                <span className="mi text-[15px]">{selectedElement.fit === "cover" ? "fit_screen" : "crop_free"}</span>
                {selectedElement.fit === "cover" ? "채우기" : "맞춤"}
              </button>
              <span className="mx-0.5 h-4 w-px bg-app-border" />
              <button
                onClick={() => startReplaceImage(selectedElement.id, "image")}
                title="이미지 교체 (Pexels·GIPHY·업로드)"
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-app-muted hover:bg-app-bg hover:text-app-text"
              >
                <span className="mi text-[15px]">swap_horiz</span>교체
              </button>
              <button
                onClick={() => startReplaceImage(selectedElement.id, "ai")}
                title="AI 이미지 생성으로 교체"
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-app-muted hover:bg-app-bg hover:text-app-text"
              >
                <span className="mi text-[15px]">auto_awesome</span>생성
              </button>
            </div>
          )}
          {/* 하단 중앙 툴바 (시안 도구 스트립) — 선택·손·댓글 / T·도형·미디어·정렬·AI / undo·redo / 줌 */}
          <div className="absolute bottom-3.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-[12px] border border-app-border bg-white p-1 shadow-[0_2px_10px_rgba(0,0,0,.08)]">
            {canEdit && (
              <>
                <button
                  onClick={() => {
                    useUiStore.getState().setSelectedElementId(null);
                    setPenMode(false);
                    setPenPopover(false);
                  }}
                  title="선택 도구"
                  className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 ${
                    penMode ? "text-app-muted hover:bg-app-bg hover:text-app-text" : "bg-app-bg text-app-text"
                  }`}
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
                {/* 펜(자유 드로잉) — 색·굵기 팝오버 */}
                <div className="relative">
                  <button
                    onClick={() => {
                      const next = !penMode;
                      setPenMode(next);
                      setPenPopover(next);
                      if (next) useUiStore.getState().setSelectedElementId(null);
                    }}
                    title="펜 — 화면에 자유롭게 그리기"
                    className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 ${
                      penMode ? "bg-app-text text-white" : "text-app-muted hover:bg-app-bg hover:text-app-text"
                    }`}
                  >
                    <span className="mi text-[17px]">draw</span>
                  </button>
                  {penMode && penPopover && (
                    <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-60 -translate-x-1/2 rounded-xl border border-app-border bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,.16)]">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11.5px] font-bold">펜</span>
                        <button onClick={() => setPenPopover(false)} className="text-app-faint hover:text-app-text"><span className="mi text-[15px]">close</span></button>
                      </div>
                      {/* 펜 종류 5종 (시안) */}
                      <div className="mb-2.5 flex gap-1">
                        {(
                          [
                            ["pen", "edit", "펜"],
                            ["marker", "brush", "마커"],
                            ["highlighter", "ink_highlighter", "형광펜"],
                            ["pencil", "draw", "연필"],
                            ["eraser", "ink_eraser", "지우개"],
                          ] as const
                        ).map(([t, icon, label]) => (
                          <button
                            key={t}
                            onClick={() => setPenType(t)}
                            title={label}
                            className={`flex h-8 flex-1 items-center justify-center rounded-lg border ${
                              penType === t ? "border-app-text bg-app-text text-white" : "border-app-border text-app-muted hover:border-app-accent"
                            }`}
                          >
                            <span className="mi text-[16px]">{icon}</span>
                          </button>
                        ))}
                      </div>
                      <div className="mb-3 grid grid-cols-8 gap-1.5">
                        {["#1A1A1A", "#F5C518", "#F59E0B", "#EA580C", "#DC2626", "#DB2777", "#EC4899", "#7C3AED", "#8B5CF6", "#38BDF8", "#2563EB", "#0EA5A5", "#16A34A", "#9CA3AF", "#FFFFFF"].map((c) => (
                          <button
                            key={c}
                            onClick={() => setPenColor(c)}
                            title={c}
                            className={`h-6 w-6 rounded-full border ${penColor === c ? "ring-2 ring-app-accent ring-offset-1" : "border-black/10"}`}
                            style={{ background: c }}
                          />
                        ))}
                        <label className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-app-border" title="직접 선택">
                          <span className="mi text-[13px] text-app-faint">colorize</span>
                          <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} className="sr-only" />
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-8 text-[11.5px] font-bold">굵기</span>
                        <input
                          type="range" min={1} max={24} value={penWidth}
                          onChange={(e) => setPenWidth(Number(e.target.value))}
                          className="flex-1 accent-[#1A1A1A]"
                        />
                        <span className="w-6 text-right text-[11px] font-semibold text-app-muted">{penWidth}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="w-8 text-[11.5px] font-bold">투명</span>
                        <input
                          type="range" min={10} max={100} value={Math.round(penOpacity * 100)}
                          onChange={(e) => setPenOpacity(Number(e.target.value) / 100)}
                          className="flex-1 accent-[#1A1A1A]"
                        />
                        <span className="w-6 text-right text-[11px] font-semibold text-app-muted">{Math.round(penOpacity * 100)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-center rounded-lg bg-app-bg px-3 py-3">
                        {penType === "eraser" ? (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-app-muted">
                            <span className="mi text-[15px]">ink_eraser</span>획을 클릭해 지우기
                          </span>
                        ) : (
                          <span
                            className="rounded-full"
                            style={{
                              width: "70%",
                              height: Math.max(2, effWidth),
                              background: penColor,
                              opacity: effOpacity,
                              border: penColor === "#FFFFFF" ? "1px solid #ccc" : "none",
                            }}
                          />
                        )}
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        <button
                          onClick={() => {
                            if (!slide) return;
                            const st = useDeckStore.getState();
                            slide.elements
                              .filter((el) => el.type === "path")
                              .forEach((el) => st.removeElement(slide.id, el.id));
                          }}
                          className="flex-1 rounded-[9px] border border-app-border bg-white py-2 text-[12px] font-semibold text-app-muted hover:bg-app-bg"
                        >
                          이 슬라이드 지우기
                        </button>
                        <button
                          onClick={() => {
                            setPenMode(false);
                            setPenPopover(false);
                          }}
                          className="flex-none rounded-[9px] border border-app-border bg-white px-3 py-2 text-[12px] font-semibold hover:bg-app-bg"
                        >
                          완료
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    const on = !useUiStore.getState().pinPicking;
                    useUiStore.getState().setPinPicking(on);
                    if (on) showToast("댓글 위치를 클릭하세요 — 슬라이드 어디든 핀을 찍을 수 있어요");
                  }}
                  title="댓글 핀 — 클릭 후 슬라이드 어디든 찍기"
                  className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 hover:bg-app-bg hover:text-app-text ${pinPicking ? "bg-app-accent text-white" : "text-app-muted"}`}
                >
                  <span className="mi text-[17px]">add_comment</span>
                </button>
                <span className="mx-0.5 h-4 w-px bg-app-border" />
                <button
                  onClick={() => insertElement("text")}
                  title="텍스트 상자"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
                >
                  <span className="mi text-[17px]">title</span>
                </button>
                {/* 스티키 노트 — 색 팔레트에서 색을 고르면 그 색 노트 삽입 */}
                <div className="relative">
                  <button
                    onClick={() => setStickyPop((v) => !v)}
                    title="스티키 노트"
                    className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 hover:bg-app-bg hover:text-app-text ${stickyPop ? "bg-app-bg text-app-text" : "text-app-muted"}`}
                  >
                    <span className="mi text-[17px]">sticky_note_2</span>
                  </button>
                  {stickyPop && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setStickyPop(false)} />
                      <div className="absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-[224px] -translate-x-1/2 rounded-xl border border-app-border bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,.16)]">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="whitespace-nowrap text-[11px] font-bold text-app-faint">스티키 노트</span>
                          <button onClick={() => setStickyPop(false)} className="flex-none text-app-faint hover:text-app-text"><span className="mi text-[15px]">close</span></button>
                        </div>
                        <div className="grid grid-cols-6 gap-1.5">
                          {STICKY_COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => { insertSticky(c); setStickyPop(false); }}
                              title={c}
                              className="h-7 w-7 rounded-md border border-black/10 transition hover:scale-110 hover:ring-2 hover:ring-app-accent"
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {/* YouTube 임베딩 */}
                <button
                  onClick={() => openMedia("youtube")}
                  title="YouTube 임베딩"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
                >
                  <span className="mi text-[17px]">smart_display</span>
                </button>
                {/* 이미지 (업로드·Pexels·GIPHY) */}
                <button
                  onClick={() => openMedia("image")}
                  title="이미지 — 업로드·Pexels·GIPHY"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
                >
                  <span className="mi text-[17px]">image</span>
                </button>
                {/* 라이브러리 (아이콘·이모지·GIF) */}
                <button
                  onClick={() => openMedia("library")}
                  title="아이콘 · 이모지 · GIF"
                  className="flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-app-muted hover:bg-app-bg hover:text-app-text"
                >
                  <span className="mi text-[17px]">folder_open</span>
                </button>
                {/* 도형 드롭다운 (위로 열림) */}
                <Dropdown
                  direction="up"
                  items={[
                    { key: "rect", name: "사각형", icon: shapeIcon("rect") },
                    { key: "circle", name: "원", icon: shapeIcon("circle") },
                    { key: "ellipse", name: "타원", icon: shapeIcon("ellipse") },
                    { key: "triangle", name: "삼각형", icon: shapeIcon("triangle") },
                    { key: "diamond", name: "다이아몬드", icon: shapeIcon("diamond") },
                    { key: "star", name: "별", icon: shapeIcon("star") },
                    { key: "parallelogram", name: "평행사변형", icon: shapeIcon("parallelogram") },
                    { key: "line", name: "선", icon: shapeIcon("line") },
                    { key: "arrow", name: "화살표", icon: shapeIcon("arrow") },
                    { key: "table", name: "표", icon: shapeIcon("table") },
                  ]}
                  onSelect={(key) => insertElement(key)}
                  triggerClassName="flex h-8 items-center justify-center gap-0.5 rounded-lg px-2 text-app-muted hover:bg-app-bg hover:text-app-text data-open:bg-app-bg"
                  title="도형"
                >
                  <span className="mi text-[17px]">square</span><span className="mi text-[13px]">keyboard_arrow_up</span>
                </Dropdown>
                {/* 인터랙티브 위젯 드롭다운 (워크숍 도구) */}
                <Dropdown
                  direction="up"
                  items={[
                    { key: "w-poll", name: "투표(Poll)", icon: <span className="mi text-[16px]">bar_chart</span> },
                    { key: "w-dotvote", name: "닷 보팅", icon: <span className="mi text-[16px]">scatter_plot</span> },
                    { key: "w-timer", name: "타이머", icon: <span className="mi text-[16px]">timer</span> },
                    { key: "w-spinner", name: "돌림판", icon: <span className="mi text-[16px]">casino</span> },
                    { key: "w-alignment", name: "정렬 스케일", icon: <span className="mi text-[16px]">linear_scale</span> },
                    { key: "w-wordcloud", name: "워드클라우드", icon: <span className="mi text-[16px]">cloud</span> },
                  ]}
                  onSelect={(key) => insertElement(key)}
                  triggerClassName="flex h-8 items-center justify-center gap-0.5 rounded-lg px-2 text-app-muted hover:bg-app-bg hover:text-app-text data-open:bg-app-bg"
                  title="인터랙티브 위젯"
                >
                  <span className="mi text-[17px]">widgets</span><span className="mi text-[13px]">keyboard_arrow_up</span>
                </Dropdown>
                {/* 정렬·분배 드롭다운 (위로 열림) */}
                <Dropdown
                  direction="up"
                  items={[
                    { key: "left", name: "왼쪽 정렬", icon: <span className="mi text-[16px]">align_horizontal_left</span> },
                    { key: "hcenter", name: "가로 가운데", icon: <span className="mi text-[16px]">align_horizontal_center</span> },
                    { key: "right", name: "오른쪽 정렬", icon: <span className="mi text-[16px]">align_horizontal_right</span> },
                    { key: "top", name: "위 정렬", icon: <span className="mi text-[16px]">align_vertical_top</span> },
                    { key: "vcenter", name: "세로 가운데", icon: <span className="mi text-[16px]">align_vertical_center</span> },
                    { key: "bottom", name: "아래 정렬", icon: <span className="mi text-[16px]">align_vertical_bottom</span> },
                    { key: "disth", name: "가로 분배", icon: <span className="mi text-[16px]">horizontal_distribute</span> },
                    { key: "distv", name: "세로 분배", icon: <span className="mi text-[16px]">vertical_distribute</span> },
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
                  onClick={() => openMedia("ai")}
                  title="AI 이미지 생성"
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
          {/* 하단 우측 페이지 네비 (시안) — 이전/다음 슬라이드 */}
          <div className="absolute bottom-3.5 right-4 z-10 flex items-center gap-1 rounded-[10px] border border-app-border bg-white p-1 shadow-[0_2px_10px_rgba(0,0,0,.08)]">
            <button
              onClick={() => setCurrentSlideIndex(Math.max(0, slideIndex - 1))}
              disabled={slideIndex === 0}
              title="이전 슬라이드"
              className="flex h-7 w-7 items-center justify-center rounded-md text-app-muted hover:bg-app-bg disabled:text-[#D4D4CE]"
            >
              <span className="mi text-[18px]">chevron_left</span>
            </button>
            <span className="min-w-11 px-1 text-center text-[12px] font-semibold">
              {slideIndex + 1} / {deck.slides.length}
            </span>
            <button
              onClick={() => setCurrentSlideIndex(Math.min(deck.slides.length - 1, slideIndex + 1))}
              disabled={slideIndex >= deck.slides.length - 1}
              title="다음 슬라이드"
              className="flex h-7 w-7 items-center justify-center rounded-md text-app-muted hover:bg-app-bg disabled:text-[#D4D4CE]"
            >
              <span className="mi text-[18px]">chevron_right</span>
            </button>
          </div>
          {/* 캔버스 위 댓글 핀 팝오버 (E4) */}
          {pinPop && (() => {
            const c = allComments.find((x) => x.id === pinPop.id);
            if (!c) return null;
            return (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPinPop(null)} />
                <div
                  className="fixed z-50 w-72 rounded-xl border border-app-border bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,.18)]"
                  style={{ left: Math.min(pinPop.x, window.innerWidth - 300), top: Math.min(pinPop.y + 10, window.innerHeight - 220) }}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-app-text text-[9px] font-bold text-white">{c.author[0]}</span>
                    <span className="text-[11.5px] font-semibold">{c.author}</span>
                    {c.resolved && <span className="rounded bg-app-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-app-text">해결</span>}
                    <span className="flex-1" />
                    <button onClick={() => setPinPop(null)} className="text-app-faint hover:text-app-text"><span className="mi text-[15px]">close</span></button>
                  </div>
                  <p className="text-[12px] leading-relaxed text-app-muted">{c.text}</p>
                  {c.replies.map((r) => (
                    <div key={r.id} className="mt-1.5 ml-2 border-l-2 border-app-border-soft pl-2 text-[11.5px]">
                      <b className="text-[10.5px]">{r.author}</b> <span className="text-app-muted">{r.text}</span>
                    </div>
                  ))}
                  {!readOnly && (
                    <>
                      <input
                        placeholder="답글 달기… (Enter)"
                        onKeyDown={(e) => {
                          const v = (e.target as HTMLInputElement).value.trim();
                          if (e.key === "Enter" && v) {
                            addReply(deck.id, c.id, getAnon(deck.id) ? "익명" : getGuestName() || "나", v);
                            (e.target as HTMLInputElement).value = "";
                          }
                        }}
                        className="mt-2 w-full rounded-md border border-app-border px-2 py-1.5 text-[11.5px] focus:border-app-accent focus:outline-none"
                      />
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button onClick={() => toggleResolve(deck.id, c.id)} className="text-[10.5px] font-semibold text-app-text">{c.resolved ? "다시 열기" : "해결"}</button>
                        <button onClick={() => { deleteComment(deck.id, c.id); setPinPop(null); }} className="text-[10.5px] font-semibold text-app-danger">삭제</button>
                        <span className="flex-1" />
                        <button onClick={() => { setTab("comments"); setPinPop(null); }} className="text-[10.5px] font-semibold text-app-muted hover:text-app-accent">전체 댓글 →</button>
                      </div>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </main>

        {/* 우측: 탭 패널 */}
        <aside className="flex w-[312px] shrink-0 flex-col border-l border-app-border bg-app-surface">
          <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-app-border px-2 pt-2">
            {(
              [
                ["chat", "AI 채팅"],
                ["props", "속성"],
                ["notes", "노트"],
                ["comments", "댓글"],
                ["library", "라이브러리"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-2 text-[12.5px] font-semibold ${
                  tab === key
                    ? "border-b-2 border-app-accent text-app-text"
                    : "border-b-2 border-transparent text-app-faint hover:text-app-text"
                }`}
              >
                {key === "library" && <span className="mi text-[15px]">photo_library</span>}
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
                  onReplaceImage={startReplaceImage}
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
            {tab === "library" && (
              <LibraryPanel
                dims={dims}
                readOnly={readOnly}
                onInsert={(el) => {
                  addElement(slide.id, el);
                  useUiStore.getState().setSelectedElementId(el.id);
                }}
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
