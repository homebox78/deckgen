// 사용자 설정 (Demo Act 7 설정 모달) — localStorage 기반. 계정 없는 MVP라 로컬 저장.
import { useSyncExternalStore } from "react";

export interface UserSettings {
  genLang: "ko" | "en" | "ja" | "mix";
  defaultThemeId: string;
  defaultCount: number;
  transition: "none" | "slide" | "fade" | "zoom";
  showNotes: boolean;
  genSpeed: "slow" | "normal" | "fast";
  brandLogo: string;
  brandAccent: string; // "" = 테마 기본
  brandFooter: boolean;
  brandFooterText: string;
  plan: "Free" | "Beginner" | "Plus" | "Pro";
  onboardingDone: boolean;
}

const KEY = "deckgen:settings";

const DEFAULT: UserSettings = {
  genLang: "ko",
  defaultThemeId: "clean-light",
  defaultCount: 5,
  transition: "fade",
  showNotes: true,
  genSpeed: "normal",
  brandLogo: "",
  brandAccent: "",
  brandFooter: false,
  brandFooterText: "",
  plan: "Free",
  onboardingDone: false,
};

function read(): UserSettings {
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<UserSettings>) };
  } catch {
    return DEFAULT;
  }
}

let cache = read();
const listeners = new Set<() => void>();

export function getSettings(): UserSettings {
  return cache;
}

export function patchSettings(patch: Partial<UserSettings>): void {
  cache = { ...cache, ...patch };
  localStorage.setItem(KEY, JSON.stringify(cache));
  // 전환 효과는 발표 모드가 별도 키를 읽으므로 동기화
  if (patch.transition) localStorage.setItem("deckgen:transition", patch.transition);
  listeners.forEach((l) => l());
}

export function useSettings(): UserSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cache,
  );
}
