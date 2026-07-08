import { EMOJIS } from "../../constants/theme";

export default function EmojiPicker({ onPick, onClose }) {
  return (
    <div className="bd-modal-backdrop" onMouseDown={onClose}>
      <div className="bd-modal bd-emoji-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bd-modal-head">
          <span>이모지 붙이기</span>
          <button className="bd-x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="bd-emoji-grid">
          {EMOJIS.map((em) => (
            <button
              key={em}
              className="bd-emoji-cell"
              onClick={() => {
                onPick(em);
                onClose();
              }}
            >
              {em}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
