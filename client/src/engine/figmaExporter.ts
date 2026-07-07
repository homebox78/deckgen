// Figma 핸드오프 내보내기 — 슬라이드별 SVG 벡터(.zip).
// Figma 캔버스에 드래그하면 각 슬라이드가 프레임으로 열리고, 텍스트/도형이
// 편집 가능한 레이어로 유지된다(z-order = 스키마 순서). .fig는 비공개
// 바이너리 포맷이라 채택하지 않음 — SVG가 Figma 공식 임포트 경로.
import { StaticCanvas } from "fabric";
import JSZip from "jszip";
import { renderSlide } from "./fabricRenderer";
import type { Deck, Slide, SlideDims } from "./schema";
import { aspectDims } from "./schema";
import { getTheme } from "./themes";

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

/** 프레임 이름 = "NN 슬라이드제목" — Figma가 파일명을 레이어 이름으로 쓴다 */
function frameName(slide: Slide, i: number): string {
  const titleEl = slide.elements.find(
    (e) => e.type === "text" && (e.role === "title" || e.role === "heading"),
  );
  const raw =
    titleEl && titleEl.type === "text" ? titleEl.text.split("\n")[0] : slide.layout;
  const safe = sanitize(raw).slice(0, 40) || slide.layout;
  return `${String(i + 1).padStart(2, "0")} ${safe}`;
}

/** 슬라이드 1장 → SVG 문자열 (Fabric 렌더 트리 그대로 벡터화) */
async function slideToSvg(slide: Slide, themeId: string, dims: SlideDims): Promise<string> {
  const el = document.createElement("canvas");
  const sc = new StaticCanvas(el, { width: dims.w, height: dims.h });
  try {
    await renderSlide(sc, slide, getTheme(themeId), { shadow: false, dims });
    return sc.toSVG();
  } finally {
    void sc.dispose();
  }
}

const README = `DeckGen → Figma 핸드오프

1. 이 압축을 풀고 SVG 파일들을 Figma 캔버스에 한꺼번에 드래그하세요.
2. 슬라이드마다 1920x1080 프레임으로 열리고, 파일명(NN 제목)이 레이어 이름이 됩니다.
3. 텍스트는 텍스트 레이어로, 도형·차트는 벡터 레이어로 편집할 수 있습니다.
   (레이어 순서 = DeckGen 에디터의 z-order)
4. 폰트는 Pretendard 기준입니다. Figma 환경에 Pretendard가 없으면
   대체 폰트로 보일 수 있으니 설치 후 여는 것을 권장합니다.
`;

/** 덱 전체 → Figma용 SVG 묶음(.zip) 다운로드 */
export async function exportDeckToFigmaZip(deck: Deck): Promise<void> {
  const zip = new JSZip();
  const dims = aspectDims(deck.aspect);
  for (let i = 0; i < deck.slides.length; i++) {
    const svg = await slideToSvg(deck.slides[i], deck.themeId, dims);
    zip.file(`${frameName(deck.slides[i], i)}.svg`, svg);
  }
  zip.file("README.txt", README);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitize(deck.title) || "deck"}-figma.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
