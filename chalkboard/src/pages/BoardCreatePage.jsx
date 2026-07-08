import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { BOARD_BG, FRAME_WOOD, CATEGORIES } from "../constants/theme";
import "../styles/pages.css";

const VISIBILITY = [
  { key: "public", label: "🌍 공개", desc: "누구나 볼 수 있어요" },
  { key: "invite", label: "🔗 초대", desc: "링크로만 참여" },
  { key: "private", label: "🔒 비공개", desc: "나만 보기" },
];

const SIGNBOARD = [
  { key: "a_board", label: "🪧 입간판" },
  { key: "arch", label: "🏛️ 아치 간판" },
];

export default function BoardCreatePage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [visibility, setVisibility] = useState("public");
  const [bgType, setBgType] = useState("green");
  const [signboardStyle, setSignboardStyle] = useState("a_board");
  const [regionTag, setRegionTag] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setErr("칠판 이름을 지어주세요 ✏️");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const { id } = await api.createBoard({
        title: title.trim(),
        description: description.trim(),
        category,
        visibility,
        bgType,
        signboardStyle,
        regionTag: regionTag.trim() || undefined,
      });
      navigate(`/boards/${id}`);
    } catch (e2) {
      setErr(e2.message || "칠판을 세우지 못했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <div className="pg" style={{ maxWidth: 620 }}>
      <a className="back-link" onClick={() => navigate("/boards")}>← 목록으로</a>
      <h1 className="pg-h" style={{ fontSize: 40, marginBottom: 4 }}>새 칠판 세우기 🪧</h1>
      <p className="muted">동네에 칠판 하나 세워두면 이웃들이 낙서하러 와요.</p>

      <form onSubmit={submit} className="mt">
        <label className="pg-field">
          <span>칠판 이름</span>
          <input
            className="pg-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 3반 추억 칠판"
            maxLength={40}
            autoFocus
          />
        </label>

        <label className="pg-field">
          <span>소개 <small>· 선택</small></span>
          <textarea
            className="pg-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="어떤 낙서를 함께 남기고 싶나요?"
            maxLength={200}
          />
        </label>

        <div className="pg-field">
          <span>카테고리</span>
          <div className="opt-row">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.key}
                className={"opt" + (category === c.key ? " sel" : "")}
                onClick={() => setCategory(c.key)}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pg-field">
          <span>공개 범위</span>
          <div className="opt-row">
            {VISIBILITY.map((v) => (
              <button
                type="button"
                key={v.key}
                className={"opt" + (visibility === v.key ? " sel" : "")}
                onClick={() => setVisibility(v.key)}
                title={v.desc}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pg-field">
          <span>칠판 색</span>
          <div className="swatch-row">
            {Object.entries(BOARD_BG).map(([key, hex]) => (
              <button
                type="button"
                key={key}
                aria-label={key}
                className={"swatch" + (bgType === key ? " sel" : "")}
                style={{ background: hex }}
                onClick={() => setBgType(key)}
              />
            ))}
          </div>
        </div>

        <div className="pg-field">
          <span>간판 모양</span>
          <div className="opt-row">
            {SIGNBOARD.map((s) => (
              <button
                type="button"
                key={s.key}
                className={"opt" + (signboardStyle === s.key ? " sel" : "")}
                onClick={() => setSignboardStyle(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="pg-field">
          <span>우리동네 태그 <small>· 선택 (예: 망원동)</small></span>
          <input
            className="pg-input"
            value={regionTag}
            onChange={(e) => setRegionTag(e.target.value)}
            placeholder="#우리동네"
            maxLength={20}
          />
        </label>

        {/* 미리보기 */}
        <div className="pg-field">
          <span>미리보기</span>
          <div className="mini-street" style={{ background: "linear-gradient(#dfeaf0,#eef4f2)", borderRadius: 14, border: "1.5px solid var(--line)" }}>
            <div className="mini-frame" style={{ background: FRAME_WOOD }}>
              <div className="mini-inner" style={{ background: BOARD_BG[bgType] }}>
                {title.trim() || "칠판 이름"}
              </div>
            </div>
            <span className="mini-post" />
          </div>
        </div>

        {err && <div className="pg-err">{err}</div>}

        <div className="row mt">
          <button type="button" className="st-btn st-btn--ghost" onClick={() => navigate("/boards")}>
            취소
          </button>
          <button className="st-btn st-btn--accent" disabled={busy}>
            {busy ? "세우는 중…" : "칠판 세우기 🎉"}
          </button>
        </div>
      </form>
    </div>
  );
}
