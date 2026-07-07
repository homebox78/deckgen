import dotenv from "dotenv";
import express from "express";
import { loadConfigPhp } from "./config.js";

// 우선순위: 환경변수(.env) > server/config/config.php (키 관리 단일 소스)
dotenv.config();
dotenv.config({ path: "../.env" });
loadConfigPhp(); // anthropic_api_key → ANTHROPIC_API_KEY 등 주입

const { aiRouter } = await import("./routes/ai.js"); // env 로드 후 임포트
const { collabRouter } = await import("./routes/collab.js");
const { authRouter } = await import("./routes/auth.js");
const { adminRouter, publicAppRouter } = await import("./routes/admin.js");

const app = express();
app.use(express.json({ limit: "25mb" })); // 덱에 이미지 dataURL 포함 가능

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use("/api", collabRouter); // 협업은 rate limit 없이 — aiRouter보다 먼저
app.use("/api", authRouter); // 이메일 인증 (자체 rate limit 보유)
app.use("/api", publicAppRouter); // 배너·템플릿 공개 조회
app.use("/api", adminRouter); // 관리자 콘솔 (§14)
app.use("/api", aiRouter);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
