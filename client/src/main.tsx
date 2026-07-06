import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./index.css";
import { App } from "./app/App";
import { useDeckStore } from "./store/deckStore";

if (import.meta.env.DEV) {
  // E2E 검증/디버깅용 (dev 빌드 전용)
  (window as unknown as Record<string, unknown>).__deckgen = { useDeckStore };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
