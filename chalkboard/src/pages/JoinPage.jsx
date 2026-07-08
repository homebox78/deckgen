import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import "../styles/pages.css";

export default function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState("loading"); // loading | ready | error
  const [info, setInfo] = useState(null); // {boardId, title}
  const [err, setErr] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.resolveInvite(code);
        if (!alive) return;
        setInfo(res);
        setState("ready");
      } catch (e) {
        if (!alive) return;
        setErr(e.message || "초대 링크가 만료되었거나 올바르지 않아요.");
        setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  async function join() {
    if (!info?.boardId) return;
    setJoining(true);
    setErr("");
    try {
      await api.joinBoard(info.boardId);
      navigate(`/boards/${info.boardId}`);
    } catch (e) {
      setErr(e.message || "참여에 실패했어요. 다시 시도해 주세요.");
      setJoining(false);
    }
  }

  return (
    <div className="join-wrap">
      <div className="join-card">
        {state === "loading" && (
          <>
            <div className="pg-empty-emoji">🔗</div>
            <p className="muted">초대장을 확인하는 중…</p>
          </>
        )}

        {state === "error" && (
          <>
            <div className="pg-empty-emoji">🥲</div>
            <h1 className="login-hero" style={{ fontSize: 34 }}>이런!</h1>
            <div className="pg-err">{err}</div>
            <button className="st-btn st-btn--ghost mt" onClick={() => navigate("/boards")}>
              칠판 목록으로
            </button>
          </>
        )}

        {state === "ready" && info && (
          <>
            <div className="pg-empty-emoji">💌</div>
            <p className="muted">칠판에 초대받았어요</p>
            <h1 className="login-hero" style={{ fontSize: 38, margin: "6px 0 16px" }}>
              {info.title || "우리동네 칠판"}
            </h1>

            {err && <div className="pg-err">{err}</div>}

            <button
              className="st-btn st-btn--accent"
              style={{ width: "100%" }}
              onClick={join}
              disabled={joining}
            >
              {joining ? "들어가는 중…" : "참여하기 🎉"}
            </button>
            <button className="st-btn st-btn--ghost mt" style={{ width: "100%" }} onClick={() => navigate("/boards")}>
              나중에 할래요
            </button>
          </>
        )}
      </div>
    </div>
  );
}
