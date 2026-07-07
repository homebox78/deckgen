// PPTX 가져오기 — OOXML을 DeckSchema로 변환.
// Import(그대로 편집)와 Reference(아웃라인 추출) 두 경로를 모두 지원한다.
// 범위: 텍스트 상자·기본 도형(rect/roundRect/ellipse)·이미지. 차트/표/그룹은
// 제외하고 슬라이드 notes에 기록(억지 변환보다 정직한 생략 — Snapdeck과 동일 기준).
import JSZip from "jszip";
import type {
  Deck,
  DeckAspect,
  OutlineSlide,
  Slide,
  SlideElement,
  TextElement,
  TextRole,
} from "./schema";
import { aspectDims, uid } from "./schema";

export interface ImportedPptx {
  fileName: string;
  slideCount: number;
  deck: Deck; // Import 경로용
  outline: OutlineSlide[]; // Reference 경로용
  skipped: number; // 변환 제외 요소 수 (차트/표/그룹 등)
}

const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

function firstByTag(el: Element | Document, ns: string, tag: string): Element | null {
  return el.getElementsByTagNameNS(ns, tag)[0] ?? null;
}

/** 슬라이드 rels: r:id → 미디어 zip 경로 */
async function slideRels(zip: JSZip, slidePath: string): Promise<Map<string, string>> {
  const name = slidePath.split("/").pop()!;
  const relsFile = zip.file(`ppt/slides/_rels/${name}.rels`);
  const map = new Map<string, string>();
  if (!relsFile) return map;
  const doc = parseXml(await relsFile.async("text"));
  for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id");
    let target = rel.getAttribute("Target") ?? "";
    if (!id || !target) continue;
    target = target.replace(/^\.\.\//, "ppt/");
    if (!target.startsWith("ppt/")) target = "ppt/slides/" + target;
    map.set(id, target);
  }
  return map;
}

interface EmuScale {
  sx: number; // EMU → px
  sy: number;
}

function readXfrm(sp: Element, s: EmuScale) {
  const xfrm = firstByTag(sp, NS_A, "xfrm");
  if (!xfrm) return null;
  const off = firstByTag(xfrm, NS_A, "off");
  const ext = firstByTag(xfrm, NS_A, "ext");
  if (!off || !ext) return null;
  return {
    x: Math.round(Number(off.getAttribute("x")) * s.sx),
    y: Math.round(Number(off.getAttribute("y")) * s.sy),
    w: Math.round(Number(ext.getAttribute("cx")) * s.sx),
    h: Math.round(Number(ext.getAttribute("cy")) * s.sy),
  };
}

function phType(sp: Element): string | null {
  const ph = firstByTag(sp, NS_P, "ph");
  return ph ? (ph.getAttribute("type") ?? "body") : null;
}

/** txBody → 문단 텍스트 + 대표 스타일 */
function readText(sp: Element) {
  const txBody = firstByTag(sp, NS_P, "txBody");
  if (!txBody) return null;
  const paras: string[] = [];
  let fontSize: number | undefined;
  let bold = false;
  let color: string | undefined;
  let align: "left" | "center" | "right" | undefined;
  let bulleted = false;

  for (const p of Array.from(txBody.getElementsByTagNameNS(NS_A, "p"))) {
    let line = "";
    for (const r of Array.from(p.getElementsByTagNameNS(NS_A, "r"))) {
      const t = firstByTag(r, NS_A, "t");
      line += t?.textContent ?? "";
      const rPr = firstByTag(r, NS_A, "rPr");
      if (rPr) {
        const sz = rPr.getAttribute("sz");
        // sz = 1/100pt → px (1pt = 2px, 1920px = 960pt 기준)
        if (sz && fontSize === undefined) fontSize = Math.round((Number(sz) / 100) * 2);
        if (rPr.getAttribute("b") === "1") bold = true;
        const clr = firstByTag(rPr, NS_A, "srgbClr");
        if (clr && !color) color = "#" + clr.getAttribute("val");
      }
    }
    const pPr = firstByTag(p, NS_A, "pPr");
    if (pPr) {
      const algn = pPr.getAttribute("algn");
      if (algn === "ctr") align = "center";
      else if (algn === "r") align = "right";
      if (
        pPr.getElementsByTagNameNS(NS_A, "buChar").length ||
        pPr.getElementsByTagNameNS(NS_A, "buAutoNum").length
      ) {
        bulleted = true;
      }
    }
    paras.push(line);
  }
  const joined = paras.filter((l, i) => l.trim() || i < paras.length - 1).join("\n").trim();
  if (!joined) return null;
  return { text: joined, paras: paras.filter((l) => l.trim()), fontSize, bold, color, align, bulleted };
}

function roleFor(ph: string | null, fontSize: number | undefined, dims: { h: number }): TextRole {
  if (ph === "title" || ph === "ctrTitle") return "title";
  if (ph === "subTitle") return "subtitle";
  if (fontSize && fontSize >= dims.h * 0.055) return "heading";
  return "body";
}

