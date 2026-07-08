// §13 스토리보드 갤러리 (프로토타입) — 35종 단일 와이어프레임을 카테고리별로 탐색하고
// ★즐겨찾기·⤢확대·+담기 트레이로 원하는 구성을 골라 즉시 편집 가능한 스토리보드 덱을 만든다.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  SINGLE_WIREFRAMES,
  WF_CATEGORIES,
  wireframeToSlide,
  type SingleWireframe,
} from "../../engine/singleWireframes";
import type { Deck, DeckAspect } from "../../engine/schema";
import { uid } from "../../engine/schema";
import { useDeckStore } from "../../store/deckStore";
import { saveDeck } from "../../store/storage";
import { showToast } from "../ui/toast";

const FAV_KEY = "deckgen.wf.favorites";
function loadFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
  } catch {
    return [];
  }
}

/** 실사용 데이터가 없어 id 기반 결정적 의사-인기 수치(정렬·표시용). */
function wfUses(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 40 + (h % 460); // 40~499
}

/** 블록을 SVG로 그리는 미니 프리뷰 (카드·확대 공용) — 100×62.5 뷰박스(16:10) */
function MiniWf({ wf, big = false }: { wf: SingleWireframe; big?: boolean }) {
  const VW = 100;
  const VH = 62.5;
  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="block h-full w-full"
      preserveAspectRatio="none"
    >
      <rect x="0" y="0" width={VW} height={VH} fill="#FBFBFA" />
      {wf.blocks.map((b, i) => {
        const [px, py, pw, ph, t] = b;
        const x = (px / 100) * VW;
        const y = (py / 100) * VH;
        const w = (pw / 100) * VW;
        const h = (ph / 100) * VH;
        if (t === 2) {
          return (
            <ellipse
              key={i}
              cx={x + w / 2}
              cy={y + h / 2}
              rx={w / 2}
              ry={h / 2}
              fill="#EDEDE9"
              stroke="#D2D2CD"
              strokeWidth={big ? 0.4 : 0.5}
            />
          );
        }
        if (t === 1) {
          const thin = ph <= 7;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={thin ? 0.6 : 1}
              fill={thin ? "#1A1A1A" : "#E3E1EF"}
            />
          );
        }
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={1}
            fill="#F0F0EC"
            stroke="#DBDBD6"
            strokeWidth={big ? 0.4 : 0.5}
          />
        );
      })}
    </svg>
  );
}

