// powerPlus 자산 라이브러리 탭 — 기존 이메일 OTP 인증 그대로 재사용 + 자산 검색·삽입.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageElement, SlideDims, SlideElement } from "../../engine/schema";
import { uid } from "../../engine/schema";
import {
  ppAssets,
  ppImageToDataURL,
  ppRecordUsage,
  ppRelative,
  ppRequestCode,
  ppVerifyCode,
  type PPAsset,
} from "../../api/powerplus";
import { clearPPAuth, setPPAuth, usePPAuth } from "../../store/powerplusStore";
import { showToast } from "../ui/toast";

const CATS: { key: string; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "icon", label: "아이콘" },
  { key: "photo", label: "사진" },
  { key: "illust", label: "일러스트" },
  { key: "diagram", label: "다이어그램" },
  { key: "logo", label: "로고" },
];

export function LibraryPanel({
  dims,
  onInsert,
  readOnly,
}: {
  dims: SlideDims;
  onInsert: (el: SlideElement) => void;
  readOnly?: boolean;
}) {
  const { token, email } = usePPAuth();

  // ── 로그인(이메일 OTP) ──
  const [step, setStep] = useState<"email" | "code">("email");
  const [inEmail, setInEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const sendCode = async () => {
    setErr("");
    setBusy(true);
    try {
      const r = await ppRequestCode(inEmail.trim());
      setDevCode(r.dev_code ?? null);
      setStep("code");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "요청에 실패했어요");
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setErr("");
    setBusy(true);
    try {
      const r = await ppVerifyCode(inEmail.trim(), code.trim());
      setPPAuth(r.token, r.email);
      setCode("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "인증에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  // ── 자산 검색 ──
  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState(""); // 실제 실행된 검색어
  const [assets, setAssets] = useState<PPAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [inserting, setInserting] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await ppAssets(token, { category: cat, q, page: 1, limit: 60, sort: "latest" });
      // 이미지 자산만(장표=slide는 DeckGen 삽입 대상 아님)
      setAssets(r.data.filter((a) => a.image_url));
      setTotal(r.total);
    } catch (e) {
      // 토큰 만료 → 재로그인
      if (e instanceof Error && /401|인증/.test(e.message)) {
        clearPPAuth();
        showToast("powerPlus 세션이 만료됐어요 — 다시 로그인해 주세요");
      } else {
        showToast(e instanceof Error ? e.message : "자산을 불러오지 못했어요");
      }
    } finally {
      setLoading(false);
    }
  }, [token, cat, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const insert = async (a: PPAsset) => {
    if (readOnly || !a.image_url) return;
    setInserting(a.id);
    try {
      const { dataUrl, w, h } = await ppImageToDataURL(a.image_url);
      // 자연 비율 유지 + 슬라이드 안에 들어오도록 박스(원본의 절반 너비/1000px 상한)에 맞춤
      const boxW = Math.min(1000, dims.w * 0.5);
      const boxH = Math.min(700, dims.h * 0.6);
      const scale = Math.min(boxW / w, boxH / h, 1);
      const ew = Math.round(w * scale);
      const eh = Math.round(h * scale);
      const el: ImageElement = {
        id: uid(),
        type: "image",
        src: dataUrl,
        fit: "contain",
        x: Math.round(dims.w / 2 - ew / 2),
        y: Math.round(dims.h / 2 - eh / 2),
        w: ew,
        h: eh,
      };
      onInsert(el);
      if (token) ppRecordUsage(token, a.id);
      showToast("powerPlus 자산을 삽입했어요");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "삽입에 실패했어요");
    } finally {
      setInserting(null);
    }
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── 미인증: 로그인 폼 ──
  if (!token) {
    return (
      <div className="flex flex-col gap-3 px-4 py-5">
        <div className="flex items-center gap-2">
          <span className="mi text-[18px] text-app-accent">photo_library</span>
          <span className="text-[13.5px] font-bold">powerPlus 자산 라이브러리</span>
        </div>
        <p className="text-[11.5px] leading-relaxed text-app-faint">
          회사 powerPlus 계정으로 로그인하면 아이콘·사진·일러스트·다이어그램·로고를 검색해 바로
          슬라이드에 넣을 수 있어요. 인증은 이메일 코드(OTP) 방식입니다.
        </p>
        {step === "email" ? (
          <>
            <input
              type="email"
              value={inEmail}
              onChange={(e) => setInEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && inEmail.trim() && !busy && sendCode()}
              placeholder="회사 이메일"
              className="rounded-lg border border-app-border px-3 py-2 text-[12.5px] focus:border-app-accent focus:outline-none"
            />
            <button
              onClick={sendCode}
              disabled={busy || !inEmail.trim()}
              className="rounded-lg bg-app-text py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "보내는 중…" : "인증코드 받기"}
            </button>
          </>
        ) : (
          <>
            <p className="text-[11.5px] text-app-muted">
              <b className="text-app-text">{inEmail}</b> 로 6자리 코드를 보냈어요.
            </p>
            {devCode && (
              <p className="rounded-md bg-app-accent-soft px-2 py-1 text-[11px] font-semibold text-app-accent">
                (개발 모드 코드: {devCode})
              </p>
            )}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && !busy && verify()}
              inputMode="numeric"
              placeholder="6자리 인증코드"
              className="rounded-lg border border-app-border px-3 py-2 text-center text-[15px] font-bold tracking-[.3em] focus:border-app-accent focus:outline-none"
            />
            <button
              onClick={verify}
              disabled={busy || code.length !== 6}
              className="rounded-lg bg-app-text py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "확인 중…" : "로그인"}
            </button>
            <button
              onClick={() => { setStep("email"); setErr(""); setCode(""); }}
              className="text-[11px] font-semibold text-app-faint hover:text-app-text"
            >
              ← 이메일 다시 입력
            </button>
          </>
        )}
        {err && <p className="text-[11.5px] font-semibold text-app-danger">{err}</p>}
      </div>
    );
  }

  // ── 인증됨: 검색 + 그리드 ──
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-app-border-soft px-4 py-2.5">
        <span className="mi text-[16px] text-app-accent">photo_library</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold" title={email ?? ""}>
          {email}
        </span>
        <button
          onClick={() => clearPPAuth()}
          title="powerPlus 로그아웃"
          className="flex items-center gap-1 rounded-md border border-app-border px-2 py-1 text-[10.5px] font-semibold text-app-muted hover:border-app-accent hover:text-app-accent"
        >
          <span className="mi text-[13px]">logout</span>로그아웃
        </button>
      </div>

      <div className="flex items-center gap-1.5 border-b border-app-border-soft px-4 py-2.5">
        <span className="mi text-[15px] text-app-faint">search</span>
        <input
          ref={searchInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setQ(query.trim())}
          placeholder="자산 검색 (예: 그래프, 데이터, 회의)"
          className="min-w-0 flex-1 bg-transparent text-[12px] focus:outline-none"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setQ(""); }}
            className="mi text-[14px] text-app-faint hover:text-app-text"
          >
            close
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-app-border-soft px-4 py-2.5">
        {CATS.map((c) => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              cat === c.key
                ? "bg-app-text text-white"
                : "border border-app-border bg-white text-app-muted hover:border-app-accent"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="py-10 text-center text-[12px] text-app-faint">불러오는 중…</p>
        ) : assets.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-app-faint">
            {q ? `'${q}' 검색 결과가 없어요.` : "표시할 자산이 없어요."}
          </p>
        ) : (
          <>
            <p className="mb-2 text-[10.5px] text-app-faint">{total.toLocaleString()}개 · 클릭해서 삽입</p>
            <div className="grid grid-cols-2 gap-2">
              {assets.map((a) => (
                <button
                  key={a.id}
                  onClick={() => insert(a)}
                  disabled={!!inserting || readOnly}
                  title={a.name || a.id}
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-app-border bg-app-bg hover:border-app-accent disabled:opacity-60"
                >
                  <img
                    src={ppRelative(a.thumb_url || a.image_url)}
                    alt={a.name || a.id}
                    loading="lazy"
                    className="h-full w-full object-contain p-1.5"
                  />
                  {inserting === a.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[11px] font-semibold text-app-accent">
                      삽입 중…
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
