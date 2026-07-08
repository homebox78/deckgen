import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/useAuthStore";
import { BOARD_BG, FRAME_WOOD, CATEGORIES } from "../constants/theme";
import "../styles/pages.css";

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

function MiniStreet({ bgType }) {
  const bg = BOARD_BG[bgType] || BOARD_BG.green;
  return (
    <div className="mini-street" style={{ background: "linear-gradient(#dfeaf0,#eef4f2)" }}>
      <div className="mini-frame" style={{ background: FRAME_WOOD }}>
        <div className="mini-inner" style={{ background: bg }}>낙서 한 판 ✎</div>
      </div>
      <span className="mini-post" />
    </div>
  );
}

export default function BoardListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("recent");
  const [q, setQ] = useState("");
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [notis, setNotis] = useState([]);
  const [notiOpen, setNotiOpen] = useState(false);
  const unread = notis.filter((n) => !n.read).length;

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const params = { sort };
      if (category !== "all") params.category = category;
      if (q.trim()) params.q = q.trim();
      const { boards: list } = await api.listBoards(params);
      setBoards(list || []);
    } catch (e) {
      setErr(e.message || "칠판 목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [category, sort, q]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .notifications()
      .then(({ notifications }) => setNotis(notifications || []))
      .catch(() => {});
  }, []);

  async function toggleNoti() {
    const next = !notiOpen;
    setNotiOpen(next);
    if (next && unread > 0) {
      try {
        await api.readNotifications();
        setNotis((prev) => prev.map((n) => ({ ...n, read: true })));
      } catch {
        /* 조용히 무시 */
      }
    }
  }

  return (
    <div className="pg">
      <div className="topbar">
        <span className="logo">🖍️ 우리동네 칠판</span>

        <button className="icon-btn" onClick={toggleNoti} aria-label="알림">
          🔔
          {unread > 0 && <span className="bell-badge">{unread}</span>}
        </button>

        {user?.isAdmin && (
          <a className="link-muted" onClick={() => navigate("/admin")}>
            관리자
          </a>
        )}

        <span
          className="avatar"
          style={{ background: user?.color || "#888" }}
          title={user?.nickname}
        >
          {(user?.nickname || "?").slice(0, 1)}
        </span>
        <span className="muted" style={{ fontWeight: 700 }}>{user?.nickname}</span>

        <a className="link-muted" onClick={logout}>로그아웃</a>

        <button className="st-btn st-btn--accent" onClick={() => navigate("/boards/new")}>
          + 새 칠판
        </button>
      </div>

      {notiOpen && (
        <div className="noti-pop">
          {notis.length === 0 ? (
            <div className="noti-item muted">새 소식이 없어요 🌱</div>
          ) : (
            notis.map((n) => (
              <div key={n.id} className={"noti-item" + (n.read ? "" : " unread")}>
                <div>{n.text || n.message || n.title}</div>
                {n.createdAt && <div className="noti-time">{new Date(n.createdAt).toLocaleString("ko")}</div>}
              </div>
            ))
          )}
        </div>
      )}

      <div className="filters">
        <div className="tabs">
          <button
            className={"tab" + (category === "all" ? " sel" : "")}
            onClick={() => setCategory("all")}
          >
            ✨ 전체
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={"tab" + (category === c.key ? " sel" : "")}
              onClick={() => setCategory(c.key)}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        <span className="spacer" />

        <div className="search-box">
          <span aria-hidden>🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="칠판 검색"
          />
        </div>

        <div className="sort-toggle" role="group" aria-label="정렬">
          <button className={sort === "recent" ? "sel" : ""} onClick={() => setSort("recent")}>
            최신
          </button>
          <button className={sort === "popular" ? "sel" : ""} onClick={() => setSort("popular")}>
            인기
          </button>
        </div>
      </div>

      {err && <div className="pg-err">{err}</div>}

      {loading ? (
        <div className="pg-empty">
          <div className="pg-empty-emoji">🖍️</div>
          <p className="muted">칠판을 닦는 중…</p>
        </div>
      ) : boards.length === 0 ? (
        <div className="pg-empty">
          <div className="pg-empty-emoji">🪧</div>
          <h3>아직 칠판이 없어요</h3>
          <p className="muted">첫 번째 칠판을 세워 이웃을 불러모아 보세요!</p>
          <button className="st-btn st-btn--accent mt" onClick={() => navigate("/boards/new")}>
            + 새 칠판 만들기
          </button>
        </div>
      ) : (
        <div className="board-grid">
          {boards.map((b) => {
            const cat = CAT_MAP[b.category];
            return (
              <div key={b.id} className="board-card" onClick={() => navigate(`/boards/${b.id}`)}>
                <MiniStreet bgType={b.bgType} />
                <div className="board-body">
                  <h3 className="board-title">{b.title}</h3>
                  <div className="board-meta">
                    {cat && <span className="chip">{cat.emoji} {cat.label}</span>}
                    <span className="chip">👥 {b.memberCount ?? 0}</span>
                    <span className="chip lv-badge">Lv.{b.boardLevel ?? 1}</span>
                  </div>
                  <div className="board-meta mt" style={{ marginTop: 6 }}>
                    <span>✍️ {b.ownerName || "익명"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
