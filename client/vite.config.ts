import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  // 운영 배포는 hom2box.com/deckGen 서브디렉터리, dev는 루트
  base: command === "build" ? "/deckGen/" : "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      // powerPlus 자산 라이브러리 연동 — dev에서 동일출처처럼 호출(운영은 hom2box.com 동일출처)
      "/powerPlus": {
        target: "https://hom2box.com",
        changeOrigin: true,
        secure: true,
      },
      // 이모지 이미지 시리즈 — dev에서도 라이브 매니페스트/이미지 확인용
      "/emoji": {
        target: "https://hom2box.com/deckGen",
        changeOrigin: true,
        secure: true,
      },
    },
  },
}));
