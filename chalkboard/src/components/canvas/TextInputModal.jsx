import { useState } from "react";
import { FONT_CATEGORIES, DEFAULT_FONT, fontStack } from "../../constants/fonts";

// 텍스트/URL 등 한 줄~여러 줄 입력 모달. text·video(YouTube URL) 공용.
// fontPicker=true 면 폰트 선택 UI 노출 + onSubmit(text, font).
export default function TextInputModal({
  title = "글씨 쓰기",
  placeholder = "칠판에 쓸 내용을 입력하세요",
  submitLabel = "붙이기",
  multiline = true,
  defaultValue = "",
  fontPicker = false,
  onSubmit,
  onClose,
}) {
  const [val, setVal] = useState(defaultValue);
  // 초기 탭 = 기본 폰트가 속한 카테고리 (열자마자 선택 폰트가 보이게)
  const [cat, setCat] = useState(
    () => (FONT_CATEGORIES.find((c) => c.fonts.some((f) => f.family === DEFAULT_FONT)) || FONT_CATEGORIES[0]).key,
  );
  const [font, setFont] = useState(DEFAULT_FONT);

  const submit = () => {
    const v = val.trim();
    if (!v) return;
    onSubmit(v, font);
    onClose();
  };

  const activeCat = FONT_CATEGORIES.find((c) => c.key === cat) || FONT_CATEGORIES[0];

  return (
    <div className="bd-modal-backdrop" onMouseDown={onClose}>
      <div className="bd-modal" onMouseDown={(e) => e.stopPropagation()} style={fontPicker ? { width: 460, maxWidth: "94vw" } : undefined}>
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
            style={fontPicker ? { fontFamily: fontStack(font), fontSize: 22, lineHeight: 1.4 } : undefined}
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

        {fontPicker && (
          <div className="bd-fontpick">
            <div className="bd-fontcats">
              {FONT_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  className={`bd-fontcat ${cat === c.key ? "on" : ""}`}
                  onClick={() => setCat(c.key)}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            <div className="bd-fontlist">
              {activeCat.fonts.map((f) => (
                <button
                  key={f.family}
                  className={`bd-fontchip ${font === f.family ? "on" : ""}`}
                  style={{ fontFamily: fontStack(f.family) }}
                  onClick={() => setFont(f.family)}
                  title={f.name}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
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
