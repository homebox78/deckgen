// §13 스토리보드 와이어프레임 템플릿 — 완성 장표가 아니라 팀이 함께 채우는 골격.
// 모든 요소는 §3 스키마 그대로 → 편집·협업·PPTX 내보내기 동일 동작.
import type { Deck, LayoutId, Slide, SlideElement } from "./schema";
import { SLIDE_H, SLIDE_W, uid } from "./schema";
import { DEFAULT_THEME_ID } from "./themes";

const M = 96; // 공통 여백 (§5)
const CW = SLIDE_W - M * 2;
const BODY_Y = 256;
const BODY_H = SLIDE_H - M - BODY_Y;

const ZONE_FILL = "#F3F3F0";
const ZONE_STROKE = "#C9C9C4";
const LABEL_COLOR = "#8A8A84";
const GUIDE_COLOR = "#B4B4AE";

/** 플레이스홀더 존: 회색 박스 + 중앙 라벨 */
function zone(x: number, y: number, w: number, h: number, label: string): SlideElement[] {
  return [
    {
      id: uid(),
      type: "shape",
      shape: "rect",
      x,
      y,
      w,
      h,
      fill: ZONE_FILL,
      stroke: ZONE_STROKE,
      strokeWidth: 2,
    },
    {
      id: uid(),
      type: "text",
      x: x + 16,
      y: y + h / 2 - 18,
      w: w - 32,
      h: 36,
      text: label,
      role: "caption",
      align: "center",
      color: LABEL_COLOR,
    },
  ];
}

/** 편집해서 채우는 제목 자리 */
function titleSlot(text: string): SlideElement {
  return {
    id: uid(),
    type: "text",
    x: M,
    y: M + 16,
    w: CW,
    h: 128,
    text,
    role: "heading",
    color: GUIDE_COLOR,
  };
}

/** 편집해서 채우는 본문 자리 */
function bodySlot(
  x: number,
  y: number,
  w: number,
  h: number,
  lines: string[],
): SlideElement {
  return {
    id: uid(),
    type: "text",
    x,
    y,
    w,
    h,
    text: lines.map((l) => "•  " + l).join("\n"),
    role: "body",
    color: GUIDE_COLOR,
    lineHeight: 1.7,
  };
}

interface Frame {
  name: string;
  layout: LayoutId;
  guide: string; // 발표자 노트에 들어가는 작성 가이드
  elements: SlideElement[];
}

function frame(f: Frame): Slide {
  return {
    id: uid(),
    layout: f.layout,
    // 라이브러리 정의는 모듈 로드 시 1회 생성되므로, 덱마다 새 id로 복제
    elements: f.elements.map((el) => ({ ...el, id: uid() })),
    notes: `[${f.name}] 작성 가이드\n${f.guide}`,
  };
}

// ===== 프레임 프리셋 =====

const coverFrame = (subtitle: string): Frame => ({
  name: "표지",
  layout: "cover",
  guide: "핵심 메시지를 한 문장으로. 청중이 이 발표에서 얻어갈 것을 약속하세요.",
  elements: [
    { id: uid(), type: "shape", shape: "rect", x: M, y: 360, w: 160, h: 12, fill: "@accent" },
    {
      id: uid(),
      type: "text",
      x: M,
      y: 420,
      w: CW,
      h: 200,
      text: "핵심 메시지를 한 줄로",
      role: "title",
      color: GUIDE_COLOR,
    },
    {
      id: uid(),
      type: "text",
      x: M,
      y: 680,
      w: CW,
      h: 80,
      text: subtitle,
      role: "subtitle",
      color: GUIDE_COLOR,
    },
  ],
});

const textFrame = (name: string, title: string, lines: string[], guide: string): Frame => ({
  name,
  layout: "title-bullets",
  guide,
  elements: [titleSlot(title), bodySlot(M, BODY_Y, CW, BODY_H, lines)],
});

