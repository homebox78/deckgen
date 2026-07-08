import { SKY_TONE, FRAME_WOOD, FRAME_WOOD_DARK } from "../../constants/theme";
import { BOARD_RECT, STAGE_W, STAGE_H } from "../canvas/ChalkCanvas.jsx";
import UtilityPole from "./UtilityPole.jsx";
import Signboard from "./Signboard.jsx";

// 순수 CSS/DOM 거리 배경. 하늘·바닥·전봇대 2개·간판·중앙 칠판 나무 프레임.
// konva Stage 는 이 프레임 구멍(BOARD_RECT) 위에 페이지가 겹쳐 배치한다.
export default function StreetScene({ board }) {
  const sky = (board && SKY_TONE[board.skyTone]) || SKY_TONE.day;
  const signStyle = (board && board.signboardStyle) || "a";
  const pad = 22; // 나무 프레임 두께

  return (
    <div className="st-scene" style={{ width: STAGE_W, height: STAGE_H }}>
      {/* 하늘 */}
      <div className="st-sky" style={{ background: sky }} />
      {/* 바닥 */}
      <div className="st-ground" />

      {/* 간판 (칠판 위쪽) */}
      <div
        className="st-sign-slot"
        style={{ left: BOARD_RECT.x, top: 18, width: BOARD_RECT.w }}
      >
        <Signboard style={signStyle} />
      </div>

      {/* 전봇대 좌우 */}
      <UtilityPole side="left" />
      <UtilityPole side="right" />

      {/* 중앙 칠판 나무 프레임 (가운데는 뚫린 구멍 → Stage가 올라옴) */}
      <div
        className="st-frame"
        style={{
          left: BOARD_RECT.x - pad,
          top: BOARD_RECT.y - pad,
          width: BOARD_RECT.w + pad * 2,
          height: BOARD_RECT.h + pad * 2,
          background: `linear-gradient(135deg, ${FRAME_WOOD}, ${FRAME_WOOD_DARK})`,
          padding: pad,
        }}
      >
        <div className="st-frame-hole" />
        {/* 프레임 상단 걸이 */}
        <div className="st-frame-nail st-frame-nail--l" />
        <div className="st-frame-nail st-frame-nail--r" />
      </div>
    </div>
  );
}
