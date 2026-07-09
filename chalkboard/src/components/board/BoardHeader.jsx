import { useState } from "react";
import { api } from "../../api/client";
import { useBoardStore } from "../../store/useBoardStore";
import { GRADE_INFO } from "../../constants/permissions";

function Avatar({ name, color, me }) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <div className={`bd-avatar ${me ? "me" : ""}`} style={{ background: color || "#555" }} title={name}>
      {initial}
    </div>
  );
}

export default function BoardHeader({ board, peers = [], self, myRole, myGrade, boardId, onLeave, onDecorate }) {
  const [copied, setCopied] = useState(false);
  const isOwner = myRole === "owner";
  const grade = GRADE_INFO[myGrade] || null;

  const invite = async () => {
    try {
      const { code } = await api.invite(boardId);
      const base = import.meta.env.BASE_URL || "/";
      const link = `${window.location.origin}${base}join/${code}`.replace(/([^:])\/\/+/g, "$1/");
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        window.prompt("초대 링크를 복사하세요", link);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      alert("초대 링크를 만들지 못했어요: " + (e.message || ""));
    }
  };

  const clearAll = async () => {
    if (!window.confirm("칠판을 전부 지울까요? 되돌릴 수 없어요.")) return;
    try {
      await api.clearBoard(boardId, self?.clientId);
      useBoardStore.getState().localClear(); // SSE 자기 에코 억제 → 로컬 즉시 반영 + wipe
    } catch (e) {
      alert("전체 지우기 실패: " + (e.message || ""));
    }
  };

  // self + peers 접속자 아바타
  const avatars = [];
  if (self) avatars.push({ clientId: "me", name: self.nickname, color: self.color, me: true });
  peers.forEach((p) => avatars.push({ clientId: p.clientId, name: p.name, color: p.color }));

  return (
    <header className="bd-header">
      <div className="bd-h-left">
        <span className="bd-h-title chalk-font">{board?.title || "우리동네 칠판"}</span>
        <span className="bd-h-badge">Lv.{board?.boardLevel ?? 1}</span>
        <span className="bd-h-count">👥 {board?.memberCount ?? avatars.length}</span>
        {grade && (
          <span className="bd-h-grade" title={`내 등급: ${grade.name}`}>
            {grade.emoji} {grade.name}
          </span>
        )}
      </div>

      <div className="bd-h-mid">
        <div className="bd-avatars">
          {avatars.slice(0, 8).map((a) => (
            <Avatar key={a.clientId} name={a.name} color={a.color} me={a.me} />
          ))}
          {avatars.length > 8 && <div className="bd-avatar more">+{avatars.length - 8}</div>}
        </div>
      </div>

      <div className="bd-h-right">
        <button className="bd-btn ghost" onClick={invite}>
          {copied ? "복사됨 ✓" : "🔗 초대"}
        </button>
        {isOwner && (
          <button className="bd-btn ghost" onClick={onDecorate}>
            🎨 꾸미기
          </button>
        )}
        {isOwner && (
          <button className="bd-btn danger" onClick={clearAll}>
            🧹 전체지우기
          </button>
        )}
        <button className="bd-btn ghost" onClick={onLeave}>
          나가기
        </button>
      </div>
    </header>
  );
}
