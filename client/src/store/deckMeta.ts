// 홈 덱 메타: 폴더 · 즐겨찾기 · 휴지통 (localStorage, 계정 없는 MVP)
import type { Deck } from "../engine/schema";
import { loadDeck, saveDeck, deleteDeck, type DeckSummary } from "./storage";

const K_FOLDERS = "deckgen:folders";
const K_DECKFOLDER = "deckgen:deckFolder";
const K_FAVS = "deckgen:favs";
const TRASH_PREFIX = "deckgen:trash:";
const TRASH_TTL_MS = 30 * 24 * 3600 * 1000; // 30일

export interface Folder {
  id: string;
  name: string;
}

export interface TrashedDeck extends DeckSummary {
  delAt: number;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 용량 초과 무시 */
  }
}

// ===== 폴더 =====
export function listFolders(): Folder[] {
  return readJSON<Folder[]>(K_FOLDERS, []);
}
export function addFolder(name: string): Folder {
  const f: Folder = { id: crypto.randomUUID().slice(0, 8), name: name.trim() || "새 폴더" };
  writeJSON(K_FOLDERS, [...listFolders(), f]);
  return f;
}
export function renameFolder(id: string, name: string): void {
  writeJSON(
    K_FOLDERS,
    listFolders().map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)),
  );
}
export function removeFolder(id: string): void {
  writeJSON(K_FOLDERS, listFolders().filter((f) => f.id !== id));
  const map = readJSON<Record<string, string>>(K_DECKFOLDER, {});
  for (const k of Object.keys(map)) if (map[k] === id) delete map[k];
  writeJSON(K_DECKFOLDER, map);
}

// ===== 덱 → 폴더 배정 =====
export function deckFolderMap(): Record<string, string> {
  return readJSON<Record<string, string>>(K_DECKFOLDER, {});
}
export function setDeckFolder(deckId: string, folderId: string | null): void {
  const map = deckFolderMap();
  if (folderId) map[deckId] = folderId;
  else delete map[deckId];
  writeJSON(K_DECKFOLDER, map);
}

// ===== 즐겨찾기 =====
export function listFavs(): string[] {
  return readJSON<string[]>(K_FAVS, []);
}
export function isFav(deckId: string): boolean {
  return listFavs().includes(deckId);
}
export function toggleFav(deckId: string): boolean {
  const favs = listFavs();
  const has = favs.includes(deckId);
  writeJSON(K_FAVS, has ? favs.filter((x) => x !== deckId) : [...favs, deckId]);
  return !has;
}

// ===== 휴지통 =====
// 삭제 = 덱 JSON을 휴지통으로 옮기고 원본 제거. 복원 시 되살림.
export function trashDeck(summary: DeckSummary): void {
  const deck = loadDeck(summary.id);
  if (!deck) return;
  writeJSON(TRASH_PREFIX + summary.id, { deck, thumbnail: summary.thumbnail, delAt: Date.now() });
  deleteDeck(summary.id);
  setDeckFolder(summary.id, null);
}
export function listTrash(): TrashedDeck[] {
  const out: TrashedDeck[] = [];
  const now = Date.now();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(TRASH_PREFIX)) continue;
    try {
      const rec = JSON.parse(localStorage.getItem(key)!) as {
        deck: Deck;
        thumbnail?: string;
        delAt: number;
      };
      if (now - rec.delAt > TRASH_TTL_MS) {
        localStorage.removeItem(key);
        continue;
      }
      out.push({
        id: rec.deck.id,
        title: rec.deck.title,
        themeId: rec.deck.themeId,
        updatedAt: rec.deck.updatedAt,
        slideCount: rec.deck.slides.length,
        thumbnail: rec.thumbnail,
        delAt: rec.delAt,
      });
    } catch {
      /* 손상 무시 */
    }
  }
  return out.sort((a, b) => b.delAt - a.delAt);
}
export function restoreDeck(deckId: string): void {
  const key = TRASH_PREFIX + deckId;
  try {
    const rec = JSON.parse(localStorage.getItem(key)!) as { deck: Deck; thumbnail?: string };
    saveDeck(rec.deck);
    if (rec.thumbnail) {
      try {
        localStorage.setItem(`deckgen:thumb:${deckId}`, rec.thumbnail);
      } catch {
        /* 썸네일 포기 */
      }
    }
    localStorage.removeItem(key);
  } catch {
    /* 없음 */
  }
}
export function purgeDeck(deckId: string): void {
  localStorage.removeItem(TRASH_PREFIX + deckId);
}
export function emptyTrash(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(TRASH_PREFIX)) keys.push(key);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}
