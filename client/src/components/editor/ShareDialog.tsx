import { useEffect, useState } from "react";
import { publishDeck, sendInvite } from "../../api/collab";
import type { Deck } from "../../engine/schema";
import {
  getGuestName,
  getShareTokens,
  saveShareTokens,
  useCollabStore,
} from "../../store/collabStore";
import { showToast } from "../ui/toast";

type Mode = "view" | "edit";

const MODES: { id: Mode; name: string; desc: string }[] = [
  { id: "view", name: "보기 전용", desc: "열람만 가능 — 편집 불가" },
  {
    id: "edit",
    name: "편집 허용",
    desc: "링크를 받은 사람도 아웃라인·슬라이드 수정 가능",
  },
];

interface Member {
  name: string;
  email: string;
  role: "owner" | "edit" | "view";
  online?: boolean;
}

export function ShareDialog({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [tokens, setTokens] = useState(() => getShareTokens(deck.id));
  const [mode, setMode] = useState<Mode>("view");
  const [copied, setCopied] = useState(false);
  const [presentLink, setPresentLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const me = getGuestName() || "우진";
  const [members, setMembers] = useState<Member[]>([
    { name: me, email: "woojin@deckgen.app", role: "owner" },
    { name: "김대리", email: "kim@company.co.kr", role: "edit", online: true },
    { name: "박과장", email: "park@company.co.kr", role: "edit" },
  ]);

  const invite = async () => {
    const email = inviteEmail.trim();
    if (!tokens || inviting) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("올바른 이메일을 입력하세요");
      return;
    }
    setInviting(true);
    try {
      await sendInvite(deck.id, tokens.editToken, email, mode, getGuestName() || "게스트");
      showToast(`${email}로 초대 메일을 보냈어요`);
      setInviteEmail("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "초대 발송 실패");
    } finally {
      setInviting(false);
    }
  };

  // 최초 공유: 서버에 덱 등록 → 토큰 발급 → 협업 세션 활성화
  useEffect(() => {
    if (tokens) return;
    let alive = true;
    publishDeck(deck)
      .then((t) => {
        if (!alive) return;
        saveShareTokens(deck.id, t);
        setTokens(t);
        useCollabStore.getState().bumpSession(); // 소유자도 즉시 동기화 시작
        showToast("공유가 시작됐어요 — 이제 이 덱은 서버와 동기화됩니다");
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "공유 실패"));
    return () => {
      alive = false;
    };
    // eslint 규칙: deck 전체가 아닌 최초 1회만 발행
  }, [deck.id]);

  // 서브경로 배포(/deckGen/) 대응 — BASE_URL을 포함해 링크 조립
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const url = tokens
    ? `${window.location.origin}${base}/s/${mode === "edit" ? tokens.editToken : tokens.viewToken}`
    : "";

  const copy = () => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      showToast("링크가 클립보드에 복사됐어요");
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.45)]"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-w-[92vw] rounded-2xl bg-white p-5.5 shadow-[0_24px_64px_rgba(0,0,0,.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-bold">공유</span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-app-bg text-[13px] text-app-muted hover:bg-app-border-soft"
          >
            <span className="mi text-[15px]">close</span>
          </button>
        </div>
        <p className="mt-1 mb-4 text-[12.5px] text-app-muted">
          멤버별로 편집/보기 권한을 나눠 초대하세요. 편집 권한 멤버는 같은 슬라이드를 실시간 공동 편집합니다.
        </p>

        {/* 이메일 초대 (상단, 역할 드롭다운) */}
        <div className="mb-3 flex items-center gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void invite()}
            placeholder="이메일로 초대"
            className="min-w-0 flex-1 rounded-[10px] border border-app-border px-3 py-2 text-[12.5px] focus:border-app-accent focus:outline-none"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="rounded-[10px] border border-app-border bg-white px-2 py-2 text-[12px] focus:border-app-accent focus:outline-none"
          >
            <option value="edit">편집 가능</option>
            <option value="view">보기 전용</option>
          </select>
          <button
            onClick={() => {
              if (inviteEmail.trim() && /@/.test(inviteEmail)) {
                setMembers((p) => [...p, { name: inviteEmail.split("@")[0], email: inviteEmail.trim(), role: mode }]);
              }
              void invite();
            }}
            disabled={inviting}
            className="shrink-0 rounded-lg bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            초대
          </button>
        </div>

        {/* 멤버 로스터 — 하나의 테두리 박스로 감싸고 행 구분선 */}
        <div className="mb-4 divide-y divide-app-border-soft overflow-hidden rounded-[11px] border border-app-border-soft">
          {members.map((mem, i) => (
            <div key={mem.email} className="flex items-center gap-2.5 px-3 py-2">
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-text text-[12px] font-bold text-white">
                {mem.name.slice(0, 1)}
                {mem.online && <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-app-accent" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold">
                  {mem.name}
                  {mem.role === "owner" && <span className="ml-1 text-[11px] text-app-faint">(나)</span>}
                </div>
                <div className="truncate text-[11px] text-app-faint">{mem.email}</div>
              </div>
              {mem.role === "owner" ? (
                <span className="text-[11.5px] text-app-muted">소유자</span>
              ) : (
                <>
                  <select
                    value={mem.role}
                    onChange={(e) => setMembers((p) => p.map((x, xi) => xi === i ? { ...x, role: e.target.value as Member["role"] } : x))}
                    className="rounded-md border border-app-border bg-white px-1.5 py-1 text-[11px]"
                  >
                    <option value="edit">편집 가능</option>
                    <option value="view">보기 전용</option>
                  </select>
                  <button
                    onClick={() => setMembers((p) => p.filter((_, xi) => xi !== i))}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-app-faint hover:text-app-danger"
                  >
                    <span className="mi text-[15px]">close</span>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <p className="mb-2 text-[11px] font-bold tracking-[.06em] text-app-faint">링크 공유</p>

        {error && (
          <div className="mb-3 rounded-lg border border-app-danger-border bg-app-danger-soft p-3 text-[12.5px] text-app-danger">
            {error}
          </div>
        )}
        {!tokens && !error && (
          <div className="mb-3 rounded-lg border border-app-border bg-app-bg p-3 text-[12.5px] text-app-muted">
            <span className="animate-dg-pulse">공유 준비 중…</span>
          </div>
        )}

        <div className="mb-4 flex flex-col gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left ${
                mode === m.id
                  ? "border-[1.5px] border-app-accent bg-[#F0F0EE]"
                  : "border-app-border hover:border-app-accent-border"
              }`}
            >
              <span
                className={`h-4 w-4 shrink-0 rounded-full bg-white ${
                  mode === m.id
                    ? "border-[5px] border-app-accent"
                    : "border-[1.5px] border-[#C9C9C4]"
                }`}
              />
              <span>
                <span className="block text-[13px] font-semibold">{m.name}</span>
                <span className="block text-[11.5px] text-app-muted">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {tokens && (
          <div className="flex items-center gap-2 rounded-[10px] border border-app-border bg-[#FBFBFA] py-1.5 pr-1.5 pl-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[#4A4A45]">
              {url}
            </span>
            <button
              onClick={copy}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white ${
                copied ? "bg-app-text" : "bg-app-accent hover:opacity-90"
              }`}
            >
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
        )}

        {/* 발표 모드로 바로 열리는 링크 토글 */}
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-lg border border-app-border bg-app-bg px-3 py-2.5">
          <input
            type="checkbox"
            checked={presentLink}
            onChange={(e) => setPresentLink(e.target.checked)}
            className="h-4 w-4 accent-[#1A1A1A]"
          />
          <span className="flex-1">
            <span className="block text-[12px] font-semibold">발표 모드로 바로 열리는 링크</span>
            <span className="block text-[11px] text-app-faint">받는 사람이 링크를 열면 즉시 발표 모드로 시작합니다</span>
          </span>
          <span className="mi text-[18px] text-app-muted">play_circle</span>
        </label>

        <p className="mt-3.5 border-t border-app-border-soft pt-3 text-[11.5px] leading-relaxed text-app-faint">
          같은 슬라이드를 동시에 고치면 나중 저장이 반영돼요. 서로 다른 슬라이드를 나눠
          작업하는 걸 추천합니다.
        </p>
      </div>
    </div>
  );
}
