// 미디어 삽입 (Demo Act 5.5) — 이미지 업로드 · YouTube · Pexels · GIPHY · 아이콘/이모지 · AI 이미지
// 삽입 결과는 §3 스키마의 ImageElement(dataURL) 또는 TextElement(이모지)로 캔버스에 추가
import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../../api/base";
import {
  ppImageToDataURL,
  ppPublicAssets,
  ppRelative,
  type PPAsset,
} from "../../api/powerplus";
import type { ImageElement, SlideDims, SlideElement, TextElement } from "../../engine/schema";
import { uid } from "../../engine/schema";
import { showToast } from "../ui/toast";

type Tab = "image" | "youtube" | "stock" | "library" | "ai";

const TABS: { id: Tab; label: string }[] = [
  { id: "image", label: "이미지 업로드" },
  { id: "youtube", label: "YouTube" },
  { id: "stock", label: "powerPlus" },
  { id: "library", label: "이모지" },
  { id: "ai", label: "AI 이미지" },
];

const EMOJIS = "😀 🚀 💡 📊 📈 ✅ ⭐ 🔥 💰 🎯 🏆 📌 🔔 💬 📎 🎨 🌱 ⚡ 🧩 🛠️ 📅 🔍 💎 🌟".split(" ");


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


export function MediaPicker({
  dims,
  onInsert,
  onClose,
  initialTab = "image",
}: {
  dims: SlideDims;
  onInsert: (el: SlideElement) => void;
  onClose: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [ytUrl, setYtUrl] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiModel, setAiModel] = useState("gpt-image-2");
  const fileRef = useRef<HTMLInputElement>(null);

  const cx = dims.w / 2;
  const cy = dims.h / 2;

  // 이미지 자연 비율을 유지해 삽입(잘림 방지) — 슬라이드 안에 들어오도록 박스에 맞춘다.
  const insertImage = (
    src: string,
    boxW = 720,
    boxH = 450,
    fit: "cover" | "contain" = "contain",
    youtubeId?: string,
  ) => {
    const place = (nw: number, nh: number) => {
      const maxW = Math.min(Math.max(boxW, 480), dims.w * 0.8);
      const maxH = Math.min(Math.max(boxH, 300), dims.h * 0.8);
      const scale = Math.min(maxW / nw, maxH / nh, 1) || 1;
      const w = Math.round(nw * scale);
      const h = Math.round(nh * scale);
      const el: ImageElement = {
        id: uid(),
        type: "image",
        src,
        fit,
        x: Math.round(cx - w / 2),
        y: Math.round(cy - h / 2),
        w,
        h,
        ...(youtubeId ? { youtubeId } : {}),
      };
      onInsert(el);
      onClose();
    };
    const img = new Image();
    img.onload = () => place(img.naturalWidth || boxW, img.naturalHeight || boxH);
    img.onerror = () => place(boxW, boxH);
    img.src = src;
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
      insertImage(c.toDataURL("image/png"), 800, 450, "cover", m[1]);
    };
    img.onerror = () => insertImage(gradientDataURL("#1A1A1A", "#55554F", 800, 450, "YouTube"), 800, 450, "cover", m[1]);
    img.src = `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
  };

  const genAi = async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await fetch(apiUrl("/api/ai-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim(), model: aiModel }),
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
            <span className="mi text-[15px]">close</span>
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
              <span className="mi text-[34px] text-app-muted">image</span>
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
            <PowerPlusPicker onPick={(src, w, h) => insertImage(src, w, h, "contain")} />
          )}

          {tab === "library" && (
            <>
              {/* 이모지 — 아이콘·GIF는 powerPlus 라이브러리로 이관, 여기는 이모지 전용 */}
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
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] font-semibold text-app-faint">모델</span>
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="rounded-lg border border-app-border bg-white px-2.5 py-1.5 text-[12px] focus:border-app-accent focus:outline-none"
                >
                  <option value="gpt-image-2">GPT Image 2 (고품질)</option>
                  <option value="nano-banana-2">Nano Banana 2 (빠름)</option>
                  <option value="gemini-3-flash-image">Gemini 3 Flash (저비용)</option>
                </select>
              </div>
              <button
                onClick={() => void genAi()}
                disabled={aiBusy}
                className="flex items-center gap-1 self-start rounded-lg bg-app-text px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {aiBusy ? "생성 중…" : <><span className="mi text-[15px]">auto_awesome</span>생성 후 삽입</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// powerPlus 자산 브라우저 (무인증 공개 엔드포인트) — MediaPicker 'powerPlus' 탭
const PP_CATS = [
  { key: "all", label: "전체" },
  { key: "icon", label: "아이콘" },
  { key: "photo", label: "사진" },
  { key: "illust", label: "일러스트" },
  { key: "diagram", label: "다이어그램" },
  { key: "logo", label: "로고" },
];

function PowerPlusPicker({ onPick }: { onPick: (src: string, w: number, h: number) => void }) {
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [assets, setAssets] = useState<PPAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [ok, setOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ppPublicAssets({ category: cat, q, page: 1, limit: 60, sort: "latest" })
      .then((r) => {
        if (!alive) return;
        setOk(true);
        setAssets(r.data.filter((a) => a.image_url));
      })
      .catch(() => alive && setOk(false))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [cat, q]);

  const pick = async (a: PPAsset) => {
    if (!a.image_url) return;
    setBusy(a.id);
    try {
      const { dataUrl, w, h } = await ppImageToDataURL(a.image_url);
      onPick(dataUrl, w, h);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "삽입에 실패했어요");
    } finally {
      setBusy(null);
    }
  };

  if (ok === false) {
    return (
      <p className="py-10 text-center text-[12px] text-app-faint">
        powerPlus 자산 연결을 준비 중입니다. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 rounded-lg border border-app-border px-3 py-2">
        <span className="mi text-[16px] text-app-faint">search</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setQ(query.trim())}
          placeholder="powerPlus 자산 검색 (예: 그래프, 회의, 데이터)"
          className="min-w-0 flex-1 text-[12.5px] focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {PP_CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              cat === c.key ? "bg-app-text text-white" : "border border-app-border bg-white text-app-muted hover:border-app-accent"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="py-8 text-center text-[12px] text-app-faint">불러오는 중…</p>
      ) : assets.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-app-faint">
          {q ? `'${q}' 검색 결과가 없어요.` : "표시할 자산이 없어요."}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {assets.map((a) => (
            <button
              key={a.id}
              onClick={() => pick(a)}
              disabled={!!busy}
              title={a.name || a.id}
              className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-app-border bg-app-bg hover:border-app-accent disabled:opacity-60"
            >
              <img
                src={ppRelative(a.thumb_url || a.image_url)}
                alt={a.name || a.id}
                loading="lazy"
                className="h-full w-full object-contain p-1.5"
              />
              {busy === a.id && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[11px] font-semibold text-app-accent">
                  삽입 중…
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