const splitFrame = (
  name: string,
  title: string,
  lines: string[],
  zoneLabel: string,
  guide: string,
): Frame => {
  const gap = 48;
  const leftW = Math.round(CW * 0.55) - gap / 2;
  const rightW = CW - leftW - gap;
  return {
    name,
    layout: "title-bullets-chart",
    guide,
    elements: [
      titleSlot(title),
      bodySlot(M, BODY_Y, leftW, BODY_H, lines),
      ...zone(M + leftW + gap, BODY_Y, rightW, BODY_H, zoneLabel),
    ],
  };
};

const mediaFrame = (name: string, title: string, zoneLabel: string, guide: string): Frame => ({
  name,
  layout: "chart-focus",
  guide,
  elements: [titleSlot(title), ...zone(M + 120, BODY_Y, CW - 240, BODY_H, zoneLabel)],
});

const cardsFrame = (name: string, title: string, labels: string[], guide: string): Frame => {
  const gap = 32;
  const cardW = (CW - gap * (labels.length - 1)) / labels.length;
  const cardH = 320;
  const cardY = BODY_Y + (BODY_H - cardH) / 2;
  return {
    name,
    layout: "kpi-cards",
    guide,
    elements: [
      titleSlot(title),
      ...labels.flatMap((label, i) =>
        zone(M + i * (cardW + gap), cardY, cardW, cardH, label),
      ),
    ],
  };
};

const closingFrame = (title: string, subtitle: string): Frame => ({
  name: "마무리",
  layout: "section",
  guide: "요청 사항(CTA)을 명확하게. 다음 액션과 연락처를 남기세요.",
  elements: [
    {
      id: uid(),
      type: "text",
      x: M,
      y: SLIDE_H / 2 - 120,
      w: CW,
      h: 160,
      text: title,
      role: "title",
      align: "center",
      color: GUIDE_COLOR,
    },
    {
      id: uid(),
      type: "text",
      x: M,
      y: SLIDE_H / 2 + 70,
      w: CW,
      h: 70,
      text: subtitle,
      role: "subtitle",
      align: "center",
      color: GUIDE_COLOR,
    },
  ],
});

// ===== 라이브러리 =====

export interface WireframeLibrary {
  id: string;
  name: string;
  desc: string;
  frames: Frame[];
}

