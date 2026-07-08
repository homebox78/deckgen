import { HAZARD_YELLOW } from "../../constants/theme";

// CSS 전봇대 — 흰 감김 + 노랑/검정 사선 안전띠 + 전단지 자리.
export default function UtilityPole({ side = "left" }) {
  return (
    <div className={`st-pole st-pole--${side}`}>
      <div className="st-pole-body">
        {/* 안전 사선띠 */}
        <div
          className="st-pole-hazard"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, ${HAZARD_YELLOW} 0 10px, #1a1a1a 10px 20px)`,
          }}
        />
        {/* 전단지(flyer) 자리표시 */}
        <div className="st-flyer">
          <span className="st-flyer-tit">벼룩시장</span>
          <span className="st-flyer-line" />
          <span className="st-flyer-line short" />
          <div className="st-flyer-tabs">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
        </div>
      </div>
      {/* 전선 연결부 */}
      <div className="st-pole-arm" />
    </div>
  );
}
