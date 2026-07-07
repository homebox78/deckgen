// §13 스토리보드 와이어프레임 템플릿 — 완성 장표가 아니라 팀이 함께 채우는 골격.
// 모든 요소는 §3 스키마 그대로 → 편집·협업·PPTX 내보내기 동일 동작.
import type { Deck, DeckAspect, LayoutId, Slide, SlideElement } from "./schema";
import { SLIDE_H, SLIDE_W, aspectDims, uid } from "./schema";
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
  aspect: DeckAspect;
  frames: Frame[];
}

export const WIREFRAME_LIBRARIES: WireframeLibrary[] = [
  {
    id: "proposal",
    name: "제안서 스토리보드",
    desc: "문제 → 해결 → 근거 → 실행의 설득 흐름",
    aspect: "16:9",
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
    aspect: "16:9",
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
    aspect: "16:9",
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
    aspect: "16:9",
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

// ===== 4:5 카드뉴스 캐러셀 라이브러리 (1080×1350, 안전영역 M=84) =====

const C = aspectDims("4:5");
const CM = 84;
const CCW = C.w - CM * 2;
const C_BODY_Y = 300;
const C_BODY_H = C.h - CM - C_BODY_Y;

function cTitle(textStr: string, y = CM + 24, h = 170): SlideElement {
  return {
    id: uid(),
    type: "text",
    x: CM,
    y,
    w: CCW,
    h,
    text: textStr,
    role: "heading",
    fontSize: 48,
    color: GUIDE_COLOR,
  };
}

function cBody(lines: string[], y = C_BODY_Y, h = C_BODY_H): SlideElement {
  return {
    id: uid(),
    type: "text",
    x: CM,
    y,
    w: CCW,
    h,
    text: lines.map((l) => "•  " + l).join("\n"),
    role: "body",
    color: GUIDE_COLOR,
    lineHeight: 1.7,
  };
}

/** 훅 커버 — 발표 제목이 아니라 피드에서 멈추게 하는 문장 */
const cHook = (hook: string, sub: string): Frame => ({
  name: "훅 커버",
  layout: "cover",
  guide:
    "스크롤을 멈추게 하는 한 문장. 질문·반전·숫자가 잘 먹혀요. 페이지 번호·로고는 넣지 않습니다.",
  elements: [
    { id: uid(), type: "shape", shape: "rect", x: CM, y: 430, w: 120, h: 10, fill: "@accent" },
    {
      id: uid(),
      type: "text",
      x: CM,
      y: 480,
      w: CCW,
      h: 300,
      text: hook,
      role: "title",
      fontSize: 62,
      color: GUIDE_COLOR,
    },
    {
      id: uid(),
      type: "text",
      x: CM,
      y: 830,
      w: CCW,
      h: 80,
      text: sub,
      role: "subtitle",
      color: GUIDE_COLOR,
    },
  ],
});

const cTextFrame = (name: string, title: string, lines: string[], guide: string): Frame => ({
  name,
  layout: "title-bullets",
  guide,
  elements: [cTitle(title), cBody(lines)],
});

const cZoneFrame = (name: string, title: string, zoneLabel: string, guide: string): Frame => ({
  name,
  layout: "chart-focus",
  guide,
  elements: [cTitle(title), ...zone(CM, C_BODY_Y, CCW, C_BODY_H, zoneLabel)],
});

/** 위/아래 2존 (전후 비교 · Do/Don't) */
const cCompareFrame = (
  name: string,
  title: string,
  topLabel: string,
  bottomLabel: string,
  guide: string,
): Frame => {
  const gap = 40;
  const zoneH = (C_BODY_H - gap) / 2;
  return {
    name,
    layout: "two-column",
    guide,
    elements: [
      cTitle(title),
      ...zone(CM, C_BODY_Y, CCW, zoneH, topLabel),
      ...zone(CM, C_BODY_Y + zoneH + gap, CCW, zoneH, bottomLabel),
    ],
  };
};

const cChecklistFrame = (name: string, title: string, items: string[], guide: string): Frame => ({
  name,
  layout: "title-bullets",
  guide,
  elements: [
    cTitle(title),
    {
      id: uid(),
      type: "text",
      x: CM,
      y: C_BODY_Y,
      w: CCW,
      h: C_BODY_H,
      text: items.map((l) => "☐  " + l).join("\n"),
      role: "body",
      color: GUIDE_COLOR,
      lineHeight: 1.9,
    },
  ],
});

/** 마지막 장 = 행동 하나로 닫는 CTA */
const cCtaFrame = (title: string, sub: string): Frame => ({
  name: "CTA",
  layout: "section",
  guide: "여러 말 대신 지금 바로 할 수 있는 행동 하나. 저장·팔로우·신청 중 하나만 고르세요.",
  elements: [
    {
      id: uid(),
      type: "text",
      x: CM,
      y: C.h / 2 - 160,
      w: CCW,
      h: 220,
      text: title,
      role: "title",
      align: "center",
      fontSize: 56,
      color: GUIDE_COLOR,
    },
    {
      id: uid(),
      type: "text",
      x: CM,
      y: C.h / 2 + 90,
      w: CCW,
      h: 80,
      text: sub,
      role: "subtitle",
      align: "center",
      color: GUIDE_COLOR,
    },
  ],
});

export const CAROUSEL_LIBRARIES: WireframeLibrary[] = [
  {
    id: "carousel-magazine",
    name: "Magazine 캐러셀",
    desc: "인사이트·에디토리얼 흐름, 큰 이미지",
    aspect: "4:5",
    frames: [
      cHook("멈추게 하는 훅 한 문장", "이 캐러셀이 다루는 것 한 줄"),
      cTextFrame(
        "주장",
        "핵심 주장 한 줄",
        ["왜 지금 이 이야기인가", "통념과 다른 지점"],
        "매거진처럼 — 한 장에 주장 하나, 짧게.",
      ),
      cZoneFrame(
        "인사이트 + 이미지",
        "장면이 보여주는 인사이트",
        "🖼 큰 이미지 영역 (인물/장면)",
        "이미지가 주인공. 텍스트는 캡션처럼 짧게.",
      ),
      cTextFrame(
        "인사이트",
        "두 번째 인사이트",
        ["구체적 사례 한 줄", "그래서 뭐가 달라지나"],
        "사례 → 의미 순서로.",
      ),
      cTextFrame(
        "테이크어웨이",
        "“기억할 한 문장”",
        ["오늘 가져갈 것 하나"],
        "인용 카드 — 저장을 부르는 문장으로.",
      ),
      cCtaFrame("저장해두고 다시 보세요", "팔로우하면 다음 이야기도 받아요"),
    ],
  },
  {
    id: "carousel-guide",
    name: "Guide 캐러셀",
    desc: "저장 가치 높은 튜토리얼 · 체크리스트",
    aspect: "4:5",
    frames: [
      cHook("아직도 이렇게 하세요?", "3분이면 바뀌는 방법"),
      cTextFrame(
        "왜 문제인가",
        "대부분 여기서 실수합니다",
        ["흔한 실수 하나", "그 실수의 진짜 비용"],
        "2장은 목차가 아니라 긴장감 — 계속 넘기게.",
      ),
      cCompareFrame(
        "전후 비교",
        "Before → After",
        "✗ Before — 흔한 방식",
        "✓ After — 바꾼 방식",
        "전후 비교는 저장률이 가장 높은 구조예요.",
      ),
      cTextFrame(
        "방법",
        "이렇게 하세요",
        ["1단계: 무엇을", "2단계: 어떻게", "3단계: 확인"],
        "한 장에 3단계까지만.",
      ),
      cChecklistFrame(
        "체크리스트",
        "저장용 체크리스트",
        ["항목 1", "항목 2", "항목 3", "항목 4"],
        "스크린샷 찍어두고 싶게 — 항목은 동사로 시작.",
      ),
      cZoneFrame(
        "미니 템플릿",
        "그대로 쓰는 템플릿",
        "📝 복사해 쓰는 문장/표 영역",
        "빈칸 채우기 형태면 더 좋아요.",
      ),
      cCtaFrame("지금 하나만 해보세요", "저장하고 첫 항목부터"),
    ],
  },
  {
    id: "carousel-event",
    name: "Event 캐러셀",
    desc: "행사·캠페인 홍보, 신청 CTA로 닫기",
    aspect: "4:5",
    frames: [
      cHook("행사명 — 한 줄 훅", "날짜 · 장소 · 대상"),
      cTextFrame(
        "왜 와야 하나",
        "이런 분에게 필요해요",
        ["대상 1 — 얻어갈 것", "대상 2 — 얻어갈 것"],
        "일정 나열 대신 '누가 왜'부터.",
      ),
      cTextFrame(
        "하이라이트",
        "이번에 준비한 것",
        ["세션/프로그램 1", "세션/프로그램 2", "특별한 한 가지"],
        "기대 포인트 3개까지만.",
      ),
      cZoneFrame(
        "기대 장면",
        "현장에서 만나는 장면",
        "🖼 현장/연사/제품 이미지 영역",
        "지난 행사 사진이 있으면 최고예요.",
      ),
      cCtaFrame("지금 신청하세요", "링크는 프로필/댓글에 · 마감 D-?"),
    ],
  },
  {
    id: "carousel-playbook",
    name: "Playbook 캐러셀",
    desc: "실행 기준 · 스크립트 · Do/Don't",
    aspect: "4:5",
    frames: [
      cHook("팀에 하나씩 공유하는 플레이북", "캡처해두고 그대로 쓰세요"),
      cTextFrame(
        "원칙",
        "판단 기준 3가지",
        ["기준 1 — 언제 쓰나", "기준 2 — 언제 쓰나", "기준 3 — 언제 쓰나"],
        "의사결정 기준을 명사형으로.",
      ),
      cCompareFrame(
        "Do / Don't",
        "Do & Don't",
        "✓ Do — 이렇게",
        "✗ Don't — 이건 금지",
        "한 장 캡처로 끝나게 — 각 존에 2줄까지만.",
      ),
      cZoneFrame(
        "스크립트",
        "그대로 말하는 스크립트",
        "💬 상황별 문장 영역",
        "실제 문장 그대로 — 따옴표로.",
      ),
      cChecklistFrame(
        "운영 체크리스트",
        "실행 전 체크",
        ["체크 1", "체크 2", "체크 3", "체크 4"],
        "실행 직전에 보는 목록.",
      ),
      cCtaFrame("팀 채널에 공유하세요", "다음 플레이북 주제는 댓글로"),
    ],
  },
];

const ALL_LIBRARIES = [...WIREFRAME_LIBRARIES, ...CAROUSEL_LIBRARIES];

/** 라이브러리 → 즉시 편집 가능한 스토리보드 덱 생성 (AI 호출 없음) */
export function createStoryboardDeck(
  libraryId: string,
  themeId: string = DEFAULT_THEME_ID,
): Deck | null {
  const lib = ALL_LIBRARIES.find((l) => l.id === libraryId);
  if (!lib) return null;
  const now = Date.now();
  return {
    id: uid(),
    title: `${lib.name} (초안)`,
    themeId,
    aspect: lib.aspect,
    slides: lib.frames.map(frame),
    createdAt: now,
    updatedAt: now,
  };
}
