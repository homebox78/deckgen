import dotenv from "dotenv";
import express from "express";

// 서버 자체 .env 우선, 없으면 모노레포 루트 .env 사용
dotenv.config();
dotenv.config({ path: "../.env" });

const { aiRouter } = await import("./routes/ai.js"); // env 로드 후 임포트
const { collabRouter } = await import("./routes/collab.js");

const app = express();
app.use(express.json({ limit: "25mb" })); // 덱에 이미지 dataURL 포함 가능

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use("/api", collabRouter); // 협업은 rate limit 없이 — aiRouter보다 먼저
app.use("/api", aiRouter);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
