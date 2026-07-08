import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/useAuthStore";
import "../styles/pages.css";

const WORD_CATEGORIES = [
  { key: "sexual", label: "성적" },
  { key: "illegal", label: "불법" },
  { key: "abuse", label: "욕설·비방" },
  { key: "spam", label: "스팸·광고" },
  { key: "etc", label: "기타" },
];
const SEVERITIES = [
  { key: "block", label: "차단" },
  { key: "review", label: "검토" },
  { key: "warn", label: "경고" },
];

export default function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [word, setWord] = useState("");
  const [category, setCategory] = useState("abuse");
  const [severity, setSeverity] = useState("block");
  const [adding, setAdding] = useState(false);
  const [formErr, setFormErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { words: list } = await api.bannedWords();
      setWords(list || []);
    } catch (e) {
      setErr(e.message || "금칙어 목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.isAdmin) load();
  }, [user]);

  if (!user?.isAdmin) {
    return (
      <div className="pg center" style={{ maxWidth: 480 }}>
        <div className="pg-empty-emoji" style={{ marginTop: 60 }}>🔒</div>
        <h1 className="pg-h" style={{ fontSize: 34 }}>관리자 권한이 필요합니다</h1>
        <p className="muted">이 페이지는 관리자만 볼 수 있어요.</p>
        <button className="st-btn st-btn--ghost mt" onClick={() => navigate("/boards")}>
          ← 칠판 목록으로
        </button>
      </div>
    );
  }

  async function add(e) {
    e.preventDefault();
    if (!word.trim()) {
      setFormErr("금칙어를 입력해 주세요.");
      return;
    }
    setAdding(true);
    setFormErr("");
    try {
      await api.addBannedWord({ word: word.trim(), category, severity });
      setWord("");
      await load();
    } catch (e2) {
      setFormErr(e2.message || "추가에 실패했어요.");
    } finally {
      setAdding(false);
    }
  }

  async function remove(wid) {
    try {
      await api.deleteBannedWord(wid);
      setWords((prev) => prev.filter((w) => (w.id ?? w.wid) !== wid));
    } catch (e) {
      setErr(e.message || "삭제에 실패했어요.");
    }
  }

  return (
    <div className="pg">
      <a className="back-link" onClick={() => navigate("/boards")}>← 칠판 목록으로</a>
      <h1 className="pg-h" style={{ fontSize: 40, marginBottom: 2 }}>🛡️ 관리자 콘솔</h1>
      <p className="muted">칠판에 남길 수 없는 금칙어를 관리해요.</p>

      {err && <div className="pg-err">{err}</div>}

      <div className="admin-shell mt">
        <div className="panel">
          <h3>금칙어 추가</h3>
          <form onSubmit={add}>
            <label className="pg-field">
              <span>단어</span>
              <input
                className="pg-input"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="금칙어"
                maxLength={40}
              />
            </label>
            <label className="pg-field">
              <span>분류</span>
              <select className="pg-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {WORD_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="pg-field">
              <span>심각도</span>
              <select className="pg-select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {SEVERITIES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </label>
            {formErr && <div className="pg-err">{formErr}</div>}
            <button className="st-btn st-btn--accent" style={{ width: "100%" }} disabled={adding}>
              {adding ? "추가 중…" : "+ 추가"}
            </button>
          </form>
        </div>

        <div className="panel">
          <h3>금칙어 목록 <span className="muted" style={{ fontSize: 16 }}>({words.length})</span></h3>
          {loading ? (
            <p className="muted">불러오는 중…</p>
          ) : words.length === 0 ? (
            <p className="muted">등록된 금칙어가 없어요.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>단어</th>
                    <th>분류</th>
                    <th>심각도</th>
                    <th>상태</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((w) => {
                    const wid = w.id ?? w.wid;
                    const catLabel = WORD_CATEGORIES.find((c) => c.key === w.category)?.label || w.category || "-";
                    const sev = w.severity || "block";
                    const active = w.active === undefined ? true : !!w.active;
                    return (
                      <tr key={wid}>
                        <td style={{ fontWeight: 700 }}>{w.word}</td>
                        <td>{catLabel}</td>
                        <td><span className={"sev " + sev}>{SEVERITIES.find((s) => s.key === sev)?.label || sev}</span></td>
                        <td>{active ? "✅ 사용중" : "⛔ 꺼짐"}</td>
                        <td><button className="del-btn" onClick={() => remove(wid)}>삭제</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
