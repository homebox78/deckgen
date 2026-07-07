import type { ReactNode } from "react";

export type BadgeStatus = "queued" | "generating" | "done" | "error";

const STYLES: Record<BadgeStatus, { cls: string; dot: string; pulse: boolean }> = {
  queued: {
    cls: "text-app-muted bg-app-bg border-app-border",
    dot: "#B4B4AE",
    pulse: false,
  },
  generating: {
    cls: "text-app-accent bg-app-accent-soft border-app-accent-border",
    dot: "#1A1A1A",
    pulse: true,
  },
  done: {
    // 모노크롬 v2 — 완료는 유채색 대신 중립색
    cls: "text-app-text bg-app-accent-soft border-app-border",
    dot: "#1A1A1A",
    pulse: false,
  },
  error: {
    cls: "text-app-danger bg-app-danger-soft border-app-danger-border",
    dot: "#E5484D",
    pulse: false,
  },
};

/** 디자인 시안(1a·04)의 상태 배지 — 색+텍스트 항상 병기 */
export function StatusBadge({
  status,
  children,
  size = "md",
  showDot = true,
}: {
  status: BadgeStatus;
  children: ReactNode;
  size?: "sm" | "md";
  showDot?: boolean;
}) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${s.cls} ${
        size === "sm" ? "gap-1 px-2 py-0.5 text-[9.5px]" : "gap-1.5 px-2.5 py-1 text-[11.5px]"
      }`}
    >
      {showDot && (
        <span
          className={`rounded-full ${size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5"} ${
            s.pulse ? "animate-dg-pulse" : ""
          }`}
          style={{ background: s.dot }}
        />
      )}
      {children}
    </span>
  );
}
