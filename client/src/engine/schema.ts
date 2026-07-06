// §3 DeckSchema — 단일 중간 표현(Single Source of Truth)
// AI가 생성/수정하고, Fabric이 렌더링하며, pptxgenjs가 변환하는 유일한 원본.

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

// ===== 최상위 =====
export interface Deck {
  id: string;
  title: string;
  themeId: string;
  aspect: "16:9";
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

export interface Slide {
  id: string;
  layout: LayoutId;
  elements: SlideElement[]; // 배열 순서 = z-order
  notes?: string;
}

// ===== 요소 =====
export type SlideElement = TextElement | ShapeElement | ChartElement | ImageElement;

export interface ElementBase {
  id: string;
  x: number;
  y: number; // 1920×1080 좌표계, 좌상단 기준
  w: number;
  h: number;
  rotation?: number; // deg
  opacity?: number; // 0~1
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
}

export type ShapeKind = "rect" | "roundRect" | "ellipse" | "line" | "arrow";

export interface ShapeElement extends ElementBase {
  type: "shape";
  shape: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number; // roundRect 전용
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
  src: string; // MVP: dataURL만 지원
  fit: "cover" | "contain";
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
export type VizType = "bar" | "line" | "pie" | "kpi-cards" | "process";

export interface OutlineSlide {
  index: number;
  title: string;
  bullets: string[];
  viz: { type: VizType; note: string } | null;
}

export function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}
