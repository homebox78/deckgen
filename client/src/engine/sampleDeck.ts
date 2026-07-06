// Phase 1 검증용 하드코딩 샘플 덱 — 7종 레이아웃 + 차트 3종 커버
import { composeSlide } from "./layout";
import type { Deck } from "./schema";
import { uid } from "./schema";
import { DEFAULT_THEME_ID, getTheme } from "./themes";

export function createSampleDeck(themeId: string = DEFAULT_THEME_ID): Deck {
  const theme = getTheme(themeId);
  const now = Date.now();
  return {
    id: "sample",
    title: "DeckGen 샘플 덱",
    themeId,
    aspect: "16:9",
    createdAt: now,
    updatedAt: now,
    slides: [
      composeSlide(
        "cover",
        {
          title: "DeckGen 제품 소개",
          subtitle: "AI가 설계하고, 사람이 다듬는 프레젠테이션",
          presenter: "2026. 07. · DeckGen Team",
        },
        theme,
      ),
      composeSlide(
        "title-bullets",
        {
          title: "왜 DeckGen인가",
          bullets: [
            "주제 입력만으로 논리 구조(아웃라인)를 먼저 설계",
            "레이아웃은 결정적 엔진이 계산 — 결과가 흔들리지 않음",
            "캔버스에서 자유롭게 편집하고 AI 채팅으로 수정",
            "편집 가능한 PPTX로 내보내기 (차트 데이터 포함)",
          ],
        },
        theme,
      ),
      composeSlide(
        "title-bullets-chart",
        {
          title: "시장 성장 추이",
          bullets: [
            "AI 프레젠테이션 시장은 연평균 24% 성장 [예시]",
            "문서 자동화 수요가 중소기업까지 확산",
            "생성 품질보다 '편집 가능성'이 구매 결정 요인",
          ],
          chart: {
            chartType: "bar",
            title: "시장 규모 (조원) [예시]",
            labels: ["2023", "2024", "2025", "2026"],
            series: [
              { name: "국내", values: [1.2, 1.8, 2.6, 3.4] },
              { name: "글로벌", values: [4.1, 5.9, 8.2, 11.0] },
            ],
          },
        },
        theme,
      ),
      composeSlide(
        "chart-focus",
        {
          title: "사용자 유지율 변화",
          chart: {
            chartType: "line",
            title: "주간 활성 사용자 유지율 (%) [예시]",
            labels: ["1주", "2주", "4주", "8주", "12주"],
            series: [
              { name: "DeckGen", values: [92, 81, 74, 69, 66] },
              { name: "기존 도구", values: [88, 62, 44, 31, 24] },
            ],
          },
        },
        theme,
      ),
      composeSlide(
        "kpi-cards",
        {
          title: "핵심 지표",
          kpis: [
            { value: "3분", label: "평균 초안 생성 시간" },
            { value: "87%", label: "초안 수용률" },
            { value: "4.6/5", label: "사용자 만족도" },
            { value: "12만", label: "월간 생성 덱 수" },
          ],
        },
        theme,
      ),
      composeSlide(
        "two-column",
        {
          title: "기존 방식 vs DeckGen",
          columns: [
            {
              heading: "기존 방식",
              bullets: ["빈 슬라이드에서 시작", "레이아웃을 손으로 조정", "수정할 때마다 디자인 붕괴"],
            },
            {
              heading: "DeckGen",
              bullets: ["아웃라인부터 AI가 설계", "결정적 레이아웃 엔진", "AI 채팅으로 안전하게 수정"],
            },
          ],
        },
        theme,
      ),
      composeSlide(
        "chart-focus",
        {
          title: "예산 배분",
          chart: {
            chartType: "pie",
            title: "2026 예산 배분 [예시]",
            labels: ["개발", "마케팅", "운영", "기타"],
            series: [{ name: "예산", values: [45, 30, 15, 10] }],
          },
        },
        theme,
      ),
      composeSlide("section", { title: "감사합니다", subtitle: "Q & A" }, theme),
    ].map((s, i) => ({ ...s, id: `sample-${i}-${uid()}` })),
  };
}
