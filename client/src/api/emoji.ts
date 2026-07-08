// 이모지(이모티콘 이미지) 매니페스트 — 서버 webroot의 emoji/manifest.json 을 읽어 시리즈별로 노출.
// 운영: hom2box.com/deckGen/emoji/manifest.json · dev: /emoji/manifest.json(없으면 유니코드 이모지만).
export interface EmojiItem {
  name: string; // 파일명(확장자 제외) — 툴팁
  url: string; // 삽입용 상대 URL
}
export interface EmojiSeries {
  name: string; // 시리즈(폴더)명 — 탭 라벨
  items: EmojiItem[];
}

// vite base(운영 /deckGen/, dev /) 기준 정적 경로
const BASE = import.meta.env.BASE_URL || "/";
const emojiBase = `${BASE.replace(/\/$/, "")}/emoji`;

/** 매니페스트 로드. 없거나 실패하면 null(→ 유니코드 이모지만 표시) */
export async function fetchEmojiManifest(): Promise<EmojiSeries[] | null> {
  try {
    const res = await fetch(`${emojiBase}/manifest.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    const data = (await res.json()) as { series?: { name: string; files: string[] }[] };
    if (!data?.series?.length) return null;
    return data.series
      .filter((s) => s.files?.length)
      .map((s) => ({
        name: s.name,
        items: s.files.map((f) => ({
          name: f.replace(/\.[^.]+$/, ""),
          url: `${emojiBase}/${encodeURIComponent(s.name)}/${encodeURIComponent(f)}`,
        })),
      }));
  } catch {
    return null;
  }
}
