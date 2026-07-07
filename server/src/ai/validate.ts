// AI 응답 zod 검증 — 클라이언트 schema.ts(§3)와 동일 구조
import { z } from "zod";

export const vizTypeSchema = z.enum(["bar", "line", "pie", "kpi-cards", "process"]);

export const outlineSlideSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  bullets: z.array(z.string()).max(8).default([]),
  viz: z
    .object({ type: vizTypeSchema, note: z.string().default("") })
    .nullable()
    .default(null),
});
export type OutlineSlide = z.infer<typeof outlineSlideSchema>;

export const layoutIdSchema = z.enum([
  "cover",
  "title-bullets",
  "title-bullets-chart",
  "chart-focus",
  "kpi-cards",
  "two-column",
  "section",
]);

export const chartContentSchema = z.object({
  chartType: z.enum(["bar", "line", "pie"]),
  title: z.string().optional(),
  labels: z.array(z.string()).min(1).max(8),
  series: z
    .array(z.object({ name: z.string(), values: z.array(z.number()) }))
    .min(1)
    .max(3),
});

export const slideContentSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  presenter: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  chart: chartContentSchema.optional(),
  kpis: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  columns: z
    .array(z.object({ heading: z.string(), bullets: z.array(z.string()) }))
    .optional(),
});

export const slideSpecSchema = z.object({
  index: z.number().int().nonnegative(),
  layout: layoutIdSchema,
  content: slideContentSchema,
});
export type SlideSpec = z.infer<typeof slideSpecSchema>;

// ===== §3 Slide 전체 (edit 엔드포인트용) =====
const elementBase = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  locked: z.boolean().optional(),
  shadow: z.boolean().optional(),
};

const textElementSchema = z.object({
  ...elementBase,
  type: z.literal("text"),
  text: z.string(),
  role: z.enum([
    "title",
    "subtitle",
    "heading",
    "body",
    "caption",
    "kpi-value",
    "kpi-label",
  ]),
  align: z.enum(["left", "center", "right"]).optional(),
  color: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.number().optional(),
  lineHeight: z.number().optional(),
  letterSpacing: z.number().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike: z.boolean().optional(),
});

const shapeElementSchema = z.object({
  ...elementBase,
  type: z.literal("shape"),
  shape: z.enum([
    "rect",
    "roundRect",
    "ellipse",
    "line",
    "arrow",
    "pie",
    "triangle",
    "diamond",
    "star",
    "pill",
  ]),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  radius: z.number().optional(),
  slope: z.enum(["down", "up"]).optional(), // line 대각선
  angleStart: z.number().optional(), // pie 전용
  angleEnd: z.number().optional(),
});

const chartElementSchema = z.object({
  ...elementBase,
  type: z.literal("chart"),
  chartType: z.enum(["bar", "line", "pie"]),
  title: z.string().optional(),
  labels: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
});

const imageElementSchema = z.object({
  ...elementBase,
  type: z.literal("image"),
  src: z.string(),
  fit: z.enum(["cover", "contain"]),
});

export const slideElementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  shapeElementSchema,
  chartElementSchema,
  imageElementSchema,
]);

export const slideSchema = z.object({
  id: z.string().min(1),
  layout: layoutIdSchema,
  elements: z.array(slideElementSchema),
  notes: z.string().optional(),
  background: z.enum(["theme", "tint", "gradient", "spot"]).optional(),
  section: z.string().optional(),
});
export type ServerSlide = z.infer<typeof slideSchema>;

// ===== §12 공유/협업 — 덱 전체 =====
export const deckSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(300),
  themeId: z.string().max(64),
  aspect: z.enum(["16:9", "4:3", "4:5"]),
  slides: z.array(slideSchema).min(1).max(60),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ServerDeck = z.infer<typeof deckSchema>;
