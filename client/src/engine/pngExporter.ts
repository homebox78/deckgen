// PNG 내보내기 (Demo Act 7) — 슬라이드별 PNG를 zip으로 (단일 슬라이드는 바로 다운로드)
import JSZip from "jszip";
import { renderSlideToDataURL } from "./fabricRenderer";
import type { Deck } from "./schema";
import { aspectDims } from "./schema";
import { getTheme } from "./themes";

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "deck";
}

function download(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export async function exportDeckToPng(deck: Deck): Promise<void> {
  const theme = getTheme(deck.themeId);
  const dims = aspectDims(deck.aspect);
  // 고해상 렌더 (긴 변 1920)
  const width = dims.w >= dims.h ? 1920 : Math.round(1920 * (dims.w / dims.h));

  if (deck.slides.length === 1) {
    const url = await renderSlideToDataURL(deck.slides[0], theme, width, dims);
    download(url, `${sanitize(deck.title)}.png`);
    return;
  }

  const zip = new JSZip();
  for (let i = 0; i < deck.slides.length; i++) {
    const url = await renderSlideToDataURL(deck.slides[i], theme, width, dims);
    const b64 = url.split(",")[1];
    zip.file(`${String(i + 1).padStart(2, "0")}.png`, b64, { base64: true });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  download(url, `${sanitize(deck.title)}_png.zip`);
  URL.revokeObjectURL(url);
}
