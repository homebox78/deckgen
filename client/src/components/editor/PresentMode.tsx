// 발표 모드 — 전체 화면 렌더, 클릭/→ 다음 · ← 이전 · N 노트 토글 · Esc 종료
import { useCallback, useEffect, useRef, useState } from "react";
import { renderSlideToDataURL } from "../../engine/fabricRenderer";
import type { Deck, ImageElement, SlideDims } from "../../engine/schema";
import { aspectDims } from "../../engine/schema";
import type { Theme } from "../../engine/themes";
import { getMotion } from "../../store/motionStore";

interface Props {
  deck: Deck;
  theme: Theme;
  startIndex: number;
  onExit: () => void;
}

const TRANSITIONS = ["none", "slide", "fade", "zoom"] as const;
type Transition = (typeof TRANSITIONS)[number];

function readTransition(fallback: Transition): Transition {
  const t = localStorage.getItem("deckgen:transition");
  return (TRANSITIONS as readonly string[]).includes(t ?? "") ? (t as Transition) : fallback;
}

export function PresentMode({ deck, theme, startIndex, onExit }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [notesOpen, setNotesOpen] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [anim, setAnim] = useState("");
  const dims: SlideDims = aspectDims(deck.aspect);
  const rootRef = useRef<HTMLDivElement>(null);
  // 발표 중 재생 중인 YouTube 요소 id (클릭하면 그 자리에 iframe 임베드)
  const [playing, setPlaying] = useState<Set<string>>(new Set());
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgRect, setImgRect] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const measure = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setImgRect({ l: r.left, t: r.top, w: r.width, h: r.height });
  }, []);
  // 덱 모션 효과를 발표 진입 기본 전환으로 사용 (페이드→fade · 떠오름→slide · 팝→zoom)
  const motionEffect = getMotion(deck.id).effect;
  const motionAsTransition: Transition =
    motionEffect === "fade" ? "fade" : motionEffect === "pop" ? "zoom" : "slide";
  const transition = readTransition(motionAsTransition);

  const slide = deck.slides[index];

  // 고해상 렌더 (현재 + 다음 슬라이드 프리로드)
  useEffect(() => {
    let cancelled = false;
    const want = [index, index + 1]
      .filter((i) => i >= 0 && i < deck.slides.length)
      .map((i) => deck.slides[i])
      .filter((s) => !urls[s.id]);
    void (async () => {
      for (const s of want) {
        const url = await renderSlideToDataURL(s, theme, 1920, dims);
        if (cancelled) return;
        setUrls((prev) => ({ ...prev, [s.id]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, deck, theme]);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = Math.max(0, Math.min(deck.slides.length - 1, i + delta));
        if (next !== i && transition !== "none") {
          const cls =
            transition === "fade"
              ? "dg-anim-fade"
              : transition === "zoom"
                ? "dg-anim-zoom"
                : delta > 0
                  ? "dg-anim-slide-l"
                  : "dg-anim-slide-r";
          setAnim("");
          requestAnimationFrame(() => setAnim(cls));
        }
        return next;
      });
    },
    [deck.slides.length, transition],
  );

  useEffect(() => {
    // 전체 화면 진입 (실패해도 오버레이로 동작)
    void rootRef.current?.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
      else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      else if (e.key.toLowerCase() === "n") setNotesOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [go, onExit]);

  // 슬라이드 바뀌면 재생 상태 초기화 + 위치 재측정
  useEffect(() => {
    setPlaying(new Set());
    measure();
  }, [index, measure]);
  useEffect(() => {
    const on = () => measure();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [measure]);

  if (!slide) return null;

  // 현재 슬라이드의 YouTube 요소(재생 가능) — 렌더 이미지 위에 오버레이
  const ytEls = slide.elements.filter(
    (e): e is ImageElement => e.type === "image" && !!e.youtubeId,
  );

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col bg-black"
      onClick={() => go(1)}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {urls[slide.id] ? (
          <img
            key={slide.id}
            ref={imgRef}
            src={urls[slide.id]}
            alt=""
            onLoad={measure}
            className={`max-h-full max-w-full object-contain shadow-[0_0_80px_rgba(0,0,0,.6)] ${anim}`}
            style={{ aspectRatio: `${dims.w} / ${dims.h}` }}
          />
        ) : (
          <div className="text-[13px] text-white/60">렌더링 중…</div>
        )}
      </div>

      {/* YouTube 재생 오버레이 — 렌더 이미지 위 요소 위치에 정확히 얹는다.
          클릭 시 재생(iframe) + stopPropagation 으로 슬라이드 넘어가지 않게 */}
      {imgRect &&
        ytEls.map((el) => {
          const L = imgRect.l + (el.x / dims.w) * imgRect.w;
          const T = imgRect.t + (el.y / dims.h) * imgRect.h;
          const W = (el.w / dims.w) * imgRect.w;
          const H = (el.h / dims.h) * imgRect.h;
          const isPlaying = playing.has(el.id);
          return (
            <div
              key={el.id}
              className="fixed overflow-hidden rounded"
              style={{ left: L, top: T, width: W, height: H }}
              onClick={(e) => {
                e.stopPropagation(); // 슬라이드 넘김 방지
                if (!isPlaying) setPlaying((p) => new Set(p).add(el.id));
              }}
            >
              {isPlaying ? (
                <iframe
                  title={`youtube-${el.id}`}
                  src={`https://www.youtube.com/embed/${el.youtubeId}?autoplay=1&rel=0`}
                  className="h-full w-full border-0"
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                />
              ) : (
                // 아직 재생 전: 썸네일(슬라이드 이미지에 이미 보임) 위 투명 클릭영역 + 재생 힌트
                <div className="flex h-full w-full items-center justify-center bg-black/10 hover:bg-black/20">
                  <span className="mi text-white/95 drop-shadow" style={{ fontSize: Math.min(H, W) * 0.35 }}>
                    play_circle
                  </span>
                </div>
              )}
            </div>
          );
        })}

      {/* 발표자 노트 (N) */}
      {notesOpen && (
        <div
          className="max-h-[26vh] overflow-y-auto border-t border-white/15 bg-[#111] px-8 py-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 text-[10.5px] font-bold tracking-[.08em] text-white/40">
            발표자 노트
          </div>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-white/85">
            {slide.notes?.trim() || "이 슬라이드에는 노트가 없습니다."}
          </p>
        </div>
      )}

      {/* 하단 컨트롤 */}
      <div
        className="flex items-center gap-3 px-6 py-3 text-white/70"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onExit}
          className="rounded-lg border border-white/25 px-3 py-1.5 text-[12px] font-semibold hover:bg-white/10"
        >
          <span className="mi align-middle text-[14px] mr-1">close</span>발표 종료 (Esc)
        </button>
        <span className="text-[12px]">클릭/→ 다음 · ← 이전 · N 노트</span>
        {/* 전환 효과 선택 (Demo Act 7) */}
        <select
          defaultValue={transition}
          onChange={(e) => localStorage.setItem("deckgen:transition", e.target.value)}
          className="rounded-lg border border-white/25 bg-transparent px-2 py-1 text-[11.5px] focus:outline-none [&>option]:text-black"
          title="전환 효과"
        >
          <option value="none">전환: 없음</option>
          <option value="fade">전환: 페이드</option>
          <option value="slide">전환: 슬라이드</option>
          <option value="zoom">전환: 줌</option>
        </select>
        <span className="flex-1" />
        <button
          onClick={() => go(-1)}
          disabled={index === 0}
          className="rounded-lg border border-white/25 px-3 py-1.5 text-[13px] hover:bg-white/10 disabled:opacity-30"
        >
          <span className="mi text-[20px]">arrow_back</span>
        </button>
        <span className="min-w-[64px] text-center font-mono text-[13px]">
          {index + 1} / {deck.slides.length}
        </span>
        <button
          onClick={() => go(1)}
          disabled={index === deck.slides.length - 1}
          className="rounded-lg border border-white/25 px-3 py-1.5 text-[13px] hover:bg-white/10 disabled:opacity-30"
        >
          <span className="mi text-[20px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
