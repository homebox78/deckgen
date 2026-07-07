// §12 공유 덱 저장소 — 파일 기반(data/decks/*.json), 프로세스 내 캐시
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ServerDeck } from "../ai/validate.js";

export interface StoredDeck {
  deck: ServerDeck;
  rev: number;
  editToken: string;
  viewToken: string;
  updatedAt: number;
}

const DATA_DIR = path.resolve(process.cwd(), "data", "decks");
const cache = new Map<string, StoredDeck>();
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  mkdirSync(DATA_DIR, { recursive: true });
  for (const f of readdirSync(DATA_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const rec = JSON.parse(
        readFileSync(path.join(DATA_DIR, f), "utf8"),
      ) as StoredDeck;
      if (rec?.deck?.id) cache.set(rec.deck.id, rec);
    } catch (e) {
      console.warn("[deckRepo] 손상된 파일 무시:", f, e);
    }
  }
  console.log(`[deckRepo] 공유 덱 ${cache.size}개 로드`);
}

function persist(rec: StoredDeck): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      path.join(DATA_DIR, encodeURIComponent(rec.deck.id) + ".json"),
      JSON.stringify(rec),
    );
  } catch (e) {
    console.error("[deckRepo] 저장 실패:", rec.deck.id, e);
  }
}

function newToken(): string {
  return randomBytes(9).toString("base64url");
}

export function getRecord(deckId: string): StoredDeck | null {
  ensureLoaded();
  return cache.get(deckId) ?? null;
}

export function findByToken(
  token: string,
): { record: StoredDeck; role: "edit" | "view" } | null {
  ensureLoaded();
  for (const record of cache.values()) {
    if (record.editToken === token) return { record, role: "edit" };
    if (record.viewToken === token) return { record, role: "view" };
  }
  return null;
}

/** 공유 시작/갱신 — 기존 토큰은 유지 */
export function upsertShared(deck: ServerDeck): StoredDeck {
  ensureLoaded();
  const prev = cache.get(deck.id);
  const rec: StoredDeck = {
    deck,
    rev: (prev?.rev ?? 0) + 1,
    editToken: prev?.editToken ?? newToken(),
    viewToken: prev?.viewToken ?? newToken(),
    updatedAt: Date.now(),
  };
  cache.set(deck.id, rec);
  persist(rec);
  return rec;
}

export function replaceDeck(deckId: string, deck: ServerDeck): StoredDeck | null {
  ensureLoaded();
  const rec = cache.get(deckId);
  if (!rec) return null;
  rec.deck = deck;
  rec.rev++;
  rec.updatedAt = Date.now();
  persist(rec);
  return rec;
}

/** 관리자 콘솔용 요약 목록 */
export function listDeckSummaries(): {
  id: string;
  title: string;
  slides: number;
  themeId: string;
  rev: number;
  updatedAt: number;
}[] {
  ensureLoaded();
  return [...cache.values()]
    .map((r) => ({
      id: r.deck.id,
      title: r.deck.title,
      slides: r.deck.slides.length,
      themeId: r.deck.themeId,
      rev: r.rev,
      updatedAt: r.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function replaceSlide(
  deckId: string,
  slide: ServerDeck["slides"][number],
): StoredDeck | null {
  ensureLoaded();
  const rec = cache.get(deckId);
  if (!rec) return null;
  const i = rec.deck.slides.findIndex((s) => s.id === slide.id);
  if (i < 0) return null; // 구조 변경 레이스 — 무시(다음 full push가 정리)
  rec.deck.slides[i] = slide;
  rec.deck.updatedAt = Date.now();
  rec.rev++;
  rec.updatedAt = Date.now();
  persist(rec);
  return rec;
}
