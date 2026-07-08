import { useRef, useEffect } from "react";
import { Text, Transformer } from "react-konva";
import { CHALK_FONT } from "../../../constants/theme";

export default function TextElement({ el, isSelected, onSelect, onChange, draggable }) {
  const { text = "", x = 0, y = 0, color = "#FFFFFF", fontSize = 48, rotation = 0 } = el.data || {};
  const nodeRef = useRef(null);
  const trRef = useRef(null);

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer() && trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

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
        fontFamily={CHALK_FONT}
        rotation={rotation}
        draggable={draggable}
        opacity={el._pending ? 0.6 : 1}
        shadowColor={color}
        shadowBlur={2}
        shadowOpacity={0.3}
        onClick={onSelect}
        onTap={onSelect}
        onMouseDown={onSelect}
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
