import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 별도 앱: hom2box.com/chalk 서브경로 배포. API는 DeckGen 공유 PHP 서버(/deckGen/api/st/*).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/chalk/" : "/",
  plugins: [react()],
  server: {
    port: 5199,
    proxy: {
      // dev에서도 라이브 공유 서버(PHP)를 그대로 사용 → 로컬 PHP 불필요
      "/deckGen": { target: "https://hom2box.com", changeOrigin: true, secure: true },
    },
  },
}));
