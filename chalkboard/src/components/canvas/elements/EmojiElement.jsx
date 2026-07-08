import { useRef, useEffect } from "react";
import { Text, Transformer } from "react-konva";

export default function EmojiElement({ el, isSelected, onSelect, onChange, draggable }) {
  const { emoji = "❤️", x = 0, y = 0, size = 64, rotation = 0 } = el.data || {};
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
    const newSize = Math.max(16, size * sx);
    n.scaleX(1);
    n.scaleY(1);
    onChange && onChange({ x: n.x(), y: n.y(), size: newSize, rotation: n.rotation() });
  };

  return (
    <>
      <Text
        ref={nodeRef}
        text={emoji}
        x={x}
        y={y}
        fontSize={size}
        rotation={rotation}
        draggable={draggable}
        opacity={el._pending ? 0.6 : 1}
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
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 16 ? oldBox : newBox)}
        />
      )}
    </>
  );
}