export const WIREFRAME_LIBRARIES: WireframeLibrary[] = [
  {
    id: "proposal",
    name: "제안서 스토리보드",
    desc: "문제 → 해결 → 근거 → 실행의 설득 흐름",
    frames: [
      coverFrame("제안 대상 · 날짜 · 제안자"),
      textFrame(
        "문제 정의",
        "고객이 겪는 문제는?",
        ["현상: 지금 무슨 일이 벌어지고 있나", "원인: 왜 발생하나", "비용: 방치하면 무엇을 잃나"],
        "듣는 사람의 언어로 문제를 정의하세요. 숫자가 있으면 여기부터 쓰세요.",
      ),
      textFrame(
        "해결 방안",
        "우리의 제안",
        ["제안 1: 무엇을 어떻게", "제안 2: 무엇을 어떻게", "제안 3: 무엇을 어떻게"],
        "문제 정의와 1:1로 대응되게. 3개를 넘기지 마세요.",
      ),
      splitFrame(
        "근거 데이터",
        "왜 효과가 있는가",
        ["근거 1: 데이터/사례", "근거 2: 데이터/사례"],
        "📊 차트 영역 — 지시문: 어떤 수치를 비교?",
        "차트 영역에는 나중에 실제 차트를 넣거나 AI 채팅으로 생성하세요.",
      ),
      cardsFrame(
        "실행 계획",
        "일정과 단계",
        ["1단계\n(기간)", "2단계\n(기간)", "3단계\n(기간)"],
        "단계별 산출물과 기간을 카드에 채우세요.",
      ),
      closingFrame("요청 드립니다", "CTA — 승인/예산/미팅 등 구체적 요청"),
    ],
  },
  {
    id: "pitch",
    name: "피치덱 스토리보드",
    desc: "투자 유치 표준 8프레임",
    frames: [
      coverFrame("회사명 · 한 줄 소개 · 라운드"),
      textFrame(
        "문제",
        "이 문제는 크고, 아프다",
        ["누가 겪나", "얼마나 자주/크게 겪나", "지금의 대안은 왜 부족한가"],
        "시장 크기보다 '고통의 강도'를 먼저 보여주세요.",
      ),
      splitFrame(
        "솔루션",
        "우리는 이렇게 푼다",
        ["핵심 기능/접근 1", "핵심 기능/접근 2"],
        "🖼 제품 스크린샷/데모 영역",
        "데모 이미지를 넣거나 시연 장면을 캡처해 채우세요.",
      ),
      mediaFrame(
        "시장",
        "시장 규모와 성장",
        "📊 TAM/SAM/SOM 차트 영역",
        "상향식 계산 근거를 노트에 함께 적어두면 질문에 강해집니다.",
      ),
      mediaFrame(
        "트랙션",
        "숫자로 증명",
        "📈 성장 지표 차트 영역 (MAU/매출/리텐션)",
        "우상향 지표 하나를 크게. 없으면 파일럿/LOI라도.",
      ),
      cardsFrame(
        "비즈니스 모델",
        "어떻게 버나",
        ["가격 정책", "고객 획득", "단위 경제성"],
        "카드마다 핵심 수치 1개씩만.",
      ),
      cardsFrame(
        "팀",
        "왜 우리인가",
        ["CEO\n(핵심 이력)", "CTO\n(핵심 이력)", "핵심 멤버\n(핵심 이력)"],
        "이 문제를 풀 자격을 증명하는 이력만 남기세요.",
      ),
      closingFrame("투자 제안", "라운드 규모 · 사용 계획 · 마일스톤"),
    ],
  },
  {
    id: "product",
    name: "제품 소개 스토리보드",
    desc: "고객 여정 중심 5프레임",
    frames: [
      coverFrame("제품명 · 타깃 고객 한 줄"),
      textFrame(
        "고객의 하루",
        "지금 고객은 이렇게 일한다",
        ["불편 장면 1", "불편 장면 2", "불편 장면 3"],
        "스토리로 시작하세요. 페르소나 한 명의 하루를 그리면 됩니다.",
      ),
      mediaFrame(
        "제품 데모",
        "제품이 바꾸는 장면",
        "🖼 제품 화면/데모 영역",
        "Before의 불편 장면과 대비되는 After 화면을 넣으세요.",
      ),
      splitFrame(
        "차별점",
        "기존 대안과 무엇이 다른가",
        ["차별점 1", "차별점 2", "차별점 3"],
        "📊 비교 표/차트 영역",
        "경쟁사 이름을 피하고 '기존 방식'과 비교해도 됩니다.",
      ),
      closingFrame("다음 단계", "무료 체험 · 문의 · 도입 절차"),
    ],
  },
  {
    id: "blank",
    name: "빈 스토리보드",
    desc: "최소 골격 3프레임에서 자유롭게",
    frames: [
      coverFrame("부제 · 발표자"),
      textFrame(
        "본문",
        "섹션 제목",
        ["포인트 1", "포인트 2", "포인트 3"],
        "프레임을 복제해 흐름을 늘려가세요.",
      ),
      closingFrame("마무리", "요약 · 다음 액션"),
    ],
  },
];

/** 라이브러리 → 즉시 편집 가능한 스토리보드 덱 생성 (AI 호출 없음) */
export function createStoryboardDeck(
  libraryId: string,
  themeId: string = DEFAULT_THEME_ID,
): Deck | null {
  const lib = WIREFRAME_LIBRARIES.find((l) => l.id === libraryId);
  if (!lib) return null;
  const now = Date.now();
  return {
    id: uid(),
    title: `${lib.name} (초안)`,
    themeId,
    aspect: "16:9",
    slides: lib.frames.map(frame),
    createdAt: now,
    updatedAt: now,
  };
}
