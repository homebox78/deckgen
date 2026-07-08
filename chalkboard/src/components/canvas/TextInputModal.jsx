import { useState } from "react";

// 텍스트/URL 등 한 줄~여러 줄 입력 모달. text·video(YouTube URL) 공용.
export default function TextInputModal({
  title = "글씨 쓰기",
  placeholder = "칠판에 쓸 내용을 입력하세요",
  submitLabel = "붙이기",
  multiline = true,
  defaultValue = "",
  onSubmit,
  onClose,
}) {
  const [val, setVal] = useState(defaultValue);

  const submit = () => {
    const v = val.trim();
    if (!v) return;
    onSubmit(v);
    onClose();
  };

  return (
    <div className="bd-modal-backdrop" onMouseDown={onClose}>
      <div className="bd-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bd-modal-head">
          <span>{title}</span>
          <button className="bd-x" onClick={onClose}>
            ✕
          </button>
        </div>
        {multiline ? (
          <textarea
            className="bd-input"
            rows={3}
            autoFocus
            placeholder={placeholder}
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
        ) : (
          <input
            className="bd-input"
            autoFocus
            placeholder={placeholder}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        )}
        <div className="bd-modal-foot">
          <button className="bd-btn ghost" onClick={onClose}>
            취소
          </button>
          <button className="bd-btn primary" onClick={submit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
