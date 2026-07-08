import { useRef, useEffect } from "react";
import { Image as KImage, Rect, Transformer } from "react-konva";
import useImage from "use-image";

export default function ImageElement({ el, isSelected, onSelect, onChange, draggable }) {
  const { url, x = 0, y = 0, w = 240, h = 160, rotation = 0 } = el.data || {};
  const [img] = useImage(url, "anonymous");
  const nodeRef = useRef(null);
  const trRef = useRef(null);

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer() && trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, img]);

  const commitTransform = () => {
    const n = nodeRef.current;
    if (!n) return;
    const sx = n.scaleX();
    const sy = n.scaleY();
    const nw = Math.max(20, n.width() * sx);
    const nh = Math.max(20, n.height() * sy);
    n.scaleX(1);
    n.scaleY(1);
    onChange && onChange({ x: n.x(), y: n.y(), w: nw, h: nh, rotation: n.rotation() });
  };

  const common = {
    ref: nodeRef,
    x,
    y,
    width: w,
    height: h,
    rotation,
    draggable,
    onClick: onSelect,
    onTap: onSelect,
    onMouseDown: onSelect,
    onDragEnd: (e) => onChange && onChange({ x: e.target.x(), y: e.target.y() }),
    onTransformEnd: commitTransform,
    opacity: el._pending ? 0.6 : 1,
  };

  return (
    <>
      {img ? (
        <KImage image={img} {...common} />
      ) : (
        // 로딩 중/실패 시 자리표시
        <Rect {...common} fill="#3a3a3a" stroke="#888" strokeWidth={1} cornerRadius={4} />
      )}
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
        />
      )}
    </>
  );
}
