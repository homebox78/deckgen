// §6.2 슬라이드 테마 (내장 4종)
import type { TextRole } from "./schema";

export interface ThemeColors {
  bg: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
}

export interface RoleStyle {
  fontSize: number;
  fontWeight: number;
  color: keyof ThemeColors;
}

export interface Theme extends ThemeColors {
  id: string;
  name: string;
  chartPalette: string[]; // 4색
  fontFamily: string;
  roleStyles: Record<TextRole, RoleStyle>;
}

// role 기본 크기: title 72 / subtitle 36 / heading 44 / body 28 / caption 20 / kpi-value 64 / kpi-label 22
const baseRoleStyles: Record<TextRole, RoleStyle> = {
  title: { fontSize: 72, fontWeight: 700, color: "textPrimary" },
  subtitle: { fontSize: 36, fontWeight: 400, color: "textSecondary" },
  heading: { fontSize: 44, fontWeight: 700, color: "textPrimary" },
  body: { fontSize: 28, fontWeight: 400, color: "textPrimary" },
  caption: { fontSize: 20, fontWeight: 400, color: "textSecondary" },
  "kpi-value": { fontSize: 64, fontWeight: 700, color: "accent" },
  "kpi-label": { fontSize: 22, fontWeight: 400, color: "textSecondary" },
};

const FONT = "Pretendard";

export const themes: Record<string, Theme> = {
  "clean-light": {
    id: "clean-light",
    name: "Clean Light",
    bg: "#FFFFFF",
    surface: "#F3F5F9",
    textPrimary: "#111827",
    textSecondary: "#6B7280",
    accent: "#2563EB",
    chartPalette: ["#2563EB", "#10B981", "#F59E0B", "#EF4444"],
    fontFamily: FONT,
    roleStyles: baseRoleStyles,
  },
  "ink-dark": {
    id: "ink-dark",
    name: "Ink Dark",
    bg: "#14141A",
    surface: "#232330",
    textPrimary: "#F5F6FA",
    textSecondary: "#9CA0B4",
    accent: "#7C9CFF",
    chartPalette: ["#7C9CFF", "#5FD9C4", "#FFC66B", "#FF7A90"],
    fontFamily: FONT,
    roleStyles: baseRoleStyles,
  },
  "warm-craft": {
    id: "warm-craft",
    name: "Warm Craft",
    bg: "#FAF6EF",
    surface: "#F0E7D8",
    textPrimary: "#3B2F24",
    textSecondary: "#8A7B69",
    accent: "#C25E3A",
    chartPalette: ["#C25E3A", "#7A9E7E", "#D9A441", "#5C7A99"],
    fontFamily: FONT,
    roleStyles: baseRoleStyles,
  },
  "violet-bold": {
    id: "violet-bold",
    name: "Violet Bold",
    bg: "#0F0B1E",
    surface: "#1E1534",
    textPrimary: "#F2EFFF",
    textSecondary: "#A79FC4",
    accent: "#8B6BFF",
    chartPalette: ["#8B6BFF", "#4FD1C5", "#FFB86B", "#FF6B9C"],
    fontFamily: FONT,
    roleStyles: baseRoleStyles,
  },
};

export const DEFAULT_THEME_ID = "clean-light";

export function getTheme(themeId: string): Theme {
  return themes[themeId] ?? themes[DEFAULT_THEME_ID];
}

export function resolveRoleColor(theme: Theme, role: TextRole): string {
  return theme[theme.roleStyles[role].color];
}

const COLOR_TOKENS: Record<string, keyof ThemeColors> = {
  "@bg": "bg",
  "@surface": "surface",
  "@accent": "accent",
  "@textPrimary": "textPrimary",
  "@textSecondary": "textSecondary",
};

/** hex 또는 테마 토큰("@surface" 등)을 실제 hex로 해석 */
export function resolveColor(theme: Theme, value: string): string {
  const key = COLOR_TOKENS[value];
  return key ? theme[key] : value;
}