/** 단일 .pptx 파일 → 덱 + 아웃라인 */
export async function parsePptx(file: File): Promise<ImportedPptx> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // 슬라이드 크기 → 비율 결정 (세로형이면 4:5로)
  const presFile = zip.file("ppt/presentation.xml");
  if (!presFile) throw new Error("presentation.xml이 없습니다 — 올바른 .pptx가 아니에요.");
  const pres = parseXml(await presFile.async("text"));
  const sldSz = firstByTag(pres, NS_P, "sldSz");
  const cx = Number(sldSz?.getAttribute("cx") ?? 12192000);
  const cy = Number(sldSz?.getAttribute("cy") ?? 6858000);
  const aspect: DeckAspect = cy >= cx ? "4:5" : "16:9";
  const dims = aspectDims(aspect);
  const scale: EmuScale = { sx: dims.w / cx, sy: dims.h / cy };

  // 슬라이드 파일 목록 (번호 순)
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (slidePaths.length === 0) throw new Error("슬라이드를 찾을 수 없습니다.");

  const slides: Slide[] = [];
  const outline: OutlineSlide[] = [];
  let skippedTotal = 0;

  for (let si = 0; si < slidePaths.length; si++) {
    const doc = parseXml(await zip.file(slidePaths[si])!.async("text"));
    const rels = await slideRels(zip, slidePaths[si]);
    const spTree = firstByTag(doc, NS_P, "spTree");
    const elements: SlideElement[] = [];
    let skipped = 0;

    if (spTree) {
      for (const node of Array.from(spTree.children)) {
        const tag = node.localName;
        if (tag === "sp") {
          const txt = readText(node);
          const ph = phType(node);
          let box = readXfrm(node, scale);
          // 레이아웃 상속으로 xfrm이 없는 플레이스홀더 → 타입 기반 기본 위치
          if (!box && txt) {
            box =
              ph === "title" || ph === "ctrTitle"
                ? { x: 96, y: 80, w: dims.w - 192, h: 160 }
                : { x: 96, y: 260, w: dims.w - 192, h: dims.h - 360 };
          }
          if (!box) continue;

          const geom = firstByTag(node, NS_A, "prstGeom")?.getAttribute("prst");
          const fill = firstByTag(node, NS_P, "spPr")
            ? (() => {
                const spPr = firstByTag(node, NS_P, "spPr")!;
                const solid = firstByTag(spPr, NS_A, "solidFill");
                const clr = solid ? firstByTag(solid, NS_A, "srgbClr") : null;
                return clr ? "#" + clr.getAttribute("val") : undefined;
              })()
            : undefined;

          // 배경성 도형 (텍스트 없음)
          if (!txt) {
            if (fill && geom && ["rect", "roundRect", "ellipse"].includes(geom)) {
              elements.push({
                id: uid(),
                type: "shape",
                shape: geom === "ellipse" ? "ellipse" : geom === "roundRect" ? "roundRect" : "rect",
                ...box,
                fill,
                ...(geom === "roundRect" ? { radius: 16 } : {}),
              });
            } else if (geom) {
              skipped++;
            }
            continue;
          }

          // 도형 배경이 있는 텍스트 → 배경 rect + 텍스트 2요소
          if (fill && geom && ["rect", "roundRect"].includes(geom)) {
            elements.push({
              id: uid(),
              type: "shape",
              shape: geom === "roundRect" ? "roundRect" : "rect",
              ...box,
              fill,
              ...(geom === "roundRect" ? { radius: 16 } : {}),
            });
          }
          const role = roleFor(ph, txt.fontSize, dims);
          const textEl: TextElement = {
            id: uid(),
            type: "text",
            ...box,
            text:
              txt.bulleted && txt.paras.length > 1
                ? txt.paras.map((l) => "•  " + l.replace(/^[•·▪‣-]\s*/, "")).join("\n")
                : txt.text,
            role,
            ...(txt.fontSize ? { fontSize: txt.fontSize } : {}),
            ...(txt.bold ? { fontWeight: 700 } : {}),
            ...(txt.color ? { color: txt.color } : {}),
            ...(txt.align ? { align: txt.align } : {}),
          };
          elements.push(textEl);
        } else if (tag === "pic") {
          const box = readXfrm(node, scale);
          const blip = firstByTag(node, NS_A, "blip");
          const embed = blip?.getAttributeNS(NS_R, "embed");
          const mediaPath = embed ? rels.get(embed) : undefined;
          const mediaFile = mediaPath ? zip.file(mediaPath) : null;
          if (box && mediaFile) {
            const ext = mediaPath!.split(".").pop()!.toLowerCase();
            const mime = MIME[ext];
            if (mime) {
              const b64 = await mediaFile.async("base64");
              elements.push({
                id: uid(),
                type: "image",
                ...box,
                src: `data:${mime};base64,${b64}`,
                fit: "contain",
              });
            } else skipped++;
          } else skipped++;
        } else if (["graphicFrame", "grpSp", "cxnSp"].includes(tag)) {
          skipped++; // 차트/표/그룹/연결선 — MVP 범위 외
        }
      }
    }

    skippedTotal += skipped;
    slides.push({
      id: uid(),
      layout: "title-bullets",
      elements,
      ...(skipped > 0
        ? { notes: `가져오기에서 제외된 요소 ${skipped}개 (차트·표·그룹 등)` }
        : {}),
    });

    // Reference용 아웃라인: 제목 = title/최대 폰트 텍스트, 불릿 = 나머지 줄
    const texts = elements.filter((e): e is TextElement => e.type === "text");
    const titleEl =
      texts.find((t) => t.role === "title") ??
      [...texts].sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0))[0];
    const bullets = texts
      .filter((t) => t !== titleEl)
      .flatMap((t) => t.text.split("\n"))
      .map((l) => l.replace(/^[•☐✓✗·▪‣-]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((l) => (l.length > 60 ? l.slice(0, 60) + "…" : l));
    outline.push({
      index: si,
      title: (titleEl?.text.split("\n")[0] ?? `슬라이드 ${si + 1}`).slice(0, 60),
      bullets,
      viz: null,
    });
  }

  const now = Date.now();
  const title = file.name.replace(/\.pptx?$/i, "");
  return {
    fileName: file.name,
    slideCount: slides.length,
    skipped: skippedTotal,
    outline,
    deck: {
      id: uid(),
      title,
      themeId: "clean-light",
      aspect,
      slides,
      createdAt: now,
      updatedAt: now,
    },
  };
}
