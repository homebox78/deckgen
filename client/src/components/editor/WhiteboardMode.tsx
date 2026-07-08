// 화이트보드 모드 (시안 프로토타입 §whiteboard) — 덱을 무한 캔버스로 전환해
// 회고 프레임·포스트잇·커넥터·투표·스피너·타이머·리액션·펜으로 워크샵을 진행하고,
// "덱에 반영"으로 프레임 제목+포스트잇을 슬라이드로 되돌린다. 보드는 덱별 localStorage 저장.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Deck } from "../../engine/schema";
import { uid } from "../../engine/schema";
import { getTheme } from "../../engine/themes";
import { composeSlide } from "../../engine/layout";
import { useDeckStore } from "../../store/deckStore";
import { saveDeck } from "../../store/storage";
import { getGuestName } from "../../store/collabStore";
import { showToast } from "../ui/toast";

// ── 데이터 모델 (persisted) ──
interface WbNote {
  id: string;
  x: number;
  y: number;
  color: string;
  text: string;
  author: string;
  votes: number;
}
interface WbFrame {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  kind: "retro" | "slide";
  layout?: string;
  bg: string;
}
interface WbConnector { id: string; from: string; to: string }
interface WbPoll { id: string; x: number; y: number; opts: { label: string; count: number }[] }
interface WbWheel { id: string; x: number; y: number; items: string[]; rot: number; result: string }
interface WbStroke { id: string; d: string; color: string; w: number; opacity: number; blend: string }
interface WbImage { id: string; x: number; y: number; w: number; h: number; src: string }
interface Board {
  title: string;
  notes: WbNote[];
  frames: WbFrame[];
  connectors: WbConnector[];
  polls: WbPoll[];
  wheels: WbWheel[];
  strokes: WbStroke[];
  images: WbImage[];
}

const STICKY = ["#FFE7A0", "#BFE3B0", "#A9D4F5", "#F6BBCB", "#D6C6F2"];
const PEN_SWATCHES = [
  "#1A1A1A", "#F5C518", "#F59E0B", "#EA580C", "#DC2626",
  "#DB2777", "#EC4899", "#7C3AED", "#8B5CF6", "#38BDF8",
  "#2563EB", "#0EA5A5", "#16A34A", "#9CA3AF", "#FFFFFF",
];
const PEN_TYPES = [
  { id: "pen", label: "펜", icon: "edit", w: 1, o: 1, blend: "normal" },
  { id: "marker", label: "마커", icon: "brush", w: 2.6, o: 1, blend: "normal" },
  { id: "highlighter", label: "형광펜", icon: "ink_highlighter", w: 4.5, o: 0.32, blend: "multiply" },
  { id: "pencil", label: "연필", icon: "draw", w: 0.7, o: 0.85, blend: "normal" },
  { id: "eraser", label: "지우개", icon: "ink_eraser", w: 3, o: 1, blend: "normal" },
] as const;
const REACTIONS = [
  { emoji: "👍", label: "좋아요" },
  { emoji: "❤️", label: "사랑해요" },
  { emoji: "🔥", label: "불타요" },
  { emoji: "🎉", label: "축하해요" },
  { emoji: "👏", label: "박수" },
];

function emptyBoard(deck: Deck): Board {
  // 덱 슬라이드를 3열 그리드의 slide 프레임으로 미러링 → "덱에 반영" 왕복.
  const cols = 3;
  const FW = 320;
  const FH = 220;
  const GX = 56;
  const GY = 64;
  const frames: WbFrame[] = deck.slides.map((s, i) => ({
    id: uid(),
    x: 80 + (i % cols) * (FW + GX),
    y: 80 + Math.floor(i / cols) * (FH + GY),
    w: FW,
    h: FH,
    title:
      (s.elements.find((e) => e.type === "text" && (e.role === "title" || e.role === "heading")) as
        | { text?: string }
        | undefined)?.text || `슬라이드 ${i + 1}`,
    kind: "slide",
    layout: s.layout,
    bg: "#FFFFFF",
  }));
  return { title: `${deck.title} — 보드`, notes: [], frames, connectors: [], polls: [], wheels: [], strokes: [], images: [] };
}

