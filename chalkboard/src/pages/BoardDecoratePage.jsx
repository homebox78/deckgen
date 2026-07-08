import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { BOARD_BG, SKY_TONE, FRAME_WOOD } from "../constants/theme";
import "../styles/pages.css";

const SIGNBOARD = [
  { key: "a_board", label: "🪧 입간판" },
  { key: "arch", label: "🏛️ 아치" },
];
const STREET_THEMES = [
  { key: "alley", label: "🏘️ 골목" },
  { key: "market", label: "🛒 시장" },
  { key: "school", label: "🏫 학교앞" },
  { key: "park", label: "🌳 공원" },
];
const FRAME_PRESETS = ["원목", "화이트", "블랙", "네온"];
const SKY_LABELS = { day: "☀️ 낮", dusk: "🌆 노을", night: "🌙 밤" };

export default function BoardDecoratePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [board, setBoard] = useState(null);

  // 편집 상태
  const [bgType, setBgType] = useState("green");
  const [skyTone, setSkyTone] = useState("day");
  const [signboardStyle, setSignboardStyle] = useState("a_board");
  const [streetTheme, setStreetTheme] = useState("alley");
  const [frameSkin, setFrameSkin] = useState("원목");
  const [regionTag, setRegionTag] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { board: b } = await api.getBoard(id);
        if (!alive) return;
        setBoard(b);
        setBgType(b.bgType || "green");
        setSkyTone(b.skyTone || "day");
        setSignboardStyle(b.signboardStyle || "a_board");
        setStreetTheme(b.streetTheme || "alley");
        setFrameSkin(b.frameSkin || "원목");
        setRegionTag(b.regionTag || "");
      } catch (e) {
        if (alive) setErr(e.message || "칠판 정보를 불러오지 못했어요.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function save() {
    setSaving(true);
    setErr("");
    setSaved(false);
    try {
      const { board: updated } = await api.updateBoard(id, {
        bgType,
        skyTone,
        signboardStyle,
        streetTheme,
        frameSkin,
        regionTag: regionTag.trim(),
      });
      setBoard(updated);
      setSaved(true);
    } catch (e) {
      setErr(e.message || "저장에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="pg center">
        <div className="pg-empty-emoji" style={{ marginTop: 60 }}>🎨</div>
        <p className="muted">꾸미기 방을 여는 중…</p>
      </div>
    );
  }

  if (err && !board) {
    return (
      <div className="pg center" style={{ maxWidth: 480 }}>
        <div className="pg-err mt">{err}</div>
        <button className="st-btn st-btn--ghost mt" onClick={() => navigate(`/boards/${id}`)}>
          ← 칠판으로
        </button>
      </div>
    );
  }

  const level = board?.boardLevel ?? 1;

  // 잠금 상태 (10명 미만 / 레벨 2 미만)
  if (level < 2) {
    const count = board?.memberCount ?? 0;
    const pct = Math.min(100, Math.round((count / 10) * 100));
    return (
      <div className="pg" style={{ maxWidth: 560 }}>
        <a className="back-link" onClick={() => navigate(`/boards/${id}`)}>← 칠판으로</a>
        <div className="locked-teaser">
          <div className="lock">🔒</div>
          <h2 className="pg-h" style={{ fontSize: 32, margin: "8px 0 4px" }}>
            멤버 10명이 모이면 꾸미기가 열려요
          </h2>
          <p className="muted">
            지금 <b>{count}명</b> 참여 중 · 칠판이 Lv.2가 되면 배경·하늘·거리 테마를 바꿀 수 있어요!
          </p>
          <div className="progress">
            <span style={{ width: pct + "%" }} />
          </div>
          <p className="muted" style={{ fontSize: 14 }}>{count} / 10명</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pg">
      <a className="back-link" onClick={() => navigate(`/boards/${id}`)}>← 칠판으로</a>
      <h1 className="pg-h" style={{ fontSize: 40, marginBottom: 2 }}>🎨 칠판 꾸미기</h1>
      <p className="muted">{board?.title} · Lv.{level} 칠판을 우리동네 분위기로 꾸며보세요.</p>

      <div className="decorate-shell mt">
        {/* 컨트롤 */}
        <div>
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
            <span>하늘 색</span>
            <div className="swatch-row">
              {Object.entries(SKY_TONE).map(([key, grad]) => (
                <button
                  type="button"
                  key={key}
                  aria-label={key}
                  className={"swatch" + (skyTone === key ? " sel" : "")}
                  style={{ background: grad }}
                  title={SKY_LABELS[key]}
                  onClick={() => setSkyTone(key)}
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

          <div className="pg-field">
            <span>거리 테마</span>
            <div className="opt-row">
              {STREET_THEMES.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  className={"opt" + (streetTheme === t.key ? " sel" : "")}
                  onClick={() => setStreetTheme(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pg-field">
            <span>프레임 스킨</span>
            <div className="opt-row">
              {FRAME_PRESETS.map((f) => (
                <button
                  type="button"
                  key={f}
                  className={"opt" + (frameSkin === f ? " sel" : "")}
                  onClick={() => setFrameSkin(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <input
              className="pg-input mt"
              value={frameSkin}
              onChange={(e) => setFrameSkin(e.target.value)}
              placeholder="직접 입력"
              maxLength={20}
            />
          </div>

          <label className="pg-field">
            <span>우리동네 태그</span>
            <input
              className="pg-input"
              value={regionTag}
              onChange={(e) => setRegionTag(e.target.value)}
              placeholder="#망원동"
              maxLength={20}
            />
          </label>

          {err && <div className="pg-err">{err}</div>}
          {saved && <div className="pg-note">저장했어요! ✨</div>}

          <div className="row mt">
            <button className="st-btn st-btn--accent" onClick={save} disabled={saving}>
              {saving ? "저장 중…" : "저장하기 💾"}
            </button>
            <button className="st-btn st-btn--ghost" onClick={() => navigate(`/boards/${id}`)}>
              칠판으로 돌아가기
            </button>
          </div>
        </div>

        {/* 라이브 프리뷰 */}
        <div>
          <div className="pg-field">
            <span>미리보기</span>
            <div className="preview-scene" style={{ background: SKY_TONE[skyTone] }}>
              <div className="preview-frame" style={{ background: FRAME_WOOD }}>
                <div className="preview-board" style={{ background: BOARD_BG[bgType] }}>
                  {board?.title || "우리동네 칠판"}
                </div>
              </div>
            </div>
            <p className="muted center" style={{ fontSize: 14, marginTop: 8 }}>
              {SKY_LABELS[skyTone]} · {STREET_THEMES.find((t) => t.key === streetTheme)?.label} · {frameSkin} 프레임
              {regionTag ? ` · ${regionTag.startsWith("#") ? regionTag : "#" + regionTag}` : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
