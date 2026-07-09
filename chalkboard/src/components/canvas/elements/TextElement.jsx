import { useRef, useEffect } from "react";
import { Text, Transformer } from "react-konva";
import { DEFAULT_FONT } from "../../../constants/fonts";

export default function TextElement({ el, isSelected, onSelect, onChange, onLiveMove, draggable }) {
  const { text = "", x = 0, y = 0, color = "#FFFFFF", fontSize = 48, rotation = 0, font = DEFAULT_FONT } = el.data || {};
  const nodeRef = useRef(null);
  const trRef = useRef(null);

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer() && trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  // 웹폰트는 비동기 로드 — 로드 완료 시 konva 레이어 재드로우(안 하면 폴백으로 굳음)
  useEffect(() => {
    if (!font || !document.fonts) return;
    let alive = true;
    document.fonts.load(`${fontSize}px "${font}"`).then(() => {
      if (alive && nodeRef.current) {
        const layer = nodeRef.current.getLayer();
        layer && layer.batchDraw();
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [font, fontSize, text]);

  const commitTransform = () => {
    const n = nodeRef.current;
    if (!n) return;
    const sx = n.scaleX();
    const newSize = Math.max(12, fontSize * sx);
    n.scaleX(1);
    n.scaleY(1);
    onChange && onChange({ x: n.x(), y: n.y(), fontSize: newSize, rotation: n.rotation() });
  };

  return (
    <>
      <Text
        ref={nodeRef}
        text={text || "…"}
        x={x}
        y={y}
        fill={color}
        fontSize={fontSize}
        fontFamily={font}
        rotation={rotation}
        draggable={draggable}
        opacity={el._pending ? 0.6 : 1}
        shadowColor={color}
        shadowBlur={2}
        shadowOpacity={0.3}
        onClick={onSelect}
        onTap={onSelect}
        onMouseDown={onSelect}
        onDragMove={(e) => onLiveMove && onLiveMove({ x: e.target.x(), y: e.target.y() })}
        onDragEnd={(e) => onChange && onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={commitTransform}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 ? oldBox : newBox)}
        />
      )}
    </>
  );
}
