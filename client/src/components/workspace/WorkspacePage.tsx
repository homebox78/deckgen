// 팀 워크스페이스 관리 (시안 신규) — 통계·멤버·공유 덱·플랜/사용량. 계정 없는 MVP라 데모/시뮬레이션.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../ui/toast";
import { UpgradeModal } from "../home/SettingsModal";

type Role = "owner" | "admin" | "editor" | "viewer";
const ROLE_NAME: Record<Role, string> = { owner: "소유자", admin: "관리자", editor: "편집자", viewer: "뷰어" };

interface Member {
  name: string;
  email: string;
  role: Role;
  color: string;
  you?: boolean;
  pending?: boolean;
}

const SEED: Member[] = [
  { name: "우진", email: "woojin@deckgen.app", role: "owner", color: "#1A1A1A", you: true },
  { name: "김대리", email: "kim@company.co.kr", role: "admin", color: "#55554F" },
  { name: "이수민", email: "lee@company.co.kr", role: "editor", color: "#3A6EA5" },
  { name: "박하늘", email: "park@company.co.kr", role: "editor", color: "#1E7F4F" },
  { name: "정예린", email: "yerin@company.co.kr", role: "viewer", color: "#B4632F" },
  { name: "newbie", email: "newbie@company.co.kr", role: "editor", color: "#8A8A84", pending: true },
];

const WS_DECKS = [
  { title: "경영바우처 지원 제안서", meta: "5장 · 우진 · 10분 전", bg: "#FFFFFF", accent: "#2563EB", avatars: ["우", "김"] },
  { title: "2026 상반기 제품 로드맵", meta: "8장 · 김대리 · 어제", bg: "#14141A", accent: "#7C9CFF", avatars: ["김", "이", "박"] },
  { title: "로컬 브랜드 협업 제안", meta: "6장 · 이수민 · 3일 전", bg: "#FAF6EF", accent: "#C25E3A", avatars: ["이"] },
];