function loadBoard(deck: Deck): Board {
  try {
    const raw = localStorage.getItem("deckgen.wb." + deck.id);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return emptyBoard(deck);
}

type Tool = "select" | "note" | "connector" | "pen" | "image";

export function WhiteboardMode({ deck, onExit }: { deck: Deck; onExit: () => void }) {
  const [board, setBoard] = useState<Board>(() => loadBoard(deck));
  const pastRef = useRef<Board[]>([]);
  const futureRef = useRef<Board[]>([]);
  const [histTick, setHistTick] = useState(0);

  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selId, setSelId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [colorIdx, setColorIdx] = useState(0);

  const [stamps, setStamps] = useState<{ id: string; x: number; y: number; emoji: string; label: string }[]>([]);
  const [privateMode, setPrivateMode] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [penOpen, setPenOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [penSize, setPenSize] = useState(4);
  const [penOpacity, setPenOpacity] = useState(100);
  const [penColor, setPenColor] = useState("#1A1A1A");
  const [penType, setPenType] = useState<(typeof PEN_TYPES)[number]["id"]>("pen");

  const [timerSec, setTimerSec] = useState(300);
  const [timerRun, setTimerRun] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 800 });
  const savedDeck = useDeckStore((s) => s.setDeck);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ── persistence ──
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem("deckgen.wb." + deck.id, JSON.stringify(board));
      } catch {
        /* quota */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [board, deck.id]);

  // ── history commit ──
  const commit = useCallback((next: Board | ((b: Board) => Board)) => {
    setBoard((prev) => {
      pastRef.current = [...pastRef.current.slice(-40), prev];
      futureRef.current = [];
      setHistTick((t) => t + 1);
      return typeof next === "function" ? (next as (b: Board) => Board)(prev) : next;
    });
  }, []);
  const undo = useCallback(() => {
    if (!pastRef.current.length) return;
    setBoard((cur) => {
      const prev = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [cur, ...futureRef.current];
      setHistTick((t) => t + 1);
      return prev;
    });
  }, []);
  const redo = useCallback(() => {
    if (!futureRef.current.length) return;
    setBoard((cur) => {
      const nx = futureRef.current[0];
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [...pastRef.current, cur];
      setHistTick((t) => t + 1);
      return nx;
    });
  }, []);

  // ── timer ──
  useEffect(() => {
    if (!timerRun) return;
    const iv = setInterval(() => setTimerSec((s) => (s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(iv);
  }, [timerRun]);
  useEffect(() => {
    if (timerSec === 0) setTimerRun(false);
  }, [timerSec]);
  const timerText = `${Math.floor(timerSec / 60)}:${String(timerSec % 60).padStart(2, "0")}`;

  // ── keyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === "TEXTAREA" || tgt.tagName === "INPUT")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selId) {
          e.preventDefault();
          deleteSel();
        }
      } else if (e.key === "Escape") {
        setEditId(null);
        setSelId(null);
        setConnectFrom(null);
        if (penOpen) setPenOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, penOpen, undo, redo]);

  // ── 이미지 붙여넣기(클립보드) → board.images ──
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((it) => it.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result);
        const cx = -pan.x / zoom + 300;
        const cy = -pan.y / zoom + 240;
        commit((b) => ({ ...b, images: [...b.images, { id: uid(), x: cx, y: cy, w: 260, h: 180, src }] }));
        showToast("이미지를 붙여넣었어요");
      };
      reader.readAsDataURL(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pan, zoom, commit]);

  // ── world coords ──
  const toWorld = (clientX: number, clientY: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    const rx = r?.left ?? 0;
    const ry = r?.top ?? 0;
    return { x: (clientX - rx - pan.x) / zoom, y: (clientY - ry - pan.y) / zoom };
  };

  // ── mutations ──
  const addNote = (wx: number, wy: number) => {
    const color = STICKY[colorIdx % STICKY.length];
    setColorIdx((c) => c + 1);
    const id = uid();
    commit((b) => ({
      ...b,
      notes: [...b.notes, { id, x: wx - 79, y: wy - 79, color, text: "", author: getGuestName() || "나", votes: 0 }],
    }));
    setSelId(id);
    setEditId(id);
    setTool("select");
  };
  const deleteSel = () => {
    if (!selId) return;
    commit((b) => ({
      ...b,
      notes: b.notes.filter((n) => n.id !== selId),
      frames: b.frames.filter((f) => f.id !== selId),
      images: b.images.filter((im) => im.id !== selId),
      wheels: b.wheels.filter((w) => w.id !== selId),
      polls: b.polls.filter((p) => p.id !== selId),
      connectors: b.connectors.filter((c) => c.from !== selId && c.to !== selId),
    }));
    setSelId(null);
  };
  const setNoteColor = (id: string, color: string) =>
    commit((b) => ({ ...b, notes: b.notes.map((n) => (n.id === id ? { ...n, color } : n)) }));
  const voteNote = (id: string) =>
    setBoard((b) => ({ ...b, notes: b.notes.map((n) => (n.id === id ? { ...n, votes: n.votes + 1 } : n)) }));

  const addRetro = () => {
    const cols = [
      { title: "Keep · 계속할 것", bg: "#F3FAEE" },
      { title: "Problem · 문제점", bg: "#FDF1F1" },
      { title: "Try · 시도할 것", bg: "#EEF5FC" },
    ];
    const baseX = -pan.x / zoom + 120;
    const baseY = -pan.y / zoom + 120;
    commit((b) => ({
      ...b,
      frames: [
        ...b.frames,
        ...cols.map((c, i) => ({ id: uid(), x: baseX + i * 320, y: baseY, w: 290, h: 420, title: c.title, kind: "retro" as const, bg: c.bg })),
      ],
    }));
    showToast("회고 프레임을 추가했어요");
  };
  const addWheel = () => {
    const baseX = -pan.x / zoom + 200;
    const baseY = -pan.y / zoom + 200;
    commit((b) => ({
      ...b,
      wheels: [...b.wheels, { id: uid(), x: baseX, y: baseY, items: ["아이디어", "리스크", "일정", "예산"], rot: 0, result: "" }],
    }));
  };
  const addPoll = () => {
    const baseX = -pan.x / zoom + 160;
    const baseY = -pan.y / zoom + 160;
    commit((b) => ({
      ...b,
      polls: [
        ...b.polls,
        { id: uid(), x: baseX, y: baseY, opts: [{ label: "옵션 A", count: 0 }, { label: "옵션 B", count: 0 }, { label: "옵션 C", count: 0 }] },
      ],
    }));
    showToast("라이브 투표를 추가했어요");
  };
  const spinWheel = (id: string) => {
    setBoard((b) => ({
      ...b,
      wheels: b.wheels.map((w) => {
        if (w.id !== id) return w;
        const seg = 360 / w.items.length;
        const extra = Math.floor(Math.random() * 360);
        const rot = w.rot + (4 + Math.floor(Math.random() * 3)) * 360 + extra;
        // 상단 포인터 아래 세그먼트 = (-rot) mod 360 원위치의 세그먼트
        const idx = Math.floor((((-rot % 360) + 360) % 360) / seg) % w.items.length;
        return { ...w, rot, result: w.items[idx] };
      }),
    }));
  };
  const votePoll = (pid: string, oi: number) =>
    setBoard((b) => ({
      ...b,
      polls: b.polls.map((p) => (p.id === pid ? { ...p, opts: p.opts.map((o, i) => (i === oi ? { ...o, count: o.count + 1 } : o)) } : p)),
    }));

  const tidyFrames = () => {
    const cols = 3;
    const FW = 320;
    const FH = 220;
    commit((b) => ({
      ...b,
      frames: b.frames.map((f, i) => ({
        ...f,
        x: 80 + (i % cols) * (FW + 56),
        y: 80 + Math.floor(i / cols) * (FH + 64),
      })),
    }));
    showToast("프레임을 정렬했어요");
  };

  const clusterNotes = () => {
    // 주제(대표 키워드)별로 열 정렬. 키워드 없으면 색상으로 폴백.
    const STOP = new Set(["그리고", "하지만", "그래서", "the", "and", "for", "to", "a", "of", "in", "은", "는", "이", "가", "을", "를"]);
    const topicOf = (n: WbNote): string => {
      const tok = n.text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !STOP.has(w));
      return tok[0] || `color:${n.color}`;
    };
    const groups = new Map<string, WbNote[]>();
    board.notes.forEach((n) => {
      const k = topicOf(n);
      groups.set(k, [...(groups.get(k) || []), n]);
    });
    let col = 0;
    const next: WbNote[] = [];
    groups.forEach((arr) => {
      arr.forEach((n, row) => next.push({ ...n, x: 120 + col * 190, y: 160 + row * 180 }));
      col++;
    });
    commit((b) => ({ ...b, notes: next }));
    setAgentOpen(false);
    showToast(`유사 포스트잇을 ${groups.size}개 주제로 그룹화했어요`);
  };

  const reflectToDeck = () => {
    const theme = getTheme(deck.themeId);
    const inside = (f: WbFrame, n: WbNote) =>
      n.x + 79 >= f.x && n.x + 79 <= f.x + f.w && n.y + 79 >= f.y && n.y + 79 <= f.y + f.h;
    let slides = board.frames.map((f) => {
      const bullets = board.notes
        .filter((n) => inside(f, n))
        .sort((a, b) => b.votes - a.votes)
        .map((n) => n.text.trim())
        .filter(Boolean)
        .slice(0, 6);
      return composeSlide("title-bullets", { title: f.title, bullets }, theme, deck.aspect);
    });
    if (slides.length === 0) {
      slides = [
        composeSlide(
          "title-bullets",
          { title: board.title, bullets: board.notes.map((n) => n.text.trim()).filter(Boolean).slice(0, 6) },
          theme,
          deck.aspect,
        ),
      ];
    }
    const nd: Deck = { ...deck, slides, updatedAt: Date.now() };
    savedDeck(nd);
    saveDeck(nd);
    showToast(`${slides.length}개 프레임을 덱 슬라이드로 반영했어요`);
    onExit();
  };

  // 보드를 브라우저 인쇄(PDF 저장) — 프레임·포스트잇을 절대배치 HTML로 그려 print()
  const exportPdf = () => {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] || c);
    const frameHtml = board.frames
      .map(
        (f) =>
          `<div style="position:absolute;left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px;border:1.5px solid #D4D4CE;border-radius:14px;background:${f.bg};box-sizing:border-box;padding:11px 15px;font-weight:700;font-size:14px">${esc(f.title)}</div>`,
      )
      .join("");
    const noteHtml = board.notes
      .map(
        (n) =>
          `<div style="position:absolute;left:${n.x}px;top:${n.y}px;width:158px;min-height:158px;background:${n.color};border-radius:4px;padding:14px;box-sizing:border-box;font-size:13.5px;line-height:1.5">${esc(n.text)}</div>`,
      )
      .join("");
    const w = window.open("", "_blank");
    if (!w) {
      showToast("팝업이 차단됐어요 — 팝업을 허용해주세요");
      return;
    }
    w.document.write(
      `<html><head><title>${esc(board.title)}</title><style>@media print{@page{margin:12mm}} body{margin:0;font-family:Pretendard,sans-serif}</style></head><body><h3 style="padding:16px 20px 0">${esc(board.title)}</h3><div style="position:relative;transform:scale(.75);transform-origin:0 0;height:1600px">${frameHtml}${noteHtml}</div></body></html>`,
    );
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const fireReaction = (emoji: string, label: string) => {
    const id = uid();
    const wx = -pan.x / zoom + 200 + Math.floor(((histTick * 53) % 400));
    const wy = -pan.y / zoom + 320 + Math.floor(((histTick * 31) % 200));
    setStamps((s) => [...s, { id, x: wx, y: wy, emoji, label }]);
    setTimeout(() => setStamps((s) => s.filter((x) => x.id !== id)), 2600);
  };

  // ── canvas pan / add / pen ──
  const panning = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const drawing = useRef<{ pts: string[] } | null>(null);
  const dragging = useRef<{ id: string; kind: "note" | "frame" | "image" | "wheel" | "poll"; ox: number; oy: number } | null>(null);

  const onCanvasDown = (e: React.MouseEvent) => {
    if (e.target !== canvasRef.current && !(e.target as HTMLElement).dataset?.wbcanvas) return;
    setSelId(null);
    setEditId(null);
    if (tool === "note") {
      const w = toWorld(e.clientX, e.clientY);
      addNote(w.x, w.y);
      return;
    }
    if (tool === "pen" && penType === "eraser") {
      // 지우개: 드래그 경로 근처(반경 R)에 점이 있는 획을 삭제
      const R = penSize * 6 + 12;
      const erased = new Set<string>();
      const eraseAt = (cx: number, cy: number) => {
        setBoard((b) => {
          const keep = b.strokes.filter((sp) => {
            if (erased.has(sp.id)) return false;
            const near = sp.d
              .split(/[ML]\s*/)
              .filter(Boolean)
              .some((seg) => {
                const [sx, sy] = seg.trim().split(/\s+/).map(Number);
                return Number.isFinite(sx) && Math.hypot(sx - cx, sy - cy) <= R;
              });
            if (near) erased.add(sp.id);
            return !near;
          });
          return keep.length === b.strokes.length ? b : { ...b, strokes: keep };
        });
      };
      const w0 = toWorld(e.clientX, e.clientY);
      eraseAt(w0.x, w0.y);
      const move = (ev: MouseEvent) => {
        const p = toWorld(ev.clientX, ev.clientY);
        eraseAt(p.x, p.y);
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (erased.size) setHistTick((t) => t + 1);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      return;
    }
    if (tool === "pen") {
      const w = toWorld(e.clientX, e.clientY);
      drawing.current = { pts: [`M ${w.x.toFixed(1)} ${w.y.toFixed(1)}`] };
      const move = (ev: MouseEvent) => {
        if (!drawing.current) return;
        const p = toWorld(ev.clientX, ev.clientY);
        drawing.current.pts.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
        setPenPreview(drawing.current.pts.join(" "));
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (drawing.current && drawing.current.pts.length > 1) {
          const pt = PEN_TYPES.find((p) => p.id === penType)!;
          const d = drawing.current.pts.join(" ");
          commit((b) => ({
            ...b,
            strokes: [
              ...b.strokes,
              { id: uid(), d, color: penColor, w: penSize * pt.w, opacity: penType === "highlighter" ? 0.32 : (penOpacity / 100) * pt.o, blend: pt.blend },
            ],
          }));
        }
        drawing.current = null;
        setPenPreview(null);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      return;
    }
    // pan (select/hand on empty)
    panning.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    const move = (ev: MouseEvent) => {
      if (!panning.current) return;
      setPan({ x: panning.current.px + (ev.clientX - panning.current.sx), y: panning.current.py + (ev.clientY - panning.current.sy) });
    };
    const up = () => {
      panning.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const [penPreview, setPenPreview] = useState<string | null>(null);

  const startDrag = (
    e: React.MouseEvent,
    id: string,
    kind: "note" | "frame" | "image" | "wheel" | "poll",
    cur: { x: number; y: number },
  ) => {
    e.stopPropagation();
    if (tool === "connector") {
      if (!connectFrom) setConnectFrom(id);
      else if (connectFrom !== id) {
        commit((b) => ({ ...b, connectors: [...b.connectors, { id: uid(), from: connectFrom, to: id }] }));
        setConnectFrom(null);
        setTool("select");
      }
      return;
    }
    setSelId(id);
    const start = toWorld(e.clientX, e.clientY);
    dragging.current = { id, kind, ox: start.x - cur.x, oy: start.y - cur.y };
    let moved = false;
    const move = (ev: MouseEvent) => {
      if (!dragging.current) return;
      moved = true;
      const w = toWorld(ev.clientX, ev.clientY);
      const nx = w.x - dragging.current.ox;
      const ny = w.y - dragging.current.oy;
      setBoard((b) => {
        const upd = <T extends { id: string; x: number; y: number }>(arr: T[]) =>
          arr.map((it) => (it.id === id ? { ...it, x: nx, y: ny } : it));
        if (kind === "note") return { ...b, notes: upd(b.notes) };
        if (kind === "frame") return { ...b, frames: upd(b.frames) };
        if (kind === "image") return { ...b, images: upd(b.images) };
        if (kind === "wheel") return { ...b, wheels: upd(b.wheels) };
        return { ...b, polls: upd(b.polls) };
      });
    };
    const up = () => {
      dragging.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (moved) setHistTick((t) => t + 1); // 드래그 종료 시 히스토리 마킹(간이)
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ── zoom ──
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(2.5, Math.max(0.3, z - e.deltaY * 0.0015)));
  };
  const fitView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // ── connector geometry ──
  const centerOf = (id: string): { x: number; y: number } | null => {
    const n = board.notes.find((x) => x.id === id);
    if (n) return { x: n.x + 79, y: n.y + 79 };
    const f = board.frames.find((x) => x.id === id);
    if (f) return { x: f.x + f.w / 2, y: f.y + f.h / 2 };
    return null;
  };
  const connectorLines = board.connectors
    .map((c) => {
      const a = centerOf(c.from);
      const b = centerOf(c.to);
      return a && b ? { id: c.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y } : null;
    })
    .filter(Boolean) as { id: string; x1: number; y1: number; x2: number; y2: number }[];

  // ── minimap ──
  const bounds = useMemo(() => {
    const xs = [...board.frames.map((f) => f.x), ...board.notes.map((n) => n.x), 0];
    const ys = [...board.frames.map((f) => f.y), ...board.notes.map((n) => n.y), 0];
    const xe = [...board.frames.map((f) => f.x + f.w), ...board.notes.map((n) => n.x + 158), 1400];
    const ye = [...board.frames.map((f) => f.y + f.h), ...board.notes.map((n) => n.y + 158), 900];
    const minX = Math.min(...xs, 0);
    const minY = Math.min(...ys, 0);
    const w = Math.max(...xe) - minX;
    const h = Math.max(...ye) - minY;
    return { minX, minY, w: Math.max(w, 1), h: Math.max(h, 1) };
  }, [board.frames, board.notes]);
  const mmScale = Math.min(150 / bounds.w, 96 / bounds.h);

  const selNote = board.notes.find((n) => n.id === selId);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#EDEDEA]">
      {/* TOP BAR */}
      <div className="z-20 flex items-center gap-3 border-b border-app-border bg-white px-4 py-[9px]">
        <button
          onClick={onExit}
          title="덱 편집으로 돌아가기"
          className="inline-flex items-center gap-1.5 rounded-lg bg-app-text px-3 py-[7px] text-[12.5px] font-semibold text-white hover:opacity-90"
        >
          <span className="mi text-[15px]">slideshow</span>덱으로
        </button>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold">
          <span className="mi text-[16px] text-app-faint">dashboard</span>
          <input
            value={board.title}
            onChange={(e) => setBoard((b) => ({ ...b, title: e.target.value }))}
            className="w-[200px] border-none bg-transparent text-[13.5px] font-semibold outline-none"
          />
        </span>
        <span className="rounded bg-app-bg px-[7px] py-0.5 text-[10.5px] font-semibold text-app-muted">화이트보드 모드</span>
        <span className="h-5 w-px bg-app-border" />
        <button
          onClick={undo}
          disabled={pastRef.current.length === 0}
          title="실행취소 (Ctrl+Z)"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-app-border bg-white text-app-text disabled:text-app-faint"
        >
          <span className="mi text-[16px]">undo</span>
        </button>
        <button
          onClick={redo}
          disabled={futureRef.current.length === 0}
          title="다시 실행 (Ctrl+Shift+Z)"
          className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-app-border bg-white text-app-text disabled:text-app-faint"
        >
          <span className="mi text-[16px]">redo</span>
        </button>
        <span className="flex-1" />
        {privateMode && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-bg px-[11px] py-[5px] text-[11.5px] font-bold">
            <span className="mi text-[14px]">visibility_off</span>비공개 모드
          </span>
        )}
        <span className="mr-1 inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-white bg-app-text text-[12px] font-bold text-white shadow" title={getGuestName() || "나"}>
          {(getGuestName() || "나").slice(0, 1)}
        </span>
        <button
          onClick={exportPdf}
          title="보드를 PDF로 내보내기 (인쇄)"
          className="inline-flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 py-[7px] text-[12.5px] font-semibold hover:border-app-accent"
        >
          <span className="mi text-[14px]">picture_as_pdf</span>PDF
        </button>
        <button
          onClick={reflectToDeck}
          title="프레임 제목·포스트잇을 덱 슬라이드로 반영"
          className="inline-flex items-center gap-1.5 rounded-lg border border-app-border bg-white px-3 py-[7px] text-[12.5px] font-semibold hover:border-app-accent"
        >
          <span className="mi text-[14px]">slideshow</span>덱에 반영
        </button>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* LEFT TOOL RAIL */}
        <div className="z-[15] flex w-[52px] flex-none flex-col items-center gap-[3px] border-r border-app-border bg-white py-2.5">
          {(
            [
              { id: "select", label: "선택·이동", icon: "near_me" },
              { id: "note", label: "포스트잇", icon: "sticky_note_2" },
              { id: "connector", label: "커넥터", icon: "linear_scale" },
              { id: "pen", label: "펜", icon: "edit" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id);
                setConnectFrom(null);
                if (t.id === "pen") setPenOpen(true);
              }}
              title={t.label}
              className={`flex h-[38px] w-[38px] items-center justify-center rounded-[10px] ${
                tool === t.id ? "bg-app-text text-white" : "bg-app-bg text-app-text hover:bg-app-border-soft"
              }`}
            >
              <span className="mi text-[19px]">{t.icon}</span>
            </button>
          ))}
          <span className="my-[5px] h-px w-6 bg-app-border" />
          <button onClick={addRetro} title="회고 템플릿 (Keep·Problem·Try)" className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-app-bg text-app-text hover:bg-app-border-soft">
            <span className="mi text-[19px]">view_column</span>
          </button>
          <button onClick={addPoll} title="라이브 투표" className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-app-bg text-app-text hover:bg-app-border-soft">
            <span className="mi text-[19px]">bar_chart</span>
          </button>
          <button onClick={addWheel} title="스피너 휠" className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-app-bg text-app-text hover:bg-app-border-soft">
            <span className="mi text-[19px]">casino</span>
          </button>
          <button onClick={tidyFrames} title="프레임 자동 정렬" className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-app-bg text-app-text hover:bg-app-border-soft">
            <span className="mi text-[19px]">dashboard_customize</span>
          </button>
        </div>

        {/* CANVAS */}
        <div
          ref={canvasRef}
          data-wbcanvas="1"
          onMouseDown={onCanvasDown}
          onWheel={onWheel}
          className="relative flex-1 overflow-hidden"
          style={{
            cursor: tool === "pen" ? "crosshair" : tool === "note" ? "copy" : "default",
            backgroundColor: "#EDEDEA",
            backgroundImage: "radial-gradient(#CFCFC9 1.1px, transparent 1.1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div
            className="absolute left-0 top-0"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
          >
            {/* ink strokes */}
            <svg width="4000" height="3000" className="pointer-events-none absolute left-0 top-0 z-[2] overflow-visible">
              {board.strokes.map((sp) => (
                <path
                  key={sp.id}
                  d={sp.d}
                  fill="none"
                  stroke={sp.color}
                  strokeWidth={sp.w}
                  strokeOpacity={sp.opacity}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ mixBlendMode: sp.blend as React.CSSProperties["mixBlendMode"] }}
                />
              ))}
              {penPreview && (
                <path d={penPreview} fill="none" stroke={penColor} strokeWidth={penSize} strokeOpacity={penOpacity / 100} strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>

            {/* connectors */}
            <svg width="4000" height="3000" className="pointer-events-none absolute left-0 top-0 z-[3] overflow-visible">
              <defs>
                <marker id="wbArrow" markerWidth="10" markerHeight="10" refX="7.5" refY="5" orient="auto">
                  <path d="M0 0 L10 5 L0 10 z" fill="#55554F" />
                </marker>
              </defs>
              {connectorLines.map((cl) => (
                <g key={cl.id}>
                  <line x1={cl.x1} y1={cl.y1} x2={cl.x2} y2={cl.y2} stroke="#55554F" strokeWidth={2} markerEnd="url(#wbArrow)" />
                  <line
                    x1={cl.x1}
                    y1={cl.y1}
                    x2={cl.x2}
                    y2={cl.y2}
                    stroke="transparent"
                    strokeWidth={16}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onClick={() => commit((b) => ({ ...b, connectors: b.connectors.filter((c) => c.id !== cl.id) }))}
                  />
                </g>
              ))}
            </svg>

            {/* frames */}
            {board.frames.map((fr) => (
              <div
                key={fr.id}
                onMouseDown={(e) => startDrag(e, fr.id, "frame", fr)}
                className="absolute overflow-hidden rounded-[14px] border-[1.5px]"
                style={{
                  left: fr.x,
                  top: fr.y,
                  width: fr.w,
                  height: fr.h,
                  background: fr.bg,
                  borderColor: selId === fr.id ? "#1A1A1A" : "#D4D4CE",
                  cursor: tool === "connector" ? "crosshair" : "grab",
                }}
              >
                <div className="flex items-center justify-between px-[15px] py-[11px]">
                  <input
                    value={fr.title}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => setBoard((b) => ({ ...b, frames: b.frames.map((f) => (f.id === fr.id ? { ...f, title: e.target.value } : f)) }))}
                    className="flex-1 truncate border-none bg-transparent text-[14px] font-bold outline-none"
                  />
                </div>
                {fr.kind === "slide" && (
                  <div className="mx-[14px] mb-3 flex flex-col gap-2 rounded-lg border border-[#EAEAE6] bg-white px-[14px] py-3" style={{ height: fr.h - 60 }}>
                    <div className="h-1 w-1/5 rounded bg-app-text" />
                    <div className="h-1.5 w-[82%] rounded bg-app-border" />
                    <div className="h-1.5 w-[64%] rounded bg-[#EDEDEA]" />
                    <div className="h-1.5 w-[74%] rounded bg-[#EDEDEA]" />
                    <span className="flex-1" />
                    <span className="self-start rounded bg-app-bg px-[7px] py-0.5 text-[9.5px] font-bold text-app-muted">{fr.layout}</span>
                  </div>
                )}
              </div>
            ))}

            {/* polls */}
            {board.polls.map((pl) => {
              const total = pl.opts.reduce((s, o) => s + o.count, 0) || 1;
              return (
                <div
                  key={pl.id}
                  onMouseDown={(e) => startDrag(e, pl.id, "poll", pl)}
                  className="absolute w-[280px] rounded-[14px] border border-app-border bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,.08)]"
                  style={{ left: pl.x, top: pl.y, cursor: "grab" }}
                >
                  <div className="mb-3 flex items-center gap-1.5">
                    <span className="mi text-[16px]">bar_chart</span>
                    <span className="text-[13.5px] font-bold">라이브 투표</span>
                  </div>
                  {pl.opts.map((o, i) => (
                    <div key={i} onMouseDown={(e) => e.stopPropagation()} onClick={() => votePoll(pl.id, i)} className="mb-2 cursor-pointer">
                      <div className="mb-1 flex justify-between text-[12px] text-app-muted">
                        <span>{o.label}</span>
                        <span className="font-bold text-app-text">{o.count}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-app-bg">
                        <div className="h-full rounded-full bg-app-text transition-all" style={{ width: `${(o.count / total) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* spinner wheels */}
            {board.wheels.map((wl) => (
              <div
                key={wl.id}
                onMouseDown={(e) => startDrag(e, wl.id, "wheel", wl)}
                className="absolute w-[230px] rounded-[14px] border border-app-border bg-white p-4 text-center shadow-[0_6px_20px_rgba(0,0,0,.08)]"
                style={{ left: wl.x, top: wl.y, cursor: "grab" }}
              >
                <div className="mb-3 text-[12.5px] font-bold">무엇부터 논의할까요?</div>
                <div className="relative mx-auto h-[170px] w-[170px]">
                  <div
                    className="h-[170px] w-[170px] rounded-full"
                    style={{
                      background: `conic-gradient(${wl.items
                        .map((_, i) => {
                          const shades = ["#1A1A1A", "#55554F", "#8A8A84", "#C9C9C4", "#E0D8F9", "#B4B4AE"];
                          const seg = 100 / wl.items.length;
                          return `${shades[i % shades.length]} ${i * seg}% ${(i + 1) * seg}%`;
                        })
                        .join(", ")})`,
                      transform: `rotate(${wl.rot}deg)`,
                      transition: "transform 1.1s cubic-bezier(.17,.67,.2,1)",
                    }}
                  />
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 border-l-[9px] border-r-[9px] border-t-[14px] border-l-transparent border-r-transparent border-t-app-text" />
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => spinWheel(wl.id)}
                    className="absolute left-1/2 top-1/2 flex h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-white bg-app-text text-[11px] font-bold text-white shadow-lg"
                  >
                    Spin
                  </button>
                </div>
                <div className="mt-3 min-h-4 text-[12px] font-bold">{wl.result}</div>
              </div>
            ))}

            {/* images */}
            {board.images.map((im) => (
              <div
                key={im.id}
                onMouseDown={(e) => startDrag(e, im.id, "image", im)}
                className="absolute z-[4] rounded-md bg-cover bg-center shadow-[0_3px_12px_rgba(0,0,0,.16)]"
                style={{ left: im.x, top: im.y, width: im.w, height: im.h, backgroundImage: `url(${im.src})`, cursor: "grab" }}
              />
            ))}

            {/* sticky notes */}
            {board.notes.map((n) => (
              <div
                key={n.id}
                onMouseDown={(e) => startDrag(e, n.id, "note", n)}
                onDoubleClick={() => setEditId(n.id)}
                className="absolute box-border rounded-[4px] p-3.5"
                style={{
                  left: n.x,
                  top: n.y,
                  width: 158,
                  minHeight: 158,
                  background: n.color,
                  boxShadow: selId === n.id ? "0 8px 22px rgba(0,0,0,.2)" : "0 2px 8px rgba(0,0,0,.12)",
                  outline: selId === n.id ? "2px solid #1A1A1A" : "none",
                  outlineOffset: 2,
                  cursor: "grab",
                }}
              >
                {editId === n.id ? (
                  <textarea
                    autoFocus
                    value={n.text}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => setBoard((b) => ({ ...b, notes: b.notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)) }))}
                    onBlur={() => {
                      setEditId(null);
                      setHistTick((t) => t + 1);
                    }}
                    className="h-[128px] w-full resize-none border-none bg-transparent text-[13.5px] leading-[1.5] outline-none"
                  />
                ) : (
                  <div className="min-h-[128px] whitespace-pre-wrap break-words text-[13.5px] leading-[1.5] text-app-text">
                    {n.text || <span className="text-app-faint">더블클릭해 입력</span>}
                  </div>
                )}
                {!privateMode && (
                  <div className="absolute bottom-1.5 right-2.5 text-[10px] font-semibold text-black/35">{n.author}</div>
                )}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => voteNote(n.id)}
                  title="투표 (닷 보팅)"
                  className="absolute -right-2 -top-2 inline-flex items-center gap-[3px] rounded-full border border-app-border bg-white py-0.5 pl-1.5 pr-2 shadow"
                >
                  <span
                    className={`mi text-[13px] ${n.votes > 0 ? "fill" : ""}`}
                    style={{ color: n.votes > 0 ? "#1A1A1A" : "#B4B4AE" }}
                  >
                    {n.votes > 0 ? "how_to_vote" : "add_reaction"}
                  </span>
                  <span className="text-[11px] font-extrabold">{n.votes}</span>
                </button>
              </div>
            ))}

            {/* reaction stamps */}
            {stamps.map((st) => (
              <div key={st.id} className="pointer-events-none absolute" style={{ left: st.x, top: st.y, animation: "wbPop .4s ease-out, wbFloat 2.6s ease-in-out infinite" }}>
                <div className="flex items-center gap-1.5 rounded-full border border-app-border bg-white py-1.5 pl-2 pr-2.5 shadow-lg">
                  <span className="text-[15px]">{st.emoji}</span>
                  <span className="text-[11.5px] font-bold">{st.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* selected note color palette */}
          {selNote && tool === "select" && (
            <div className="absolute left-1/2 top-3 z-[16] flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-app-border bg-white px-2.5 py-2 shadow-lg">
              {STICKY.map((c) => (
                <button
                  key={c}
                  onClick={() => setNoteColor(selNote.id, c)}
                  className={`h-6 w-6 rounded-full border ${selNote.color === c ? "ring-2 ring-app-text ring-offset-1" : "border-app-border"}`}
                  style={{ background: c }}
                />
              ))}
              <span className="mx-1 h-5 w-px bg-app-border" />
              <button onClick={deleteSel} title="삭제" className="flex h-6 w-6 items-center justify-center rounded text-app-muted hover:text-app-danger">
                <span className="mi text-[16px]">delete</span>
              </button>
            </div>
          )}

          {/* reaction bar */}
          <div className="absolute bottom-4 left-1/2 z-[14] flex -translate-x-1/2 items-center gap-[3px] rounded-full border border-app-border bg-white px-2 py-1.5 shadow-lg">
            {REACTIONS.map((r) => (
              <button key={r.emoji} onClick={() => fireReaction(r.emoji, r.label)} title={r.label} className="rounded-lg px-1.5 py-1 text-[19px] hover:bg-app-bg">
                {r.emoji}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-app-border" />
            <button
              onClick={() => setPrivateMode((p) => !p)}
              title="비공개 모드"
              className={`inline-flex items-center gap-1.5 rounded-full px-[11px] py-1.5 text-[12px] font-semibold ${privateMode ? "bg-app-text text-white" : "text-app-text hover:bg-app-bg"}`}
            >
              <span className="mi text-[15px]">visibility_off</span>비공개
            </button>
          </div>

          {/* minimap */}
          {minimapOpen ? (
            <div className="absolute bottom-16 right-4 z-[14] w-[172px]">
              <div
                className="relative h-[112px] w-[172px] cursor-pointer overflow-hidden rounded-xl border border-app-border bg-white shadow-lg"
                title="클릭해서 이동"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const wx = (e.clientX - r.left - 8) / mmScale + bounds.minX;
                  const wy = (e.clientY - r.top - 8) / mmScale + bounds.minY;
                  setPan({ x: canvasSize.w / 2 - wx * zoom, y: canvasSize.h / 2 - wy * zoom });
                }}
              >
                <div className="absolute left-2 top-1.5 z-[2] text-[9.5px] font-bold tracking-wide text-app-faint">MINIMAP</div>
                <button onClick={(e) => { e.stopPropagation(); setMinimapOpen(false); }} title="미니맵 접기" className="absolute right-1 top-1 z-[3] flex h-5 w-5 items-center justify-center rounded-md bg-app-bg text-app-muted">
                  <span className="mi text-[13px]">close_fullscreen</span>
                </button>
                <div className="absolute inset-0" style={{ padding: 8 }}>
                  {board.frames.map((f) => (
                    <div
                      key={f.id}
                      className="absolute rounded-sm border border-app-border bg-app-bg"
                      style={{ left: (f.x - bounds.minX) * mmScale + 8, top: (f.y - bounds.minY) * mmScale + 8, width: f.w * mmScale, height: f.h * mmScale }}
                    />
                  ))}
                  {board.notes.map((n) => (
                    <div
                      key={n.id}
                      className="absolute rounded-[1px]"
                      style={{ left: (n.x - bounds.minX) * mmScale + 8, top: (n.y - bounds.minY) * mmScale + 8, width: 5, height: 5, background: n.color }}
                    />
                  ))}
                  {/* 현재 뷰포트 사각형 */}
                  <div
                    className="pointer-events-none absolute rounded-[2px] border-[1.5px] border-app-text"
                    style={{
                      left: (-pan.x / zoom - bounds.minX) * mmScale + 8,
                      top: (-pan.y / zoom - bounds.minY) * mmScale + 8,
                      width: (canvasSize.w / zoom) * mmScale,
                      height: (canvasSize.h / zoom) * mmScale,
                      background: "rgba(26,26,26,.06)",
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => setMinimapOpen(true)} title="미니맵 열기" className="absolute bottom-16 right-4 z-[14] inline-flex items-center gap-1.5 rounded-[10px] border border-app-border bg-white px-[11px] py-[7px] text-[12px] font-semibold shadow">
              <span className="mi text-[15px]">map</span>미니맵
            </button>
          )}

          {/* zoom controls */}
          <div className="absolute bottom-4 left-4 z-[14] flex items-center gap-0.5 rounded-[10px] border border-app-border bg-white p-1 shadow">
            <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="flex h-[30px] w-[30px] items-center justify-center rounded-md hover:bg-app-bg">
              <span className="mi text-[17px]">remove</span>
            </button>
            <span className="min-w-[42px] text-center text-[12px] font-semibold">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))} className="flex h-[30px] w-[30px] items-center justify-center rounded-md hover:bg-app-bg">
              <span className="mi text-[17px]">add</span>
            </button>
            <span className="mx-0.5 h-[18px] w-px bg-app-border" />
            <button onClick={fitView} title="화면 맞춤" className="flex h-[30px] w-[30px] items-center justify-center rounded-md hover:bg-app-bg">
              <span className="mi text-[16px]">fit_screen</span>
            </button>
          </div>

          {/* timer */}
          <div className="absolute right-4 top-3.5 z-[14] flex items-center gap-2.5 rounded-[11px] border border-app-border bg-white px-3 py-2 shadow">
            <span className="mi text-[16px]">timer</span>
            <span className="min-w-[44px] text-[15px] font-extrabold tabular-nums">{timerText}</span>
            <button onClick={() => setTimerRun((r) => !r)} className="flex h-7 w-7 items-center justify-center rounded-md bg-app-text text-white">
              <span className="mi text-[15px]">{timerRun ? "pause" : "play_arrow"}</span>
            </button>
            <button onClick={() => { setTimerSec(300); setTimerRun(false); }} className="flex h-7 w-7 items-center justify-center rounded-md border border-app-border text-app-muted">
              <span className="mi text-[15px]">replay</span>
            </button>
          </div>

          {/* PEN PANEL */}
          {penOpen && (
            <div className="absolute left-3.5 top-3.5 z-[18] w-[236px] overflow-hidden rounded-2xl border border-app-border bg-white shadow-xl">
              <div className="px-4 pb-2.5 pt-3.5">
                <div className="mb-3 flex items-center gap-2.5">
                  <input type="range" min={1} max={24} value={penSize} onChange={(e) => setPenSize(+e.target.value)} className="flex-1 accent-app-text" />
                  <span className="min-w-[20px] text-right text-[14px] font-extrabold">{penSize}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <input type="range" min={10} max={100} value={penOpacity} onChange={(e) => setPenOpacity(+e.target.value)} className="flex-1 accent-app-text" />
                  <span className="min-w-[34px] rounded-md border border-app-border px-2 py-1 text-center text-[13px] font-bold">{penOpacity}</span>
                </div>
              </div>
              <div className="mx-3.5 h-px bg-app-border-soft" />
              <div className="grid grid-cols-5 gap-2.5 px-3.5 py-3">
                {PEN_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPenColor(c)}
                    title={c}
                    className={`h-[30px] w-[30px] rounded-full ${penColor === c ? "ring-2 ring-app-text ring-offset-1" : "border border-app-border"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <div className="mx-3.5 h-px bg-app-border-soft" />
              <div className="flex items-center gap-1.5 px-3.5 py-2.5">
                {PEN_TYPES.map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => setPenType(pt.id)}
                    title={pt.label}
                    className={`flex h-9 flex-1 items-center justify-center rounded-[9px] border ${penType === pt.id ? "border-app-text bg-app-text text-white" : "border-app-border bg-white text-app-text"}`}
                  >
                    <span className="mi text-[18px]">{pt.icon}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 px-3.5 pb-3">
                <button onClick={() => commit((b) => ({ ...b, strokes: [] }))} className="flex-1 rounded-[9px] border border-app-border bg-white py-2 text-[12px] font-semibold text-app-muted">
                  전체 지우기
                </button>
                <button onClick={() => { setPenOpen(false); setTool("select"); }} className="flex-none rounded-[9px] border border-app-border bg-white px-3 py-2 text-[12px] font-semibold">
                  완료
                </button>
              </div>
            </div>
          )}

          {/* AI agent */}
          {agentOpen && (
            <div className="absolute bottom-[74px] right-4 z-[16] w-[272px] overflow-hidden rounded-[14px] border border-app-border bg-white shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-app-border-soft px-3.5 py-3">
                <span className="mi text-[16px]">auto_awesome</span>
                <span className="text-[13px] font-bold">AI 퍼실리테이터</span>
                <span className="flex-1" />
                <button onClick={() => setAgentOpen(false)} className="text-app-muted">
                  <span className="mi text-[16px]">close</span>
                </button>
              </div>
              <div className="flex flex-col gap-1.5 px-3.5 py-3">
                <button onClick={clusterNotes} className="rounded-[9px] border border-app-border bg-[#FBFBFA] px-2.5 py-2.5 text-left text-[12px] hover:bg-app-bg">
                  <span className="mi mr-1.5 align-[-2px] text-[13px]">hub</span>유사 포스트잇 자동 그룹화
                </button>
                <button onClick={() => { showToast(`포스트잇 ${board.notes.length}개 · ${board.notes.reduce((s, n) => s + n.votes, 0)}표 — 상위 주제를 요약했어요`); setAgentOpen(false); }} className="rounded-[9px] border border-app-border bg-[#FBFBFA] px-2.5 py-2.5 text-left text-[12px] hover:bg-app-bg">
                  <span className="mi mr-1.5 align-[-2px] text-[13px]">summarize</span>보드 인사이트 요약
                </button>
                <button onClick={reflectToDeck} className="rounded-[9px] border border-app-border bg-[#FBFBFA] px-2.5 py-2.5 text-left text-[12px] hover:bg-app-bg">
                  <span className="mi mr-1.5 align-[-2px] text-[13px]">slideshow</span>이 보드를 덱으로 전환
                </button>
              </div>
            </div>
          )}
          <button onClick={() => setAgentOpen((a) => !a)} className="absolute bottom-4 right-4 z-[15] inline-flex items-center gap-1.5 rounded-full bg-app-text px-[15px] py-2.5 text-[12.5px] font-semibold text-white shadow-lg">
            <span className="mi text-[16px]">auto_awesome</span>AI
          </button>
        </div>
      </div>
    </div>
  );
}
