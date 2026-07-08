// 다른 참여자들의 실시간 커서 (DOM 오버레이).
// 논리 좌표(1280x720) 그대로 배치 — 부모(.bd-scaled)의 CSS transform이 화면 스케일을 처리.
export default function Cursors({ peers = [], scale = 1 }) {
  const inv = scale ? 1 / scale : 1; // 라벨은 화면상 일정 크기 유지
  return (
    <div className="bd-cursors">
      {peers
        .filter((p) => p && p.cursor)
        .map((p) => (
          <div
            key={p.clientId}
            className="bd-cursor"
            style={{ left: p.cursor.x, top: p.cursor.y, transform: `scale(${inv})` }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" className="bd-cursor-arrow">
              <path
                d="M2 2 L2 15 L6 11 L9 17 L11 16 L8 10 L14 10 Z"
                fill={p.color || "#fff"}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth="1"
              />
            </svg>
            <span className="bd-cursor-name" style={{ background: p.color || "#333" }}>
              {p.name || "손님"}
            </span>
          </div>
        ))}
    </div>
  );
}
