// 미디어 삽입 (Demo Act 5.5) — 이미지 업로드 · YouTube · Pexels · GIPHY · 아이콘/이모지 · AI 이미지
// 삽입 결과는 §3 스키마의 ImageElement(dataURL) 또는 TextElement(이모지)로 캔버스에 추가
import { useRef, useState } from "react";
import { apiUrl } from "../../api/base";
import type { ImageElement, SlideDims, SlideElement, TextElement } from "../../engine/schema";
import { uid } from "../../engine/schema";
import { showToast } from "../ui/toast";

type Tab = "image" | "youtube" | "stock" | "library" | "ai";

const TABS: { id: Tab; label: string }[] = [
  { id: "image", label: "이미지 업로드" },
  { id: "youtube", label: "YouTube" },
  { id: "stock", label: "Pexels" },
  { id: "library", label: "아이콘·이모지·GIF" },
  { id: "ai", label: "AI 이미지" },
];

const EMOJIS = "😀 🚀 💡 📊 📈 ✅ ⭐ 🔥 💰 🎯 🏆 📌 🔔 💬 📎 🎨 🌱 ⚡ 🧩 🛠️ 📅 🔍 💎 🌟".split(" ");
const ICON_PATHS: Record<string, string> = {
  체크: "M20 6L9 17l-5-5",
  화살표: "M5 12h14M13 6l6 6-6 6",
  하트: "M12 21s-8-5.5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.5-8 11-8 11z",
  별: "M12 2l3 6.5 7 .6-5.3 4.6L18 21l-6-3.6L6 21l1.3-7.3L2 9.1l7-.6z",
  전구: "M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0012 3z",
  종: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
};

// Pexels/GIPHY 시뮬레이션용 그라디언트 (실 연동 전)
const STOCK = [
  { label: "매장 전경", from: "#F0894C", to: "#C43E1C" },
  { label: "상담 장면", from: "#6D8DFF", to: "#3B5BDB" },
  { label: "시장 골목", from: "#38B48E", to: "#1A7F5A" },
  { label: "카페 운영", from: "#C25E3A", to: "#8A3E22" },
  { label: "장부 정리", from: "#8B6BFF", to: "#5B3BC4" },
  { label: "배송 준비", from: "#F0566A", to: "#C4283E" },
  { label: "온라인 판매", from: "#2563EB", to: "#1A47B8" },
  { label: "팀 회의", from: "#14B8A6", to: "#0D8276" },
];

/** 그라디언트 이미지를 캔버스로 그려 dataURL 생성 (스톡/AI 시뮬레이션) */
function gradientDataURL(from: string, to: string, w = 800, h = 500, label?: string): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (label) {
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.font = "600 34px Pretendard, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, w / 2, h / 2);
  }
  return c.toDataURL("image/png");
}

