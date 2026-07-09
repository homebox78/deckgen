import { useRef, useEffect } from "react";
import { Image as KImage, Group, Rect, Circle, Text, Transformer } from "react-konva";
import useImage from "use-image";
import { youtubeThumb } from "../../../utils/youtube";

export default function YoutubeElement({ el, isSelected, onSelect, onChange, onPlay, onLiveMove, draggable }) {
  const { youtubeId, x = 0, y = 0, w = 320, h = 180, rotation = 0 } = el.data || {};
  const [thumb] = useImage(youtubeId ? youtubeThumb(youtubeId) : "", "anonymous");
  const nodeRef = useRef(null);
  const trRef = useRef(null);

  useEffect(() => {
    if (isSelected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer() && trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, thumb]);

  const commitTransform = () => {
    const n = nodeRef.current;
    if (!n) return;
    const sx = n.scaleX();
    const sy = n.scaleY();
    const nw = Math.max(80, w * sx);
    const nh = Math.max(45, h * sy);
    n.scaleX(1);
    n.scaleY(1);
    onChange && onChange({ x: n.x(), y: n.y(), w: nw, h: nh, rotation: n.rotation() });
  };

  return (
    <>
      <Group
        ref={nodeRef}
        x={x}
        y={y}
        rotation={rotation}
        draggable={draggable}
        opacity={el._pending ? 0.6 : 1}
        onClick={onSelect}
        onTap={onSelect}
        onMouseDown={onSelect}
        onDragMove={(e) => onLiveMove && onLiveMove({ x: e.target.x(), y: e.target.y() })}
        onDragEnd={(e) => onChange && onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={commitTransform}
      >
        <Rect width={w} height={h} fill="#111" cornerRadius={6} />
        {thumb && <KImage image={thumb} width={w} height={h} cornerRadius={6} />}
        {/* 재생 버튼 */}
        <Group
          x={w / 2}
          y={h / 2}
          onClick={(e) => {
            e.cancelBubble = true;
            onPlay && onPlay();
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            onPlay && onPlay();
          }}
        >
          <Circle radius={26} fill="rgba(0,0,0,0.6)" />
          <Text text="▶" fontSize={24} fill="#fff" x={-8} y={-13} listening={false} />
        </Group>
      </Group>
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 80 ? oldBox : newBox)}
        />
      )}
    </>
  );
}
