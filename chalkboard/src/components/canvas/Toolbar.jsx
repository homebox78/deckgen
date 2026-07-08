import { CHALK_COLORS } from "../../constants/permissions";

const TOOLS = [
  { key: "select", label: "선택", icon: "🖐️", cap: null },
  { key: "pen", label: "펜", icon: "🖍️", cap: "drawing" },
  { key: "eraser", label: "지우개", icon: "🧽", cap: "_member" },
  { key: "emoji", label: "이모지", icon: "😊", cap: "emoji", opens: "emoji" },
  { key: "image", label: "사진", icon: "🖼️", cap: "image", opens: "image" },
  { key: "video", label: "영상", icon: "📺", cap: "video", opens: "video" },
  { key: "text", label: "글씨", icon: "✏️", cap: "text", opens: "text" },
];

export default function Toolbar({
  tool,
  setTool,
  penColor,
  setPenColor,
  penWidth,
  setPenWidth,
  caps,
  onOpen,
}) {
  const c = caps || {};
  const colorsCount = c.colors || 3;
  const swatches = CHALK_COLORS.slice(0, Math.max(1, colorsCount));

  const isLocked = (t) => {
    if (!t.cap) return false;
    if (t.cap === "_member") return !caps; // 멤버만 삭제 가능
    return !c[t.cap];
  };

  const handleClick = (t) => {
    if (isLocked(t)) return;
    setTool(t.key);
    if (t.opens) onOpen && onOpen(t.opens);
  };

  return (
    <div className="bd-toolbar">
      <div className="bd-tools">
        {TOOLS.map((t) => {
          const locked = isLocked(t);
          return (
            <button
              key={t.key}
              className={`bd-tool ${tool === t.key ? "active" : ""} ${locked ? "locked" : ""}`}
              onClick={() => handleClick(t)}
              disabled={locked}
              title={locked ? "등급이 올라가면 열려요" : t.label}
            >
              <span className="bd-tool-ico">{t.icon}</span>
              <span className="bd-tool-lb">{t.label}</span>
              {locked && <span className="bd-lock">🔒</span>}
            </button>
          );
        })}
      </div>

      {tool === "pen" && !isLocked(TOOLS[1]) && (
        <div className="bd-pen-opts">
          <div className="bd-swatches">
            {swatches.map((col) => (
              <button
                key={col}
                className={`bd-swatch ${penColor === col ? "sel" : ""}`}
                style={{ background: col }}
                onClick={() => setPenColor(col)}
                aria-label={col}
              />
            ))}
          </div>
          <div className="bd-width">
            <span className="bd-width-dot" style={{ width: penWidth, height: penWidth, background: penColor }} />
            <input
              type="range"
              min="2"
              max="28"
              value={penWidth}
              onChange={(e) => setPenWidth(Number(e.target.value))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
