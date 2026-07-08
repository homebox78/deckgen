import { youtubeEmbed } from "../../utils/youtube";

// 재생 중인 유튜브 영상을 캔버스 위에 iframe으로 띄우는 DOM 오버레이.
// el.data (youtubeId,x,y,w,h) 는 논리 좌표 → 부모 .bd-scaled 안에 배치되므로 그대로 사용.
export default function VideoOverlay({ el, onClose }) {
  if (!el || !el.data || !el.data.youtubeId) return null;
  const { youtubeId, x = 0, y = 0, w = 320, h = 180 } = el.data;
  return (
    <div className="bd-video-overlay" style={{ left: x, top: y, width: w, height: h }}>
      <iframe
        title="youtube"
        src={youtubeEmbed(youtubeId)}
        width={w}
        height={h}
        frameBorder="0"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      <button className="bd-video-close" onClick={onClose} aria-label="닫기">
        ✕
      </button>
    </div>
  );
}
