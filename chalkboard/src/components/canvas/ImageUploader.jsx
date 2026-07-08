import { useState } from "react";

// MVP: 이미지 URL 입력만 지원(S3 없음). 미리보기 후 붙이기.
export default function ImageUploader({ onSubmit, onClose }) {
  const [url, setUrl] = useState("");
  const [ok, setOk] = useState(false);
  const clean = url.trim();

  return (
    <div className="bd-modal-backdrop" onMouseDown={onClose}>
      <div className="bd-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bd-modal-head">
          <span>사진 붙이기 (URL)</span>
          <button className="bd-x" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          className="bd-input"
          autoFocus
          placeholder="https://... 이미지 주소를 붙여넣으세요"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setOk(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && clean) {
              onSubmit(clean);
              onClose();
            }
          }}
        />
        {clean ? (
          <div className="bd-img-preview">
            <img
              src={clean}
              alt="미리보기"
              onLoad={() => setOk(true)}
              onError={() => setOk(false)}
            />
            {!ok && <span className="bd-img-hint">이미지를 불러오는 중이거나 주소가 올바르지 않아요.</span>}
          </div>
        ) : null}
        <div className="bd-modal-foot">
          <button className="bd-btn ghost" onClick={onClose}>
            취소
          </button>
          <button
            className="bd-btn primary"
            disabled={!clean}
            onClick={() => {
              onSubmit(clean);
              onClose();
            }}
          >
            붙이기
          </button>
        </div>
      </div>
    </div>
  );
}