export function WorkspacePage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>(SEED);
  const [invite, setInvite] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const memberCount = members.length;
  const activeCount = members.filter((m) => !m.pending).length;
  const creditUsed = 640;
  const creditTotal = 1000;
  const seatTotal = 10;
  const sendInvite = () => {
    if (!/@/.test(invite)) {
      showToast("올바른 이메일을 입력하세요");
      return;
    }
    setMembers((p) => [...p, { name: invite.split("@")[0], email: invite.trim(), role: inviteRole, color: "#8A8A84", pending: true }]);
    showToast(`${invite.trim()}을(를) ${ROLE_NAME[inviteRole]}(으)로 초대했어요`);
    setInvite("");
  };

  const stats = [
    { name: "전체 덱", value: "38", sub: "워크스페이스 공유" },
    { name: "이번 주 편집", value: "124", sub: "멤버 전체 활동" },
    { name: "활성 멤버", value: String(activeCount), sub: "최근 7일 접속" },
    { name: "AI 생성", value: `${creditUsed}건`, sub: "이번 달" },
  ];

  return (
    <div className="min-h-screen bg-app-bg">
      {/* 헤더 */}
      <header className="flex items-center gap-3 border-b border-app-border bg-app-surface px-6 py-3.5">
        <button onClick={() => navigate("/")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-app-border text-app-muted hover:bg-app-bg">
          <span className="mi text-[17px]">arrow_back</span>
        </button>
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-[12px] font-bold text-white" style={{ background: "#1A1A1A" }}>W</span>
        <div className="flex-1">
          <div className="text-[15px] font-bold">우진의 팀</div>
          <div className="text-[11.5px] text-app-faint">Team 플랜 · 멤버 {memberCount}명</div>
        </div>
        <button onClick={() => setUpgradeOpen(true)} className="rounded-lg border border-app-border bg-white px-3.5 py-2 text-[12.5px] font-semibold hover:border-app-accent">
          플랜 관리
        </button>
      </header>

      <div className="mx-auto max-w-[960px] px-6 py-7">
        {/* 통계 */}
        <div className="mb-5 grid grid-cols-4 gap-3.5">
          {stats.map((s) => (
            <div key={s.name} className="rounded-[13px] border border-app-border bg-white px-[18px] py-4">
              <div className="text-[12px] text-app-muted">{s.name}</div>
              <div className="mt-1.5 text-[22px] font-extrabold tracking-tight">{s.value}</div>
              <div className="mt-[3px] text-[11px] text-app-faint">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* 멤버 */}
        <div className="mb-5 rounded-[14px] border border-app-border bg-white p-5">
          <div className="mb-3.5 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[13.5px] font-bold">멤버</div>
              <div className="text-[11.5px] text-app-faint">{memberCount}명 · 역할별 권한</div>
            </div>
            <div className="flex items-center gap-1.5 rounded-[10px] border border-app-border bg-white p-1 pl-2.5">
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendInvite()}
                placeholder="이메일로 멤버 초대"
                className="w-44 bg-transparent text-[12px] focus:outline-none"
              />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} className="rounded-md border border-app-border bg-white px-1.5 py-1 text-[11px]">
                <option value="editor">편집자</option>
                <option value="viewer">뷰어</option>
                <option value="admin">관리자</option>
              </select>
              <button onClick={sendInvite} className="rounded-lg bg-app-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90">초대</button>
            </div>
          </div>
          <div className="flex flex-col">
            {members.map((m, i) => (
              <div key={m.email} className="flex items-center gap-2.5 border-t border-app-border-soft py-2.5 first:border-t-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: m.color }}>
                  {m.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold">
                    {m.name}
                    {m.you && <span className="ml-1 text-[11px] text-app-faint">(나)</span>}
                  </div>
                  <div className="truncate text-[11px] text-app-faint">{m.email}</div>
                </div>
                {m.pending ? (
                  <span className="rounded-full bg-[#FFF7E6] px-2 py-0.5 text-[10.5px] font-semibold text-[#8A6B1F]">초대 대기</span>
                ) : m.role === "owner" ? (
                  <span className="text-[11.5px] text-app-muted">소유자</span>
                ) : (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => setMembers((p) => p.map((x, xi) => xi === i ? { ...x, role: e.target.value as Role } : x))}
                      className="rounded-md border border-app-border bg-white px-1.5 py-1 text-[11px]"
                    >
                      <option value="admin">관리자</option>
                      <option value="editor">편집자</option>
                      <option value="viewer">뷰어</option>
                    </select>
                    <button
                      onClick={() => { setMembers((p) => p.filter((_, xi) => xi !== i)); showToast(`${m.name} 멤버를 제거했어요`); }}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-app-faint hover:text-app-danger"
                    >
                      <span className="mi text-[15px]">close</span>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 공유 덱 + 플랜/사용량 */}
        <div className="grid grid-cols-[1.4fr_1fr] gap-4">
          <div className="rounded-[14px] border border-app-border bg-white p-5">
            <div className="mb-1 text-[13.5px] font-bold">공유 덱</div>
            <div className="mb-3 text-[11.5px] text-app-faint">워크스페이스 전체 접근</div>
            <div className="flex flex-col gap-2">
              {WS_DECKS.map((d) => (
                <div key={d.title} className="flex items-center gap-3 rounded-lg border border-app-border-soft px-3 py-2">
                  <span className="flex h-[26px] w-11 shrink-0 flex-col justify-center gap-0.5 rounded-md border border-app-border px-1.5" style={{ background: d.bg }}>
                    <span className="h-[2px] w-3/5 rounded" style={{ background: d.accent }} />
                    <span className="h-[2px] w-4/5 rounded bg-black/10" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold">{d.title}</div>
                    <div className="text-[10.5px] text-app-faint">{d.meta}</div>
                  </div>
                  <div className="flex">
                    {d.avatars.map((a, ai) => (
                      <span key={ai} className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-app-muted text-[9px] font-bold text-white first:ml-0">{a}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[14px] border border-app-border bg-white p-5">
            <div className="mb-3 text-[13.5px] font-bold">플랜 · 사용량</div>
            <div className="mb-1 text-[11.5px] text-app-muted">이번 달 AI 생성 크레딧</div>
            <div className="mb-1 h-2 overflow-hidden rounded-full bg-[#F0F0EE]">
              <div className="h-full rounded-full bg-app-text" style={{ width: `${(creditUsed / creditTotal) * 100}%` }} />
            </div>
            <div className="mb-4 text-[10.5px] text-app-faint">{creditUsed} / {creditTotal} 크레딧 사용</div>
            <div className="mb-1 text-[11.5px] text-app-muted">멤버 시트</div>
            <div className="mb-1 h-2 overflow-hidden rounded-full bg-[#F0F0EE]">
              <div className="h-full rounded-full bg-app-text" style={{ width: `${(memberCount / seatTotal) * 100}%` }} />
            </div>
            <div className="mb-4 text-[10.5px] text-app-faint">{memberCount} / {seatTotal} 시트</div>
            <button onClick={() => setUpgradeOpen(true)} className="w-full rounded-lg bg-app-accent py-2.5 text-[12.5px] font-semibold text-white hover:opacity-90">
              시트·크레딧 늘리기
            </button>
          </div>
        </div>
      </div>
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
    </div>
  );
}