function iconDataURL(path: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

export function MediaPicker({
  dims,
  onInsert,
  onClose,
}: {
  dims: SlideDims;
  onInsert: (el: SlideElement) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("image");
  const [libTab, setLibTab] = useState<"icon" | "emoji" | "gif">("icon");
  const [ytUrl, setYtUrl] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cx = dims.w / 2;
  const cy = dims.h / 2;

  const insertImage = (src: string, w = 720, h = 450, fit: "cover" | "contain" = "cover") => {
    const el: ImageElement = {
      id: uid(),
      type: "image",
      src,
      fit,
      x: cx - w / 2,
      y: cy - h / 2,
      w,
      h,
    };
    onInsert(el);
    onClose();
  };

  const insertEmoji = (emoji: string) => {
    const el: TextElement = {
      id: uid(),
      type: "text",
      text: emoji,
      role: "title",
      fontSize: 160,
      align: "center",
      x: cx - 120,
      y: cy - 120,
      w: 240,
      h: 240,
    };
    onInsert(el);
    onClose();
  };

  const onFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      showToast("이미지 파일만 업로드할 수 있어요");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => insertImage(reader.result as string);
    reader.readAsDataURL(f);
  };

  const insertYoutube = () => {
    const m = ytUrl.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    if (!m) {
      showToast("유효한 YouTube 링크를 입력하세요");
      return;
    }
    // 썸네일을 이미지로 삽입 (재생 오버레이 포함 dataURL 합성)
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 1280, 720);
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(640, 360, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#E5484D";
      ctx.beginPath();
      ctx.moveTo(618, 325);
      ctx.lineTo(618, 395);
      ctx.lineTo(678, 360);
      ctx.closePath();
      ctx.fill();
      insertImage(c.toDataURL("image/png"), 800, 450, "cover");
    };
    img.onerror = () => insertImage(gradientDataURL("#1A1A1A", "#55554F", 800, 450, "▶ YouTube"), 800, 450);
    img.src = `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
  };

  const genAi = async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await fetch(apiUrl("/api/ai-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      const j = (await res.json()) as { image?: string; error?: string };
      if (res.ok && j.image) {
        insertImage(j.image, 720, 720, "cover");
        return;
      }
      // 키 없거나 실패 → 그라디언트 플레이스홀더
      insertImage(gradientDataURL("#8B6BFF", "#3B5BDB", 720, 720, "AI 이미지"), 720, 720);
    } catch {
      insertImage(gradientDataURL("#8B6BFF", "#3B5BDB", 720, 720, "AI 이미지"), 720, 720);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.45)]"
      onClick={onClose}
    >
      <div
        className="flex h-[520px] w-[640px] max-w-[94vw] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 border-b border-app-border px-3 pt-2.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-[12.5px] font-semibold ${
                tab === t.id
                  ? "border-b-2 border-app-accent text-app-text"
                  : "border-b-2 border-transparent text-app-faint hover:text-app-text"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={onClose} className="px-2 text-[15px] text-app-faint hover:text-app-text">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "image" && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFile(e.dataTransfer.files?.[0]);
              }}
              className="flex h-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-app-border text-center hover:border-app-accent"
            >
              <span className="text-[32px]">🖼️</span>
              <p className="text-[13px] font-semibold">이미지를 드래그하거나 클릭해 업로드</p>
              <p className="text-[11.5px] text-app-faint">PNG · JPG · GIF · WEBP</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
          )}

          {tab === "youtube" && (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] text-app-muted">YouTube 링크를 붙여넣으면 썸네일을 삽입합니다.</p>
              <input
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && insertYoutube()}
                placeholder="https://youtube.com/watch?v=..."
                className="rounded-lg border border-app-border px-3.5 py-2.5 text-[13px] focus:border-app-accent focus:outline-none"
              />
              <button
                onClick={insertYoutube}
                className="self-start rounded-lg bg-app-text px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90"
              >
                임베딩 삽입
              </button>
            </div>
          )}

          {tab === "stock" && (
            <>
              <p className="mb-3 text-[12px] text-app-faint">
                스톡 이미지 (Pexels 연동 — 현재 시뮬레이션 타일)
              </p>
              <div className="grid grid-cols-4 gap-2.5">
                {STOCK.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => insertImage(gradientDataURL(s.from, s.to, 800, 600, s.label), 640, 480)}
                    className="flex aspect-[4/3] items-end justify-start rounded-lg p-2 text-[10.5px] font-semibold text-white/90"
                    style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "library" && (
            <>
              <div className="mb-3 flex gap-1">
                {(["icon", "emoji", "gif"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setLibTab(t)}
                    className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${
                      libTab === t ? "bg-app-accent-soft text-app-accent" : "bg-app-bg text-app-faint"
                    }`}
                  >
                    {t === "icon" ? "아이콘" : t === "emoji" ? "이모지" : "GIPHY"}
                  </button>
                ))}
              </div>
              {libTab === "emoji" && (
                <div className="grid grid-cols-8 gap-1.5">
                  {EMOJIS.map((e, i) => (
                    <button
                      key={i}
                      onClick={() => insertEmoji(e)}
                      className="flex aspect-square items-center justify-center rounded-lg text-[24px] hover:bg-app-bg"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              {libTab === "icon" && (
                <div className="grid grid-cols-6 gap-2">
                  {Object.entries(ICON_PATHS).map(([name, path]) => (
                    <button
                      key={name}
                      onClick={() => insertImage(iconDataURL(path), 200, 200, "contain")}
                      title={name}
                      className="flex aspect-square items-center justify-center rounded-lg border border-app-border hover:border-app-accent"
                    >
                      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#1A1A1A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d={path} />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
              {libTab === "gif" && (
                <>
                  <div className="grid grid-cols-4 gap-2.5">
                    {STOCK.slice(0, 4).map((s) => (
                      <button
                        key={s.label}
                        onClick={() => insertImage(gradientDataURL(s.to, s.from, 480, 480, "GIF"), 400, 400)}
                        className="aspect-square rounded-lg"
                        style={{ background: `linear-gradient(45deg, ${s.from}, ${s.to})` }}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] font-semibold tracking-wide text-app-faint">
                    POWERED BY GIPHY (시뮬레이션)
                  </p>
                </>
              )}
            </>
          )}

          {tab === "ai" && (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] text-app-muted">
                프롬프트로 이미지를 생성합니다. (config.php openai_model 키 사용 · 없으면 그라디언트 대체)
              </p>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={3}
                placeholder="예: 소상공인 카페 인테리어, 따뜻한 조명, 미니멀"
                className="resize-none rounded-lg border border-app-border px-3.5 py-2.5 text-[13px] focus:border-app-accent focus:outline-none"
              />
              <button
                onClick={() => void genAi()}
                disabled={aiBusy}
                className="self-start rounded-lg bg-app-text px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {aiBusy ? "생성 중…" : "↵ 생성 후 삽입"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
