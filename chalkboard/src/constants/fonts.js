// 폰트 시스템 — 눈누 상업용 무료 폰트, 6개 카테고리. 글 작성 시 선택 가능.
// family = @font-face font-family (src/styles/fonts.css), name = 표시 이름.

export const DEFAULT_FONT = "Moneygraphy-Pixel"; // ★ 전체 기본 디폴트(머니그라피 픽셀)

// 픽셀 폰트 등 latin/공백 대비 폴백 스택
export const FALLBACK = "'Gaegu', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
export const fontStack = (family) => `"${family}", ${FALLBACK}`;

export const FONT_CATEGORIES = [
  {
    key: "hand",
    label: "손글씨",
    emoji: "✍️",
    fonts: [
      { family: "Ownglyph_corncorn", name: "온글잎 콘콘체" },
      { family: "KyoboHandwriting2024psw", name: "교보 손글씨" },
      { family: "Griun_Gellyroll", name: "그리운 겔리롤" },
      { family: "HSYuji", name: "HS유지체" },
      { family: "EF_hyunydororong", name: "혀니 도로롱" },
    ],
  },
  {
    key: "round",
    label: "둥글둥글",
    emoji: "🍡",
    fonts: [
      { family: "Cafe24Dongdong", name: "카페24 동동" },
      { family: "Bazzi", name: "넥슨 배찌체" },
      { family: "BinggraeSamanco", name: "빙그레 싸만코" },
      { family: "HakgyoansimTTeokbokki", name: "학교안심 떡볶이" },
    ],
  },
  {
    key: "clear",
    label: "또박또박",
    emoji: "📖",
    fonts: [
      { family: "HakgyoansimNalgae", name: "학교안심 날개" },
      { family: "KOTRAHOPE", name: "코트라 희망체" },
      { family: "IM_Hyemin", name: "IM 혜민체" },
      { family: "GmarketSans", name: "G마켓 산스" },
      { family: "S-CoreDream", name: "에스코어드림" },
    ],
  },
  {
    key: "bold",
    label: "굵게·강조",
    emoji: "💪",
    fonts: [
      { family: "Jalnan", name: "여기어때 잘난체" },
      { family: "DaeguDongseongro", name: "대구 동성로" },
      { family: "BMEULJIRO", name: "을지로체" },
    ],
  },
  {
    key: "emotion",
    label: "감성·명조",
    emoji: "🌸",
    fonts: [
      { family: "GriunCherry1Spoon", name: "체리 한스푼" },
      { family: "YoonChildfundkorea", name: "윤 초록우산" },
      { family: "ChosunGs", name: "조선 궁서체" },
    ],
  },
  {
    key: "pixel",
    label: "픽셀·레트로",
    emoji: "🕹️",
    fonts: [
      { family: "Moneygraphy-Pixel", name: "머니그라피 픽셀" },
      { family: "ChosunGu", name: "조선 굴림체" },
    ],
  },
];

// family → 표시 이름 (없으면 family)
export const FONT_NAME = {};
FONT_CATEGORIES.forEach((c) => c.fonts.forEach((f) => (FONT_NAME[f.family] = f.name)));
