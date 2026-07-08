// §3 DeckSchema — 단일 중간 표현(Single Source of Truth)
// AI가 생성/수정하고, Fabric이 렌더링하며, pptxgenjs가 변환하는 유일한 원본.

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

// ===== 비율 (16:9 발표 · 4:3 클래식 · 4:5 카드뉴스 캐러셀) =====
export type DeckAspect = "16:9" | "4:3" | "4:5";

export interface SlideDims {
  w: number;
  h: number;
}

export const ASPECT_DIMS: Record<DeckAspect, SlideDims> = {
  "16:9": { w: 1920, h: 1080 },
  "4:3": { w: 1440, h: 1080 }, // 클래식 발표 비율
  "4:5": { w: 1080, h: 1350 }, // 인스타그램 캐러셀 기준 캔버스
};

export function aspectDims(aspect: DeckAspect | undefined): SlideDims {
  return ASPECT_DIMS[aspect ?? "16:9"] ?? ASPECT_DIMS["16:9"];
}

// ===== 최상위 =====
export interface Deck {
  id: string;
  title: string;
  themeId: string;
  aspect: DeckAspect;
  slides: Slide[];
  createdAt: number;
  updatedAt: number;
}

export type LayoutId =
  | "cover"
  | "title-bullets"
  | "title-bullets-chart"
  | "chart-focus"
  | "kpi-cards"
  | "two-column"
  | "section";

export type SlideBackground = "theme" | "tint" | "gradient" | "spot";

export interface Slide {
  id: string;
  layout: LayoutId;
  elements: SlideElement[]; // 배열 순서 = z-order
  notes?: string;
  background?: SlideBackground; // 미지정 시 "theme" (테마 bg)
  section?: string; // 섹션 이름 (개요/썸네일에서 구분)
  locked?: boolean; // 슬라이드 잠금 — 요소 추가·펜·편집 전부 차단(소유자만 해제)
}

// ===== 요소 =====
export type SlideElement =
  | TextElement
  | ShapeElement
  | ChartElement
  | ImageElement
  | TableElement
  | PathElement
  | WidgetElement;

export interface ElementBase {
  id: string;
  x: number;
  y: number; // 1920×1080 좌표계, 좌상단 기준
  w: number;
  h: number;
  rotation?: number; // deg
  opacity?: number; // 0~1
  locked?: boolean; // 잠금 — 캔버스 이동/크기/회전/삭제 차단 (선택·속성 패널 해제는 가능)
  shadow?: boolean; // 그림자 효과 (Appearance)
  groupId?: string; // 그룹 — 같은 groupId 요소는 함께 선택/이동 (Ctrl+G)
}

export type TextRole =
  | "title"
  | "subtitle"
  | "heading"
  | "body"
  | "caption"
  | "kpi-value"
  | "kpi-label";

export interface TextElement extends ElementBase {
  type: "text";
  text: string; // 줄바꿈은 \n
  role: TextRole;
  align?: "left" | "center" | "right";
  color?: string; // 미지정 시 테마의 role 기본색
  fontSize?: number; // 미지정 시 role 기본값
  fontWeight?: number;
  lineHeight?: number; // 배수, 기본 1.4
  letterSpacing?: number; // px (자간)
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export type ShapeKind =
  | "rect"
  | "roundRect"
  | "ellipse"
  | "line"
  | "arrow"
  | "pie"
  | "triangle"
  | "diamond"
  | "star"
  | "pill"
  | "parallelogram";

export interface ShapeElement extends ElementBase {
  type: "shape";
  shape: ShapeKind;
  fill?: string;
  fillType?: "solid" | "linear" | "circular"; // 미지정 시 solid
  fillTo?: string; // gradient 끝 색 (미지정 시 fill을 어둡게)
  stroke?: string;
  strokeWidth?: number;
  radius?: number; // roundRect 전용
  slope?: "down" | "up"; // line 전용 — 대각선(좌상→우하 / 좌하→우상). 미지정 시 수평
  angleStart?: number; // pie 전용 — 시작각 deg (0°=3시, 시계방향)
  angleEnd?: number; // pie 전용 — 끝각 deg
}

export type ChartType = "bar" | "line" | "pie";

export interface ChartElement extends ElementBase {
  type: "chart";
  chartType: ChartType;
  title?: string;
  labels: string[];
  series: { name: string; values: number[] }[];
}

export interface ImageElement extends ElementBase {
  type: "image";
  src: string; // MVP: dataURL만 지원 (YouTube는 썸네일 dataURL)
  fit: "cover" | "contain";
  youtubeId?: string; // 지정 시 발표 모드에서 재생 가능한 iframe으로 임베드
}

export interface TableElement extends ElementBase {
  type: "table";
  rows: string[][]; // [행][열] 셀 텍스트
  headerRow?: boolean; // 첫 행을 헤더로 강조
}

// 펜(자유 드로잉) — Fabric PencilBrush로 그린 획. d = SVG path 문자열.
export interface PathElement extends ElementBase {
  type: "path";
  d: string; // SVG path 데이터 (절대 좌표, 1920×1080 기준)
  stroke: string; // 선 색 (hex 또는 테마 토큰)
  strokeWidth: number;
}

// 인터랙티브 워크숍 위젯 (Miro식) — 캔버스 위 HTML 오버레이로 실동작, 상태는 스키마에 저장돼 협업 동기화.
export type WidgetKind = "poll" | "dotvote" | "timer" | "spinner" | "alignment" | "wordcloud";
export interface WidgetOption {
  id: string;
  label: string;
  votes: number;
  color?: string;
}
export interface WordEntry {
  text: string;
  count: number;
}
export interface WidgetElement extends ElementBase {
  type: "widget";
  widget: WidgetKind;
  title: string;
  options?: WidgetOption[]; // poll · dotvote · spinner
  seconds?: number; // timer 총 시간(초)
  endsAt?: number | null; // timer 실행 중 종료 epoch(ms), 정지면 null
  remainingMs?: number | null; // timer 일시정지 시 남은 ms
  scaleValue?: number; // alignment 0~100 (마커 위치)
  scaleLeft?: string; // alignment 좌측 라벨
  scaleRight?: string; // alignment 우측 라벨
  result?: string | null; // spinner 결과 option id
  words?: WordEntry[]; // wordcloud — 단어별 빈도(크기)
}

// ===== 레이아웃 엔진 입력 (§5, §8.2) =====
export interface ChartContent {
  chartType: ChartType;
  title?: string;
  labels: string[];
  series: { name: string; values: number[] }[];
}

export interface SlideContent {
  title?: string;
  subtitle?: string; // cover 전용
  presenter?: string; // cover 전용
  bullets?: string[];
  chart?: ChartContent;
  kpis?: { value: string; label: string }[];
  columns?: { heading: string; bullets: string[] }[]; // two-column 전용
}

// ===== AI 파이프라인 (§8) =====
export type VizType = "bar" | "line" | "pie" | "kpi-cards" | "process" | "image" | "table";

export interface OutlineSlide {
  index: number;
  title: string;
  bullets: string[];
  viz: { type: VizType; note: string } | null;
}

export function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}
