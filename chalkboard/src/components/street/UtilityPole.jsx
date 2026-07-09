import { HAZARD_YELLOW } from "../../constants/theme";

// CSS 전봇대 — 넓은 기둥 + 노랑/검정 안전띠 + 광고판/전단지 부착 자리.
export default function UtilityPole({ side = "left" }) {
  return (
    <div className={`st-pole st-pole--${side}`}>
      {/* 전선 연결 가로대 */}
      <div className="st-pole-arm" />
      <div className="st-pole-body">
        {/* 안전 사선띠 */}
        <div
          className="st-pole-hazard"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, ${HAZARD_YELLOW} 0 12px, #1a1a1a 12px 24px)`,
          }}
        />

        {/* 광고판 — 큰 포스터 부착 자리 */}
        <div className="st-adboard">
          <span className="st-adboard-tit">광고 자리</span>
          <span className="st-adboard-sub">여기에 붙이세요</span>
          <span className="st-adboard-body" />
        </div>

        {/* 전단지(벼룩시장) */}
        <div className="st-flyer">
          <span className="st-flyer-tit">벼룩시장</span>
          <span className="st-flyer-line" />
          <span className="st-flyer-line short" />
          <div className="st-flyer-tabs">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