export function StoryboardGallery({
  themeId,
  aspect,
}: {
  themeId: string;
  aspect: DeckAspect;
}) {
  const navigate = useNavigate();
  const [cat, setCat] = useState<string>("전체");
  const [favs, setFavs] = useState<string[]>(loadFavs);
  const [tray, setTray] = useState<string[]>([]);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"default" | "popular">("default");

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  };

  const tabs = ["전체", "★ 즐겨찾기", ...WF_CATEGORIES];
  const q = query.trim().toLowerCase();
  const flat = q !== "" || sort === "popular"; // 검색·인기순이면 카테고리 섹션 대신 평면 그리드
  const visible = useMemo(() => {
    let list: SingleWireframe[] = SINGLE_WIREFRAMES;
    if (cat === "★ 즐겨찾기") list = list.filter((w) => favs.includes(w.id));
    else if (cat !== "전체") list = list.filter((w) => w.category === cat);
    if (q)
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.viz || "").toLowerCase().includes(q) ||
          w.category.toLowerCase().includes(q),
      );
    if (sort === "popular") list = [...list].sort((a, b) => wfUses(b.id) - wfUses(a.id));
    return list;
  }, [cat, favs, q, sort]);

  const zoomIdx = zoomId ? SINGLE_WIREFRAMES.findIndex((w) => w.id === zoomId) : -1;
  const zoomWf = zoomIdx >= 0 ? SINGLE_WIREFRAMES[zoomIdx] : null;
  const stepZoom = (d: number) => {
    const n = SINGLE_WIREFRAMES.length;
    setZoomId(SINGLE_WIREFRAMES[(zoomIdx + d + n) % n].id);
  };

  const addToTray = (id: string) => {
    setTray((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };
  const removeFromTray = (id: string) => setTray((prev) => prev.filter((t) => t !== id));

  const reorderTray = (from: number, to: number) => {
    setTray((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };

  const buildDeck = () => {
    if (tray.length === 0) return;
    const now = Date.now();
    const slides = tray
      .map((id) => SINGLE_WIREFRAMES.find((w) => w.id === id))
      .filter((w): w is SingleWireframe => !!w)
      .map((w) => wireframeToSlide(w, aspect));
    const deck: Deck = {
      id: uid(),
      title: "스토리보드 (초안)",
      themeId,
      aspect,
      slides,
      createdAt: now,
      updatedAt: now,
    };
    saveDeck(deck);
    useDeckStore.getState().setDeck(deck);
    navigate(`/deck/${deck.id}/edit`);
    showToast(`${slides.length}개 프레임으로 스토리보드를 만들었어요 — 자리를 채우고 공유하세요`);
  };

  const renderCard = (wf: SingleWireframe) => {
    const inTray = tray.includes(wf.id);
    const isFav = favs.includes(wf.id);
    return (
      <div
        key={wf.id}
        className="group rounded-xl border border-app-border bg-app-surface p-2.5 shadow-[0_1px_4px_rgba(0,0,0,.04)] transition-all hover:border-app-accent hover:shadow-[0_4px_14px_rgba(26,26,26,.12)]"
      >
        <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-app-border-soft">
          <MiniWf wf={wf} />
          <button
            title={isFav ? "즐겨찾기 해제" : "즐겨찾기"}
            onClick={() => toggleFav(wf.id)}
            className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border bg-white/95 text-[14px] shadow-sm transition-colors ${
              isFav
                ? "border-app-accent text-app-accent"
                : "border-app-border text-app-faint opacity-0 group-hover:opacity-100 hover:text-app-accent"
            }`}
          >
            <span className="mi text-[15px]">{isFav ? "star" : "star_border"}</span>
          </button>
          <button
            title="크게 보기"
            onClick={() => setZoomId(wf.id)}
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md border border-app-border bg-white/95 text-app-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:border-app-accent hover:text-app-accent"
          >
            <span className="mi text-[15px]">open_in_full</span>
          </button>
          <button
            onClick={() => (inTray ? removeFromTray(wf.id) : addToTray(wf.id))}
            className={`absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-semibold shadow-sm transition-colors ${
              inTray
                ? "border-app-accent bg-app-accent text-white"
                : "border-app-border bg-white/95 text-app-muted opacity-0 group-hover:opacity-100 hover:border-app-accent hover:text-app-accent"
            }`}
          >
            <span className="mi text-[13px]">{inTray ? "check" : "add"}</span>
            {inTray ? "담김" : "추가"}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-1">
          <p className="truncate text-[11.5px] font-semibold">{wf.name}</p>
          {wf.viz && (
            <span className="flex-none rounded bg-app-bg px-1.5 py-0.5 text-[9px] font-semibold text-app-muted">
              {wf.viz}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-[9.5px] text-app-faint">
          <span className="mi text-[11px]">group</span>
          {wfUses(wf.id).toLocaleString()}회 사용
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-[880px] max-w-[92vw] pb-12">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[16px] font-semibold">스토리보드로 시작</h2>
        <span className="text-[12px] text-app-faint">
          와이어프레임을 조합해 장표 흐름을 먼저 설계하세요
        </span>
      </div>

      {/* 검색 + 정렬 */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="mi pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-app-faint">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="프레임 검색 — 예: 표, 타임라인, KPI"
            className="w-full rounded-lg border border-app-border bg-app-surface py-2 pl-8 pr-8 text-[12.5px] outline-none placeholder:text-app-faint focus:border-app-accent"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-app-faint hover:text-app-text"
            >
              <span className="mi text-[15px]">close</span>
            </button>
          )}
        </div>
        <div className="flex flex-none overflow-hidden rounded-lg border border-app-border">
          {([["default", "기본순"], ["popular", "인기순"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setSort(v)}
              className={`px-3 py-2 text-[11.5px] font-semibold transition-colors ${
                sort === v ? "bg-app-accent text-white" : "bg-app-surface text-app-muted hover:bg-app-bg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const active = cat === t;
          const n =
            t === "전체"
              ? SINGLE_WIREFRAMES.length
              : t === "★ 즐겨찾기"
                ? favs.length
                : SINGLE_WIREFRAMES.filter((w) => w.category === t).length;
          return (
            <button
              key={t}
              onClick={() => setCat(t)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                active
                  ? "border-app-accent bg-app-accent text-white"
                  : "border-app-border bg-app-surface text-app-muted hover:bg-app-bg"
              }`}
            >
              {t === "★ 즐겨찾기" ? (
                <span className="inline-flex items-center gap-1">
                  <span className="mi text-[14px]">star</span>즐겨찾기
                </span>
              ) : (
                t
              )}
              <span className={`text-[10.5px] ${active ? "text-white/70" : "text-app-faint"}`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* 카드 — "전체"는 카테고리 섹션으로 묶고, 검색·인기순·특정 탭은 평면 그리드 */}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-app-border py-10 text-center text-[12.5px] text-app-faint">
          {q
            ? `'${query.trim()}' 검색 결과가 없어요. 다른 키워드로 찾아보세요.`
            : "아직 즐겨찾기한 와이어프레임이 없어요. 카드의 ★를 눌러 담아두세요."}
        </p>
      ) : cat === "전체" && !flat ? (
        <div className="flex flex-col gap-5">
          {WF_CATEGORIES.map((c) => {
            const items = SINGLE_WIREFRAMES.filter((w) => w.category === c);
            if (items.length === 0) return null;
            return (
              <div key={c}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[12.5px] font-bold">{c}</span>
                  <span className="text-[11px] text-app-faint">{items.length}</span>
                  <span className="h-px flex-1 bg-app-border-soft" />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {items.map(renderCard)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{visible.map(renderCard)}</div>
      )}

      {/* 담기 트레이 (하단 고정) */}
      {tray.length > 0 && (
        <div className="sticky bottom-4 z-30 mt-4 rounded-2xl border border-app-border bg-app-surface/95 p-3 shadow-[0_8px_24px_rgba(0,0,0,.14)] backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold">
              담은 프레임 {tray.length}개
              <span className="ml-1.5 font-normal text-app-faint">드래그해 순서를 정하세요</span>
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setTray([])}
                className="rounded-lg border border-app-border px-2.5 py-1.5 text-[11.5px] font-semibold text-app-muted hover:bg-app-bg"
              >
                비우기
              </button>
              <button
                onClick={buildDeck}
                className="inline-flex items-center gap-1 rounded-lg bg-app-accent px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90"
              >
                <span className="mi text-[15px]">auto_awesome</span>
                이 구성으로 스토리보드 만들기
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {tray.map((id, idx) => {
              const wf = SINGLE_WIREFRAMES.find((w) => w.id === id)!;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx !== null && dragIdx !== idx) reorderTray(dragIdx, idx);
                    setDragIdx(null);
                  }}
                  className={`group/tray relative w-[92px] cursor-grab rounded-lg border bg-white p-1 active:cursor-grabbing ${
                    dragIdx === idx ? "border-app-accent opacity-50" : "border-app-border"
                  }`}
                >
                  <div className="absolute left-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded bg-app-accent text-[9px] font-bold text-white">
                    {idx + 1}
                  </div>
                  <button
                    onClick={() => removeFromTray(id)}
                    className="absolute right-0.5 top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-app-text/80 text-[11px] text-white opacity-0 group-hover/tray:opacity-100"
                  >
                    <span className="mi text-[11px]">close</span>
                  </button>
                  <div className="aspect-[16/10] overflow-hidden rounded">
                    <MiniWf wf={wf} />
                  </div>
                  <p className="mt-1 truncate text-center text-[9.5px] text-app-muted">{wf.name}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ⤢ 확대 모달 (←/→ 이동) */}
      {zoomWf && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setZoomId(null)}
        >
          <div
            className="relative w-[720px] max-w-[92vw] rounded-2xl bg-app-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-bold">{zoomWf.name}</h3>
                <p className="mt-0.5 text-[11.5px] text-app-faint">
                  {zoomWf.category}
                  {zoomWf.viz ? ` · ${zoomWf.viz}` : ""} · {wfUses(zoomWf.id).toLocaleString()}회 사용
                </p>
              </div>
              <button
                onClick={() => setZoomId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-app-border text-app-muted hover:bg-app-bg"
              >
                <span className="mi text-[18px]">close</span>
              </button>
            </div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-app-border">
              <MiniWf wf={zoomWf} big />
              <button
                onClick={() => stepZoom(-1)}
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-app-border bg-white/95 text-app-muted shadow hover:border-app-accent hover:text-app-accent"
              >
                <span className="mi text-[20px]">chevron_left</span>
              </button>
              <button
                onClick={() => stepZoom(1)}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-app-border bg-white/95 text-app-muted shadow hover:border-app-accent hover:text-app-accent"
              >
                <span className="mi text-[20px]">chevron_right</span>
              </button>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => toggleFav(zoomWf.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-app-border px-3 py-2 text-[12px] font-semibold text-app-muted hover:bg-app-bg"
              >
                <span className="mi text-[16px]">{favs.includes(zoomWf.id) ? "star" : "star_border"}</span>
                즐겨찾기
              </button>
              <button
                onClick={() => {
                  addToTray(zoomWf.id);
                  setZoomId(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-app-accent px-3 py-2 text-[12px] font-semibold text-white hover:opacity-90"
              >
                <span className="mi text-[16px]">add</span>
                스토리보드에 추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
