// 등급별 편집 권한 — 서버(Street.php GRADE_CAP)와 반드시 일치. 프론트는 잠금/숨김, 서버가 재검증.
export const GRADE_INFO = {
  1: { name: "새싹", emoji: "🌱", colors: 3 },
  2: { name: "단골", emoji: "☕", colors: 5 },
  3: { name: "열정", emoji: "🔥", colors: 5 },
  4: { name: "마스터", emoji: "👑", colors: 5 },
};

export const GRADE_CAP = {
  1: { drawing: true, emoji: false, image: false, video: false, text: false, colors: 3 },
  2: { drawing: true, emoji: true, image: false, video: false, text: false, colors: 5 },
  3: { drawing: true, emoji: true, image: true, video: false, text: true, colors: 5 },
  4: { drawing: true, emoji: true, image: true, video: true, text: true, colors: 5 },
};

export function can(grade, tool) {
  return !!(GRADE_CAP[grade] || GRADE_CAP[1])[tool];
}

// 분필 색 팔레트 (등급별 개수 제한)
export const CHALK_COLORS = ["#FFFFFF", "#FFE066", "#FF6B6B", "#4ECDC4", "#A66CFF"];
