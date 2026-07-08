import { useRef, useState, useCallback } from "react";
import { Stage, Layer, Rect, Line } from "react-konva";
import { BOARD_BG } from "../../constants/theme";
import ImageElement from "./elements/ImageElement.jsx";
import YoutubeElement from "./elements/YoutubeElement.jsx";
import EmojiElement from "./elements/EmojiElement.jsx";
import TextElement from "./elements/TextElement.jsx";

// 논리 좌표계 고정 1280x720. 칠판(그리기 가능한 나무 프레임 구멍) 영역.
export const STAGE_W = 1280;
export const STAGE_H = 720;
export const BOARD_RECT = { x: 250, y: 150, w: 780, h: 470 };

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const inBoard = (x, y) =>
  x >= BOARD_RECT.x &&
  x <= BOARD_RECT.x + BOARD_RECT.w &&
  y >= BOARD_RECT.y &&
  y <= BOARD_RECT.y + BOARD_RECT.h;

export default function ChalkCanvas({
  board,
  elements = [],
  tool = "select",
  penColor = "#FFFFFF",
  penWidth = 6,
  selectedId,
  setSelectedId,
  onDraw,
  onUpdate,
  onDelete,
  onCursor,
  onPlayVideo,
  canDeleteEl, // (el) => bool
  scale = 1,
}) {
  const [draft, setDraft] = useState(null); // 그리는 중인 선
  const drawingRef = useRef(false);

  const bg = (board && BOARD_BG[board.bgType]) || BOARD_BG.green;

  const getPos = (e) => {
    const stage = e.target.getStage();
    const p = stage && stage.getPointerPosition();
    return p || { x: 0, y: 0 };
  };

  const handlePointerDown = (e) => {
    const { x, y } = getPos(e);
    // 빈 칠판/배경 클릭 시 선택 해제
    const name = e.target && e.target.name && e.target.name();
    if (name === "board-bg" || e.target === e.target.getStage()) {
      setSelectedId && setSelectedId(null);
    }
    if (tool === "pen") {
      if (!inBoard(x, y)) return;
      drawingRef.current = true;
      setDraft({ points: [x, y], color: penColor, width: penWidth });
    }
  };

  const handlePointerMove = (e) => {
    const { x, y } = getPos(e);
    onCursor && onCursor(x, y);
    if (tool === "pen" && drawingRef.current && draft) {
      const cx = clamp(x, BOARD_RECT.x, BOARD_RECT.x + BOARD_RECT.w);
      const cy = clamp(y, BOARD_RECT.y, BOARD_RECT.y + BOARD_RECT.h);
      setDraft((d) => (d ? { ...d, points: [...d.points, cx, cy] } : d));
    }
  };

  const handlePointerUp = () => {
    if (tool === "pen" && drawingRef.current && draft) {
      drawingRef.current = false;
      const pts = draft.points;
      if (pts.length >= 4) {
        onDraw && onDraw("drawing", { points: pts, color: draft.color, width: draft.width });
      }
      setDraft(null);
    }
  };

  // 요소 클릭: 지우개면 삭제, 선택 도구면 선택
  const handleElementClick = useCallback(
    (el) => {
      if (tool === "eraser") {
        if (canDeleteEl && canDeleteEl(el)) onDelete && onDelete(el.id);
        return;
      }
      setSelectedId && setSelectedId(el.id);
    },
    [tool, canDeleteEl, onDelete, setSelectedId],
  );

  const ordered = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  return (
    <Stage
      className="bd-stage"
      width={STAGE_W}
      height={STAGE_H}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
      onMouseMove={handlePointerMove}
      onTouchMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onTouchEnd={handlePointerUp}
      style={{ cursor: tool === "pen" ? "crosshair" : "default" }}
    >
      <Layer>
        {/* 칠판 배경 (나무 프레임 구멍에 정렬) */}
        <Rect
          name="board-bg"
          x={BOARD_RECT.x}
          y={BOARD_RECT.y}
          width={BOARD_RECT.w}
          height={BOARD_RECT.h}
          cornerRadius={10}
          fill={bg}
          shadowColor="#000"
          shadowBlur={20}
          shadowOpacity={0.35}
          shadowOffsetY={6}
        />
        {/* 분필 가루 느낌의 옅은 테두리 */}
        <Rect
          x={BOARD_RECT.x + 10}
          y={BOARD_RECT.y + 10}
          width={BOARD_RECT.w - 20}
          height={BOARD_RECT.h - 20}
          cornerRadius={6}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={2}
          listening={false}
        />
      </Layer>

      <Layer>
        {ordered.map((el) => {
          const isSelected = selectedId === el.id && tool === "select";
          if (el.type === "drawing") {
            return (
              <Line
                key={el.id}
                points={el.data.points || []}
                stroke={el.data.color || "#FFFFFF"}
                strokeWidth={el.data.width || 6}
                lineCap="round"
                lineJoin="round"
                tension={0.35}
                opacity={el._pending ? 0.6 : 0.94}
                shadowColor={el.data.color || "#FFFFFF"}
                shadowBlur={3}
                shadowOpacity={0.4}
                hitStrokeWidth={Math.max(14, el.data.width || 6)}
                onClick={() => handleElementClick(el)}
                onTap={() => handleElementClick(el)}
              />
            );
          }
          if (el.type === "image") {
            return (
              <ImageElement
                key={el.id}
                el={el}
                isSelected={isSelected}
                onSelect={() => handleElementClick(el)}
                onChange={(data) => onUpdate && onUpdate(el.id, data)}
                draggable={isSelected}
              />
            );
          }
          if (el.type === "video") {
            return (
              <YoutubeElement
                key={el.id}
                el={el}
                isSelected={isSelected}
                onSelect={() => handleElementClick(el)}
                onChange={(data) => onUpdate && onUpdate(el.id, data)}
                onPlay={() => onPlayVideo && onPlayVideo(el)}
                draggable={isSelected}
              />
            );
          }
          if (el.type === "emoji") {
            return (
              <EmojiElement
                key={el.id}
                el={el}
                isSelected={isSelected}
                onSelect={() => handleElementClick(el)}
                onChange={(data) => onUpdate && onUpdate(el.id, data)}
                draggable={isSelected}
              />
            );
          }
          if (el.type === "text") {
            return (
              <TextElement
                key={el.id}
                el={el}
                isSelected={isSelected}
                onSelect={() => handleElementClick(el)}
                onChange={(data) => onUpdate && onUpdate(el.id, data)}
                draggable={isSelected}
              />
            );
          }
          return null;
        })}

        {/* 그리는 중인 임시 선 */}
        {draft && (
          <Line
            points={draft.points}
            stroke={draft.color}
            strokeWidth={draft.width}
            lineCap="round"
            lineJoin="round"
            tension={0.35}
            opacity={0.9}
            listening={false}
          />
        )}
      </Layer>
    </Stage>
  );
}
