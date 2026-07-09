import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import "../styles/pages.css";

const PRESET_COLORS = [
  "#FF5A5A", "#FF9F43", "#FFD23F", "#4ECDC4",
  "#5B8DEF", "#A66CFF", "#FF6BAA", "#2E4E43",
];

export default function LoginPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);

  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 이미 로그인 상태면 목록으로 (렌더 중 navigate() 금지 → 선언적 Navigate)
  if (user) return <Navigate to="/boards" replace />;

  async function submit(e) {
    e.preventDefault();
    const nick = nickname.trim();
    if (!nick) {
      setErr("닉네임을 적어주세요 ✏️");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await login(nick, color);
      navigate("/boards");
    } catch (e2) {
      setErr(e2.message || "로그인에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-hero">🖍️ 우리동네 칠판</h1>
        <p className="login-sub">길거리 칠판에 다같이 낙서해요</p>

        <label className="pg-field" style={{ textAlign: "left" }}>
          <span>닉네임</span>
          <input
            className="pg-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 골목대장 민수"
            maxLength={20}
            autoFocus
          />
        </label>

        <label className="pg-field" style={{ textAlign: "left" }}>
          <span>
            내 커서 색 <small>· 칠판에서 나를 표시해요</small>
          </span>
          <div className="color-grid">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={"color-dot" + (color === c ? " sel" : "")}
                style={{ background: c }}
                aria-label={`색 ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </label>

        {err && <div className="pg-err">{err}</div>}

        <button className="st-btn st-btn--accent mt" style={{ width: "100%" }} disabled={busy}>
          {busy ? "들어가는 중…" : "칠판으로 들어가기 →"}
        </button>
      </form>
    </div>
  );
}
