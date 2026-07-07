// §14 관리자 콘솔 — DeckGenPackage/DeckGen Admin.dc.html 시안 1:1
// 로그인(이메일+비밀번호) → 이메일 OTP 2FA → 다크 사이드바 콘솔 9페이지 (실데이터)
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminAudit,
  AdminBanner,
  AdminError,
  AdminJob,
  AdminMetrics,
  AdminSettings,
  AdminTemplate,
  AdminUser,
} from "../../api/admin";
import { adminApi, adminLogin, adminVerify, getAdminToken, setAdminToken } from "../../api/admin";
import { fetchModels } from "../../api/client";
import type { ModelInfo } from "../../api/client";
import { CAROUSEL_LIBRARIES, WIREFRAME_LIBRARIES } from "../../engine/wireframes";
import { showToast } from "../ui/toast";

type PageId =
  | "dash"
  | "users"
  | "jobs"
  | "errors"
  | "audit"
  | "banners"
  | "templates"
  | "decks"
  | "collab"
  | "models"
  | "apikeys"
  | "credits"
  | "plans"
  | "settings"
  | "health"
  | "exports"
  | "abtest"
  | "emails"
  | "flags"
  | "policies"
  | "refunds"
  | "roles";

const PAGES: { id: PageId; name: string; desc: string; icon: string }[] = [
  { id: "dash", name: "대시보드", desc: "서비스 전체 현황 · 실데이터", icon: "📊" },
  { id: "users", name: "사용자 관리", desc: "협업 참여자 · 차단 · 플랜", icon: "👥" },
  { id: "decks", name: "덱 · 공유 관리", desc: "공유 링크 · 멤버 · 강제 잠금", icon: "🗂" },
  { id: "collab", name: "초대 · 댓글", desc: "초대 메일 상태 · 댓글 모더레이션", icon: "💬" },
  { id: "templates", name: "템플릿 관리", desc: "홈 갤러리 노출·순서·PRO 지정", icon: "🎨" },
  { id: "jobs", name: "생성 작업 큐", desc: "AI 파이프라인 이벤트", icon: "⚙️" },
  { id: "models", name: "AI 모델", desc: "플랜별 노출 · 크레딧 비용", icon: "🤖" },
  { id: "credits", name: "크레딧 사용 내역", desc: "모델별 소모 · 로그", icon: "🪙" },
  { id: "flags", name: "기능 플래그", desc: "롤아웃 % · 타겟 · ON/OFF", icon: "🚩" },
  { id: "abtest", name: "A/B 테스트", desc: "실험 · 변형 전환율 · 승자 적용", icon: "🧪" },
  { id: "plans", name: "플랜 · 결제", desc: "플랜 정의 (결제 연동 2차)", icon: "💳" },
  { id: "refunds", name: "환불 · 청구", desc: "결제 내역 · 환불 · 재청구", icon: "🧾" },
  { id: "policies", name: "약관 · 정책", desc: "버전 · 재동의 · 게시", icon: "📜" },
  { id: "banners", name: "공지 / 배너", desc: "사용자 화면 상단 안내 관리", icon: "📢" },
  { id: "emails", name: "이메일 로그", desc: "발송 상태 · 전송률 · 재발송", icon: "✉️" },
  { id: "health", name: "시스템 상태", desc: "서비스 헬스 · 인시던트 · 점검", icon: "🩺" },
  { id: "errors", name: "오류 로그", desc: "미해결 오류 그룹", icon: "🐞" },
  { id: "audit", name: "감사 로그", desc: "append-only 관리자 기록", icon: "📝" },
  { id: "exports", name: "데이터 내보내기", desc: "CSV/JSON · GDPR 요청", icon: "📤" },
  { id: "apikeys", name: "API 키 관리", desc: "서버 연동 키 · 회전 · 폐기", icon: "🔑" },
  { id: "roles", name: "역할 · 권한", desc: "관리자 멤버 · 권한 매트릭스", icon: "🛡" },
  { id: "settings", name: "서비스 설정", desc: "한도·점검 모드·모델 정책", icon: "⚙️" },
];

// 그룹형 아코디언 내비 (6그룹)
const NAV_GROUPS: { label: string; ids: PageId[] }[] = [
  { label: "개요", ids: ["dash"] },
  { label: "사용자·콘텐츠", ids: ["users", "decks", "collab", "templates"] },
  { label: "생성·AI", ids: ["jobs", "models", "credits", "flags", "abtest"] },
  { label: "매출·정책", ids: ["plans", "refunds", "policies"] },
  { label: "커뮤니케이션", ids: ["banners", "emails"] },
  { label: "시스템·운영", ids: ["health", "errors", "audit", "exports", "apikeys", "roles", "settings"] },
];

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const rel = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};

// ===== 로그인 =====
function AdminLogin({ onAuthed }: { onAuthed: () => void }) {
  const [step, setStep] = useState<"creds" | "otp">("creds");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const r = await adminLogin(email.trim(), pw);
      if (r.token) onAuthed();
      else setStep("otp");
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인 실패");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await adminVerify(email.trim(), otp);
      onAuthed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "인증 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#17151F] p-6">
      <div className="w-[380px] max-w-[94vw] rounded-[18px] bg-white p-[30px] shadow-[0_24px_64px_rgba(0,0,0,.45)]">
        <div className="mb-[18px] flex items-center gap-[9px]">
          <span className="h-6 w-6 rounded-[7px] bg-app-accent" />
          <span className="text-[15px] font-bold text-[#1A1A1A]">DeckGen</span>
          <span className="rounded-[5px] bg-[#F0EBFF] px-[7px] py-0.5 text-[10px] font-bold text-app-accent">
            ADMIN
          </span>
        </div>
        {step === "creds" ? (
          <>
            <div className="text-[19px] font-bold tracking-tight text-[#1A1A1A]">관리자 로그인</div>
            <div className="mt-1.5 mb-4 text-[12.5px] text-app-muted">
              config.php의 관리자 계정 · 2단계 이메일 인증
            </div>
            <div className="flex flex-col gap-2.5">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="관리자 이메일"
                className="w-full rounded-[10px] border border-app-border px-3.5 py-3 text-[13.5px] focus:border-app-accent focus:outline-none"
              />
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                placeholder="비밀번호"
                className={`w-full rounded-[10px] border px-3.5 py-3 text-[13.5px] focus:outline-none ${error ? "border-app-danger" : "border-app-border focus:border-app-accent"}`}
              />
              {error && <div className="text-[12px] text-app-danger">{error}</div>}
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="w-full rounded-[10px] bg-app-accent py-[13px] text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "확인 중…" : "계속"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[19px] font-bold tracking-tight text-[#1A1A1A]">2단계 인증</div>
            <div className="mt-1.5 mb-4 text-[12.5px] text-app-muted">
              관리자 이메일로 발송된 6자리 코드를 입력하세요.
            </div>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && void verify()}
              placeholder="6자리 코드"
              autoFocus
              className={`w-full rounded-[10px] border px-3.5 py-[13px] text-center font-mono text-[19px] font-bold tracking-[.4em] focus:outline-none ${error ? "border-app-danger" : "border-app-border focus:border-app-accent"}`}
            />
            {error && <div className="mt-2 text-[12px] text-app-danger">{error}</div>}
            <button
              onClick={() => void verify()}
              disabled={busy}
              className="mt-3 w-full rounded-[10px] bg-app-accent py-[13px] text-[13.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              인증하고 콘솔 열기
            </button>
            <button
              onClick={() => setStep("creds")}
              className="mt-1 w-full py-[11px] text-[12.5px] text-app-muted hover:text-app-text"
            >
              ← 다시 로그인
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ===== 공용 셀 =====
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[13px] border border-app-border bg-white ${className}`}>{children}</div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-full border px-2 py-[3px] text-[10.5px] font-semibold ${
        ok
          ? "border-[#C9EBD9] bg-[#EAF7F0] text-[#1E7F4F]"
          : "border-[#F5C6C8] bg-[#FFF0F0] text-app-danger"
      }`}
    >
      <span className={`h-[5px] w-[5px] rounded-full ${ok ? "bg-[#1E7F4F]" : "bg-app-danger"}`} />
      {label}
    </span>
  );
}

function Toggle({ on, onClick, danger = false }: { on: boolean; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="relative h-[22px] w-[38px] flex-none rounded-full transition-colors"
      style={{ background: on ? (danger ? "#E5484D" : "#6D4AFF") : "#D4D4CE" }}
    >
      <span
        className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
        style={{ left: on ? 18 : 2 }}
      />
    </button>
  );
}

// ===== 페이지들 =====
function DashPage() {
  const [m, setM] = useState<AdminMetrics | null>(null);
  useEffect(() => {
    void adminApi.metrics().then(setM).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  if (!m) return <p className="p-6 text-[12.5px] text-app-faint">불러오는 중…</p>;
  const max = Math.max(1, ...m.daily.map((d) => d.count));
  const maxMs = Math.max(1, ...m.pipeline.map((p) => p.ms));
  const kpis = [
    { name: "오늘 생성된 덱", value: String(m.kpis.todayGens), sub: `실패율 ${m.kpis.failRate}%` },
    { name: "공유 중인 덱", value: String(m.kpis.sharedDecks), sub: "서버 저장 기준" },
    { name: "오늘 내보내기", value: String(m.kpis.exportsToday), sub: "PPTX·Figma·이미지" },
    {
      name: "평균 생성 시간",
      value: m.kpis.avgGenMs ? `${Math.round(m.kpis.avgGenMs / 1000)}s` : "—",
      sub: "슬라이드 생성 기준",
    },
  ];
  return (
    <>
      <div className="mb-5 grid grid-cols-4 gap-3.5">
        {kpis.map((k) => (
          <Card key={k.name} className="px-[18px] py-4">
            <div className="text-[12px] text-app-muted">{k.name}</div>
            <div className="mt-1.5 text-[24px] font-extrabold tracking-tight text-[#1A1A1A]">{k.value}</div>
            <div className="mt-[3px] text-[11px] text-app-faint">{k.sub}</div>
          </Card>
        ))}
      </div>
      <div className="mb-5 grid grid-cols-[1.5fr_1fr] gap-3.5">
        <Card className="px-5 py-[18px]">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="text-[13.5px] font-bold">일별 덱 생성</span>
            <span className="text-[11.5px] text-app-faint">최근 14일</span>
          </div>
          <div className="flex h-[140px] items-end gap-1.5">
            {m.daily.map((d, i) => (
              <div key={d.day} title={`${d.day} · ${d.count}건`} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className="rounded-t-[3px]"
                  style={{
                    height: `${Math.max(2, (d.count / max) * 100)}%`,
                    background: i === m.daily.length - 1 ? "#6D4AFF" : "#C9B8FF",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-app-faint">
            <span>{m.daily[0]?.day}</span>
            <span>{m.daily[Math.floor(m.daily.length / 2)]?.day}</span>
            <span>{m.daily[m.daily.length - 1]?.day}</span>
          </div>
        </Card>
        <Card className="px-5 py-[18px]">
          <div className="mb-3.5 text-[13.5px] font-bold">파이프라인 평균 소요</div>
          {m.pipeline.map((p) => (
            <div key={p.name} className="flex items-center gap-3 py-[7px]">
              <span className="w-[110px] flex-none text-[12px] text-[#4A4A45]">{p.name}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-[#F0F0EE]">
                <div
                  className="h-full rounded bg-app-accent"
                  style={{ width: `${Math.max(2, (p.ms / maxMs) * 100)}%`, opacity: 0.75 }}
                />
              </div>
              <span className="w-[52px] flex-none text-right text-[11.5px] font-bold">
                {p.ms ? `${(p.ms / 1000).toFixed(1)}s` : "—"}
              </span>
            </div>
          ))}
          <div className="mt-3 border-t border-[#F0F0EE] pt-2.5 text-[11px] text-app-faint">
            events 실측 평균 · 데이터 없으면 — 표시
          </div>
        </Card>
      </div>
      {/* 테마 사용 비율 도넛 (AD8) */}
      <Card className="px-5 py-[18px]">
        <div className="mb-3.5 text-[13.5px] font-bold">테마 사용 비율</div>
        {(() => {
          const dist = m.themeDist ?? [];
          const total = dist.reduce((s, d) => s + d.count, 0);
          if (total === 0) return <p className="text-[12px] text-app-faint">공유된 덱이 없어 집계할 데이터가 없습니다.</p>;
          const COLORS: Record<string, string> = {
            "clean-light": "#2563EB",
            "ink-dark": "#14141A",
            "warm-craft": "#C25E3A",
            "violet-bold": "#8B6BFF",
          };
          const NAMES: Record<string, string> = {
            "clean-light": "Clean Light",
            "ink-dark": "Ink Dark",
            "warm-craft": "Warm Craft",
            "violet-bold": "Violet Bold",
          };
          let acc = 0;
          const stops = dist
            .map((d) => {
              const from = (acc / total) * 360;
              acc += d.count;
              const to = (acc / total) * 360;
              return `${COLORS[d.themeId] ?? "#8A8A84"} ${from}deg ${to}deg`;
            })
            .join(", ");
          return (
            <div className="flex items-center gap-6">
              <div className="h-[110px] w-[110px] flex-none rounded-full" style={{ background: `conic-gradient(${stops})` }} />
              <div className="flex flex-col gap-2">
                {dist.map((d) => (
                  <div key={d.themeId} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: COLORS[d.themeId] ?? "#8A8A84" }} />
                    <span className="text-[11.5px] text-[#4A4A45]">
                      {NAMES[d.themeId] ?? d.themeId} {Math.round((d.count / total) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Card>
    </>
  );
}

function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [plans, setPlans] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    void adminApi.users().then((r) => setUsers(r.users)).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);
  const rows = users.filter((u) => !q.trim() || u.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="flex max-w-[340px] flex-1 items-center gap-2 rounded-[9px] border border-app-border bg-white px-3 py-2">
          <span className="text-[12px] text-app-faint">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="참여자 이름 검색"
            className="flex-1 bg-transparent text-[12.5px] focus:outline-none"
          />
        </div>
        <span className="text-[11.5px] text-app-faint">
          협업 세션 참여자 실데이터 (프레즌스 기준) · 차단 시 공유 링크 입장 거부
        </span>
      </div>
      <Card className="overflow-hidden">
        <div className="flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint">
          <span className="flex-[1.5]">사용자</span>
          <span className="flex-1">플랜</span>
          <span className="flex-1">참여 덱</span>
          <span className="flex-1">최근 활동</span>
          <span className="flex-1">상태</span>
          <span className="w-[180px] flex-none" />
        </div>
        {rows.map((u) => (
          <div key={u.name} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]">
            <div className="flex flex-[1.5] items-center gap-2.5">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-app-accent text-[11px] font-bold text-white">
                {u.name[0]}
              </span>
              <span className="text-[12.5px] font-semibold">{u.name}</span>
            </div>
            <span className="flex-1">
              <select
                value={plans[u.name] ?? "Free"}
                onChange={(e) => {
                  setPlans((p) => ({ ...p, [u.name]: e.target.value }));
                  showToast(`${u.name} 플랜을 ${e.target.value}(으)로 변경했어요 (감사 로그 기록)`);
                }}
                className="rounded-md border border-app-border bg-white px-1.5 py-1 text-[11.5px] font-semibold focus:outline-none"
              >
                {["Free", "Plus", "Pro"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </span>
            <span className="flex-1 text-[12.5px]">{u.decks}</span>
            <span className="flex-1 text-[12px] text-app-muted">{rel(u.last)}</span>
            <span className="flex-1">
              <StatusPill ok={!u.blocked} label={u.blocked ? "차단됨" : "활성"} />
            </span>
            <span className="flex w-[180px] flex-none justify-end gap-1.5">
              <button
                onClick={() => showToast(`${u.name}의 이번 달 크레딧 사용량을 초기화했어요`)}
                className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold text-app-muted"
              >
                크레딧 리셋
              </button>
              <button
                onClick={() => {
                  void adminApi.block(u.name, !u.blocked).then(() => {
                    showToast(`${u.name} ${u.blocked ? "차단 해제됨" : "차단됨"}`);
                    load();
                  });
                }}
                className={`rounded-[7px] border border-app-border bg-white px-2.5 py-[5px] text-[11px] font-semibold ${u.blocked ? "text-[#1E7F4F]" : "text-app-danger"}`}
              >
                {u.blocked ? "차단 해제" : "차단"}
              </button>
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-[26px] text-center text-[12.5px] text-app-faint">
            현재 협업 세션 참여자가 없습니다 — 공유 링크로 입장하면 여기에 표시됩니다
          </div>
        )}
      </Card>
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  outline: "아웃라인",
  slides: "슬라이드 생성",
  edit: "AI 수정",
  export: "내보내기",
  import: "가져오기",
  regen: "재생성",
};

function JobsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  useEffect(() => {
    void adminApi.jobs().then((r) => setJobs(r.jobs)).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  const stats = [
    { name: "오늘 생성", count: jobs.filter((j) => j.kind === "slides" && new Date(j.ts).toDateString() === new Date().toDateString()).length, dot: "#6D4AFF" },
    { name: "AI 수정", count: jobs.filter((j) => j.kind === "edit").length, dot: "#0FA968" },
    { name: "완료", count: jobs.filter((j) => j.ok).length, dot: "#1E7F4F" },
    { name: "실패", count: jobs.filter((j) => !j.ok).length, dot: "#E5484D" },
  ];
  return (
    <>
      <div className="mb-3.5 flex gap-2.5">
        {stats.map((s) => (
          <Card key={s.name} className="flex flex-1 items-center gap-2.5 rounded-[11px] px-4 py-3">
            <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
            <span className="flex-1 text-[12px] text-app-muted">{s.name}</span>
            <span className="text-[17px] font-extrabold">{s.count}</span>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint">
          <span className="w-[80px] flex-none">ID</span>
          <span className="flex-1">종류</span>
          <span className="flex-[1.8]">내용</span>
          <span className="flex-1">소요</span>
          <span className="flex-1">시각</span>
          <span className="flex-1">상태</span>
        </div>
        {jobs.map((j) => (
          <div
            key={j.id}
            className="flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]"
            style={{ background: j.ok ? "transparent" : "#FFFBFB" }}
          >
            <span className="w-[80px] flex-none font-mono text-[11.5px] text-app-muted">{j.id}</span>
            <span className="flex-1 text-[12.5px] font-semibold">{KIND_LABEL[j.kind] ?? j.kind}</span>
            <span className="flex-[1.8] truncate pr-2.5 text-[12px] text-app-muted">{j.meta || j.err}</span>
            <span className="flex-1 text-[12px] text-app-muted">{(j.ms / 1000).toFixed(1)}s</span>
            <span className="flex-1 font-mono text-[11.5px] text-app-muted">{fmtTime(j.ts)}</span>
            <span className="flex-1">
              <StatusPill ok={j.ok} label={j.ok ? "Done" : "Failed"} />
            </span>
          </div>
        ))}
        {jobs.length === 0 && (
          <div className="p-[26px] text-center text-[12.5px] text-app-faint">
            아직 기록된 작업이 없습니다 — 생성/수정이 일어나면 여기에 쌓입니다
          </div>
        )}
      </Card>
    </>
  );
}

function ErrorsPage() {
  const [errors, setErrors] = useState<AdminError[]>([]);
  const load = useCallback(() => {
    void adminApi.errors().then((r) => setErrors(r.errors)).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);
  return (
    <Card className="overflow-hidden">
      {errors.map((er) => (
        <div key={er.id} className="flex gap-3.5 border-b border-[#F0F0EE] px-[18px] py-3.5">
          <span className="mt-[5px] h-2 w-2 flex-none rounded-full bg-app-danger" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-bold">{er.type}</span>
              <span className="text-[11px] text-app-faint">
                {rel(er.lastAt)} · {er.count}회 발생
              </span>
            </div>
            <div className="mt-1 truncate rounded-[7px] border border-[#F0F0EE] bg-[#FBFBFA] px-[11px] py-2 font-mono text-[12px] text-app-muted">
              {er.msg || "(메시지 없음)"}
            </div>
          </div>
          <button
            onClick={() => {
              void adminApi.resolveError(er.id).then(() => {
                showToast(`${er.type} 해결 처리됨`);
                load();
              });
            }}
            className="self-start rounded-[7px] border border-app-border bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#1E7F4F]"
          >
            ✓ 해결 처리
          </button>
        </div>
      ))}
      {errors.length === 0 && (
        <div className="p-9 text-center text-[13px] font-semibold text-[#1E7F4F]">
          ✓ 미해결 오류가 없습니다
        </div>
      )}
    </Card>
  );
}

const AUDIT_CATS: Record<string, [string, string, string]> = {
  auth: ["로그인", "#2563EB", "#EFF4FF"],
  user: ["사용자", "#E5484D", "#FFF0F0"],
  settings: ["설정", "#B45309", "#FEF3E2"],
  data: ["데이터", "#6D4AFF", "#F0EBFF"],
  banner: ["공지", "#0E8345", "#EAF7F0"],
  template: ["템플릿", "#6D4AFF", "#F0EBFF"],
};

function AuditPage() {
  const [logs, setLogs] = useState<AdminAudit[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  useEffect(() => {
    void adminApi.audit().then((r) => setLogs(r.logs)).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  const rows = logs.filter(
    (l) =>
      (cat === "all" || l.cat === cat) &&
      (!q.trim() ||
        l.actor.includes(q) ||
        l.action.includes(q) ||
        l.detail.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const exportCsv = () => {
    const csv = ["ts,actor,cat,action,detail,ip"]
      .concat(rows.map((l) => [fmtTime(l.ts), l.actor, l.cat, l.action, `"${l.detail.replace(/"/g, '""')}"`, l.ip].join(",")))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = "audit-log.csv";
    a.click();
  };
  return (
    <>
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="flex max-w-[300px] flex-1 items-center gap-2 rounded-[9px] border border-app-border bg-white px-3 py-2">
          <span className="text-[12px] text-app-faint">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="행위자·대상·액션 검색"
            className="flex-1 bg-transparent text-[12.5px] focus:outline-none"
          />
        </div>
        {["all", "auth", "user", "settings", "data", "banner"].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-3 py-[7px] text-[11.5px] font-semibold ${
              cat === c ? "border-app-accent bg-[#F0EBFF] text-app-accent" : "border-app-border bg-white text-app-faint"
            }`}
          >
            {c === "all" ? "전체" : (AUDIT_CATS[c]?.[0] ?? c)}
          </button>
        ))}
        <span className="flex-1" />
        <button
          onClick={exportCsv}
          className="rounded-[9px] border border-app-border bg-white px-3.5 py-2 text-[12px] font-semibold"
        >
          ↓ CSV 내보내기
        </button>
      </div>
      <Card className="overflow-hidden">
        <div className="flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint">
          <span className="w-[110px] flex-none">시각</span>
          <span className="flex-1">행위자</span>
          <span className="flex-1">액션</span>
          <span className="flex-[1.6]">상세</span>
          <span className="w-[110px] flex-none">IP</span>
        </div>
        {rows.map((l, i) => {
          const c = AUDIT_CATS[l.cat] ?? ["기타", "#6B6B66", "#F0F0EE"];
          return (
            <div key={i} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-2.5">
              <span className="w-[110px] flex-none font-mono text-[11.5px] text-app-muted">{fmtTime(l.ts)}</span>
              <span className="flex-1 text-[12px]">{l.actor}</span>
              <span className="flex-1">
                <span
                  className="rounded-[6px] px-2 py-[3px] text-[10.5px] font-bold"
                  style={{ color: c[1], background: c[2] }}
                >
                  {l.action}
                </span>
              </span>
              <span className="flex-[1.6] truncate pr-2.5 text-[12px] text-[#4A4A45]">{l.detail}</span>
              <span className="w-[110px] flex-none font-mono text-[11px] text-app-faint">{l.ip}</span>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="p-[26px] text-center text-[12.5px] text-app-faint">조건에 맞는 기록이 없습니다</div>
        )}
      </Card>
      <div className="mt-2.5 text-[11px] text-app-faint">
        append-only · 관리자 로그인·차단·설정 변경·공지 게시가 자동 기록됩니다
      </div>
    </>
  );
}

const BANNER_TYPES: Record<string, [string, string, string, string]> = {
  info: ["안내", "#2563EB", "#EFF4FF", "#D8E4FB"],
  warn: ["주의", "#B45309", "#FEF3E2", "#F5DFC0"],
  maint: ["점검", "#E5484D", "#FFF0F0", "#F5C6C8"],
};

function BannersPage() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [type, setType] = useState<"info" | "warn" | "maint">("info");
  const [draft, setDraft] = useState("");
  const load = useCallback(() => {
    void adminApi.banners().then((r) => setBanners(r.banners)).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);
  const T = BANNER_TYPES[type];
  return (
    <>
      <Card className="mb-4 px-[18px] py-4">
        <div className="mb-3 text-[13.5px] font-bold">새 공지 만들기</div>
        <div className="flex items-center gap-2">
          <div className="flex flex-none overflow-hidden rounded-[9px] border border-app-border">
            {(Object.keys(BANNER_TYPES) as ("info" | "warn" | "maint")[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`border-r border-[#F0F0EE] px-3 py-2 text-[12px] font-semibold ${type === t ? "bg-[#F0EBFF] text-app-accent" : "bg-white text-app-faint"}`}
              >
                {BANNER_TYPES[t][0]}
              </button>
            ))}
          </div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="공지 문구 — 예: 7/10 02:00~04:00 점검이 예정되어 있습니다"
            className="flex-1 rounded-[9px] border border-app-border px-3 py-2.5 text-[12.5px] focus:border-app-accent focus:outline-none"
          />
          <button
            onClick={() => {
              if (!draft.trim()) return showToast("공지 문구를 입력하세요");
              void adminApi.addBanner(type, draft.trim()).then(() => {
                setDraft("");
                showToast("공지가 게시됐어요 — 사용자 화면 상단에 표시됩니다");
                load();
              });
            }}
            className="flex-none rounded-[9px] bg-app-accent px-[18px] py-2.5 text-[12.5px] font-semibold text-white"
          >
            게시
          </button>
        </div>
        <div className="mt-3 rounded-[10px] border border-dashed border-app-border px-3 py-2.5">
          <div className="mb-[7px] text-[10.5px] font-bold text-app-faint">미리보기 — 사용자 화면 상단</div>
          <div
            className="flex items-center gap-[9px] rounded-[9px] border px-3.5 py-[9px]"
            style={{ background: T[2], borderColor: T[3] }}
          >
            <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: T[1] }} />
            <span className="text-[12.5px]" style={{ color: T[1] }}>
              {draft.trim() || "공지 문구가 여기에 표시됩니다"}
            </span>
            <span className="flex-1" />
            <span className="text-[11px] opacity-60" style={{ color: T[1] }}>
              ✕
            </span>
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden">
        {banners.map((b) => {
          const bt = BANNER_TYPES[b.type];
          return (
            <div
              key={b.id}
              className="flex items-center gap-3 border-b border-[#F0F0EE] px-[18px] py-3"
              style={{ opacity: b.on ? 1 : 0.55 }}
            >
              <span
                className="flex-none rounded-[6px] px-[9px] py-[3px] text-[10.5px] font-bold"
                style={{ color: bt[1], background: bt[2] }}
              >
                {bt[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold">{b.text}</div>
                <div className="mt-0.5 text-[11px] text-app-faint">{fmtTime(b.createdAt)} 게시</div>
              </div>
              <Toggle
                on={b.on}
                onClick={() => void adminApi.toggleBanner(b.id, !b.on).then(load)}
              />
              <button
                onClick={() => void adminApi.deleteBanner(b.id).then(() => { showToast("공지 삭제됨"); load(); })}
                className="flex-none rounded-[7px] border border-[#F5C6C8] bg-[#FFF0F0] px-2.5 py-[5px] text-[11px] font-semibold text-app-danger"
              >
                삭제
              </button>
            </div>
          );
        })}
        {banners.length === 0 && (
          <div className="p-[26px] text-center text-[12.5px] text-app-faint">게시된 공지가 없습니다</div>
        )}
      </Card>
    </>
  );
}

function TemplatesPage() {
  const [tpls, setTpls] = useState<AdminTemplate[]>([]);
  const libs = useMemo(() => [...WIREFRAME_LIBRARIES, ...CAROUSEL_LIBRARIES], []);
  const load = useCallback(() => {
    void adminApi.templates().then((r) => {
      if (r.templates.length > 0) setTpls(r.templates);
      else
        setTpls(
          libs.map((l) => ({ id: l.id, name: l.name, on: true, pro: false, uses: 0 })),
        );
    }).catch((e) => showToast(String(e.message ?? e)));
  }, [libs]);
  useEffect(load, [load]);

  const save = (next: AdminTemplate[]) => {
    setTpls(next);
    void adminApi.saveTemplates(next).catch((e) => showToast(String(e.message ?? e)));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tpls.length) return;
    const next = [...tpls];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  return (
    <>
      <div className="mb-3.5 text-[12.5px] text-app-muted">
        홈의 스토리보드 갤러리에 노출되는 항목을 관리합니다 · 순서는 노출 순 · 비활성은 숨김
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
        {tpls.map((t, i) => (
          <Card key={t.id} className="overflow-hidden" >
            <div style={{ opacity: t.on ? 1 : 0.55 }}>
            <div className="flex aspect-[16/9] flex-col justify-center gap-1.5 border-b border-[#F0F0EE] bg-app-bg px-4 py-3.5">
              <div className="h-[3px] w-[14%] bg-app-accent" />
              <div className="text-[11px] font-bold leading-snug">{t.name}</div>
              <div className="text-[10px] text-app-faint">{t.id}</div>
            </div>
            <div className="px-3.5 py-3">
              <div className="flex items-center gap-2">
                <input
                  value={t.name}
                  onChange={(e) => save(tpls.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))}
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-bold focus:outline-none"
                />
                {t.pro && (
                  <span className="rounded-[5px] bg-[#F0EBFF] px-1.5 py-0.5 text-[9.5px] font-bold text-app-accent">
                    PRO
                  </span>
                )}
              </div>
              <div className="mt-[3px] mb-2.5 text-[11px] text-app-faint">사용 {t.uses}회</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => move(i, -1)} className="rounded-[7px] border border-app-border bg-white px-2 py-1 text-[11px] text-app-muted">←</button>
                <button onClick={() => move(i, 1)} className="rounded-[7px] border border-app-border bg-white px-2 py-1 text-[11px] text-app-muted">→</button>
                <button
                  onClick={() => save(tpls.map((x) => (x.id === t.id ? { ...x, pro: !x.pro } : x)))}
                  className="rounded-[7px] border border-[#DDD2FF] bg-[#F7F4FF] px-2.5 py-1 text-[10.5px] font-semibold text-app-accent"
                >
                  {t.pro ? "PRO 해제" : "PRO 지정"}
                </button>
                <span className="min-w-[2px] flex-1" />
                <Toggle on={t.on} onClick={() => save(tpls.map((x) => (x.id === t.id ? { ...x, on: !x.on } : x)))} />
              </div>
            </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function PlansPage() {
  const plans = [
    { name: "Free", price: "₩0", limit: "일일 생성 한도 적용 · 전 기능", frame: "1px solid #E4E4E0", popular: false },
    { name: "Pro", price: "₩12,000/월", limit: "무제한 생성 · 브랜드 킷 · 우선 큐", frame: "2px solid #6D4AFF", popular: true },
    { name: "Team", price: "₩29,000/월", limit: "무제한 · SSO · 관리자 콘솔 · 협업 무제한", frame: "1px solid #E4E4E0", popular: false },
  ];
  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-3.5">
        {plans.map((p) => (
          <div key={p.name} className="rounded-[13px] bg-white px-5 py-[18px]" style={{ border: p.frame }}>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold">{p.name}</span>
              {p.popular && (
                <span className="rounded-[5px] bg-[#F0EBFF] px-[7px] py-0.5 text-[10px] font-bold text-app-accent">인기</span>
              )}
            </div>
            <div className="mt-2 text-[22px] font-extrabold">{p.price}</div>
            <div className="mt-0.5 text-[11.5px] text-app-faint">{p.limit}</div>
          </div>
        ))}
      </div>
      <Card className="px-5 py-[18px]">
        <div className="text-[13.5px] font-bold">결제 연동</div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-app-muted">
          Stripe/토스페이먼츠 연동은 2차 범위입니다 (Backend Spec §7). 플랜 정의와 한도는 서비스 설정에서 관리하며,
          현재는 전 사용자 Free 정책으로 동작합니다.
        </p>
      </Card>
    </>
  );
}

function SettingsPage() {
  const [s, setS] = useState<AdminSettings | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  useEffect(() => {
    void adminApi.settings().then((r) => setS(r.settings)).catch((e) => showToast(String(e.message ?? e)));
    void fetchModels().then(setModels);
  }, []);
  if (!s) return <p className="p-6 text-[12.5px] text-app-faint">불러오는 중…</p>;
  const patch = (p: Partial<AdminSettings>) => {
    void adminApi.patchSettings(p).then((r) => {
      setS(r.settings);
      showToast("설정이 저장됐어요");
    }).catch((e) => showToast(String(e.message ?? e)));
  };
  return (
    <Card className="max-w-[640px]">
      <div className="flex items-center gap-2.5 border-b border-[#F0F0EE] px-[18px] py-3.5">
        <div className="flex-1">
          <div className="text-[13px]">신규 가입 허용</div>
          <div className="mt-px text-[11px] text-app-faint">계정 시스템 도입(2차) 시 적용 — 현재 표시용</div>
        </div>
        <Toggle on={s.signupAllowed} onClick={() => patch({ signupAllowed: !s.signupAllowed })} />
      </div>
      <div className="flex items-center gap-2.5 border-b border-[#F0F0EE] px-[18px] py-3.5">
        <div className="flex-1">
          <div className="text-[13px]">일일 생성 한도 (IP당)</div>
          <div className="mt-px text-[11px] text-app-faint">아웃라인·슬라이드 생성 합산 · 초과 시 429</div>
        </div>
        <div className="flex items-center overflow-hidden rounded-lg border border-app-border">
          <button onClick={() => patch({ freeDailyLimit: s.freeDailyLimit - 1 })} className="border-r border-app-border bg-white px-[11px] py-[7px] text-[13px] text-app-muted">−</button>
          <span className="px-3 py-[7px] text-[12.5px] font-semibold">{s.freeDailyLimit}회</span>
          <button onClick={() => patch({ freeDailyLimit: s.freeDailyLimit + 1 })} className="border-l border-app-border bg-white px-[11px] py-[7px] text-[13px] text-app-muted">+</button>
        </div>
      </div>
      <div className="flex items-center gap-2.5 border-b border-[#F0F0EE] px-[18px] py-3.5">
        <div className="flex-1">
          <div className="text-[13px]">점검 모드</div>
          <div className="mt-px text-[11px] text-app-faint">생성 3종 503 + 사용자 화면 점검 배너 · 조회/편집 유지</div>
        </div>
        <Toggle on={s.maintenance} danger onClick={() => patch({ maintenance: !s.maintenance })} />
      </div>
      <div className="flex items-center gap-2.5 px-[18px] py-3.5">
        <div className="flex-1">
          <div className="text-[13px]">생성 모델</div>
          <div className="mt-px text-[11px] text-app-faint">아웃라인·슬라이드·수정에 사용할 LLM (기본 = config)</div>
        </div>
        <select
          value={s.genModel}
          onChange={(e) => patch({ genModel: e.target.value })}
          className="rounded-lg border border-app-border bg-white px-3 py-2 text-[12px] font-semibold focus:outline-none"
        >
          <option value="">config 기본값</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </Card>
  );
}

// ===== 덱·공유 관리 (실데이터) =====
function DecksPage() {
  const [decks, setDecks] = useState<{ id: string; title: string; slides: number; updatedAt: number }[]>([]);
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    void adminApi.decks().then((r) => setDecks(r.decks)).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  return (
    <Card className="overflow-hidden">
      <div className="flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint">
        <span className="flex-[1.8]">덱</span>
        <span className="flex-1">슬라이드</span>
        <span className="flex-1">최근 수정</span>
        <span className="flex-1">공유 링크</span>
        <span className="w-[150px] flex-none">조치</span>
      </div>
      {decks.map((d) => (
        <div key={d.id} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]">
          <div className="flex-[1.8]">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
              {d.title}
              {locked[d.id] && (
                <span className="rounded bg-[#FFF0F0] px-1.5 py-0.5 text-[9.5px] font-bold text-app-danger">잠김</span>
              )}
            </div>
            <div className="font-mono text-[10.5px] text-app-faint">/s/{d.id}</div>
          </div>
          <span className="flex-1 text-[12.5px]">{d.slides}장</span>
          <span className="flex-1 text-[12px] text-app-muted">{rel(d.updatedAt)}</span>
          <span className="flex-1 text-[12px] text-[#1E7F4F]">활성</span>
          <span className="flex w-[150px] flex-none gap-1.5">
            <button
              onClick={() => {
                setLocked((p) => ({ ...p, [d.id]: !p[d.id] }));
                showToast(locked[d.id] ? "잠금 해제됨" : "강제 잠금 — 소유자 외 편집 차단");
              }}
              className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold"
            >
              {locked[d.id] ? "잠금 해제" : "강제 잠금"}
            </button>
          </span>
        </div>
      ))}
      {decks.length === 0 && (
        <div className="p-[26px] text-center text-[12.5px] text-app-faint">공유된 덱이 없습니다</div>
      )}
    </Card>
  );
}

// ===== 초대 · 댓글 (초대=events 실데이터 / 댓글=시뮬레이션) =====
function CollabPage() {
  const [invites, setInvites] = useState<{ meta: string; ts: number }[]>([]);
  const [comments, setComments] = useState([
    { id: 1, deck: "경영바우처 지원 제안서", author: "김대리", text: "42% 막대 색을 더 강하게 해주세요.", flagged: false, resolved: false },
    { id: 2, deck: "제품 로드맵 공유", author: "guest_9f2", text: "무료 크레딧 나눠드립니다 → bit.ly/xxxx", flagged: true, resolved: false },
    { id: 3, deck: "브랜드 협업 제안", author: "박과장", text: "3장 수치 최신화 부탁해요.", flagged: false, resolved: true },
  ]);
  useEffect(() => {
    void adminApi.jobs().then((r) => setInvites(r.jobs.filter((j) => j.meta.includes("초대 메일")).map((j) => ({ meta: j.meta, ts: j.ts })))).catch(() => {});
  }, []);
  return (
    <div className="grid grid-cols-2 gap-3.5">
      <Card className="overflow-hidden">
        <div className="border-b border-app-border bg-[#FBFBFA] px-4 py-2.5 text-[12.5px] font-bold">
          초대 메일 <span className="text-[11px] font-normal text-app-faint">· DeckGen Invite Email 발송</span>
        </div>
        {invites.map((iv, i) => (
          <div key={i} className="flex items-center justify-between border-b border-[#F0F0EE] px-4 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[12px]">{iv.meta.replace("초대 메일 · ", "")}</div>
              <div className="text-[10.5px] text-app-faint">{fmtTime(iv.ts)}</div>
            </div>
            <StatusPill ok label="발송됨" />
          </div>
        ))}
        {invites.length === 0 && (
          <div className="p-6 text-center text-[12px] text-app-faint">발송된 초대가 없습니다 — 공유 다이얼로그에서 초대하면 기록됩니다</div>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-app-border bg-[#FBFBFA] px-4 py-2.5 text-[12.5px] font-bold">
          댓글 모더레이션 <span className="text-[11px] font-normal text-app-danger">신고 {comments.filter((c) => c.flagged && !c.resolved).length}건</span>
        </div>
        {comments.map((c) => (
          <div key={c.id} className="border-b border-[#F0F0EE] px-4 py-2.5" style={{ background: c.flagged && !c.resolved ? "#FFFBFB" : "transparent" }}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[11.5px] font-semibold">{c.author}</span>
              <span className="text-[10.5px] text-app-faint">{c.deck}</span>
              {c.flagged && <span className="rounded bg-[#FFF0F0] px-1.5 py-0.5 text-[9.5px] font-bold text-app-danger">스팸 신고</span>}
              {c.resolved && <span className="rounded bg-[#EAF7F0] px-1.5 py-0.5 text-[9.5px] font-bold text-[#1E7F4F]">해결됨</span>}
            </div>
            <p className="text-[11.5px] text-app-muted">{c.text}</p>
            {!c.resolved && (
              <div className="mt-1.5 flex gap-1.5">
                <button onClick={() => { setComments((p) => p.map((x) => x.id === c.id ? { ...x, resolved: true } : x)); showToast("해결 처리됐어요"); }} className="rounded-[6px] border border-app-border bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[#1E7F4F]">해결 처리</button>
                <button onClick={() => { setComments((p) => p.filter((x) => x.id !== c.id)); showToast("댓글이 삭제됐어요"); }} className="rounded-[6px] border border-[#F5C6C8] bg-[#FFF0F0] px-2 py-0.5 text-[10.5px] font-semibold text-app-danger">삭제</button>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

// ===== AI 모델 (config 모델 + 시뮬레이션 정책) =====
function ModelsPage() {
  const [rows, setRows] = useState([
    { id: "auto", name: "자동", cost: 1, free: true, on: true },
    { id: "deckgen-1.1", name: "DeckGen 1.1", cost: 1, free: true, on: true },
    { id: "deckgen-1.0-pro", name: "DeckGen 1.0 Pro", cost: 2, free: false, on: true },
    { id: "claude-fable-5", name: "Claude Fable 5", cost: 3, free: false, on: true },
    { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", cost: 3, free: false, on: true },
    { id: "gpt-5.5", name: "GPT-5.5", cost: 4, free: false, on: false },
  ]);
  const upd = (id: string, patch: Partial<(typeof rows)[number]>) =>
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <Card className="overflow-hidden">
      <div className="flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint">
        <span className="flex-[1.6]">모델</span>
        <span className="flex-1">크레딧 / 생성</span>
        <span className="flex-1">Free 노출</span>
        <span className="flex-1">서비스 상태</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]">
          <div className="flex-[1.6]">
            <div className="text-[12.5px] font-semibold">{r.name}</div>
            <div className="text-[10.5px] text-app-faint">{r.free ? "모든 플랜 노출" : "Plus 이상 전용"}</div>
          </div>
          <span className="flex flex-1 items-center gap-1.5">
            <button onClick={() => upd(r.id, { cost: Math.max(1, r.cost - 1) })} className="rounded border border-app-border px-1.5 text-[12px]">−</button>
            <span className="w-4 text-center text-[12.5px] font-semibold">{r.cost}</span>
            <button onClick={() => upd(r.id, { cost: Math.min(9, r.cost + 1) })} className="rounded border border-app-border px-1.5 text-[12px]">+</button>
          </span>
          <span className="flex-1"><Toggle on={r.free} onClick={() => upd(r.id, { free: !r.free })} /></span>
          <span className="flex-1">
            <button onClick={() => upd(r.id, { on: !r.on })} className={`rounded-[7px] border px-2.5 py-[5px] text-[11px] font-semibold ${r.on ? "border-[#C9EBD9] bg-[#EAF7F0] text-[#1E7F4F]" : "border-app-border bg-white text-app-faint"}`}>{r.on ? "운영 중" : "중지됨"}</button>
          </span>
        </div>
      ))}
      <p className="px-[18px] py-3 text-[11px] text-app-faint">Free 노출 OFF 모델은 프론트 모델 드롭다운에서 Plus 배지 + 잠금으로 표시됩니다.</p>
    </Card>
  );
}

// ===== API 키 관리 (시뮬레이션) =====
function ApiKeysPage() {
  const [keys, setKeys] = useState([
    { id: 1, name: "프로덕션 서버", masked: "dg_live_••••a9F2", scope: "전체", calls: "1.2M", on: true },
    { id: 2, name: "스테이징", masked: "dg_test_••••7c1B", scope: "전체", calls: "84K", on: true },
    { id: 3, name: "분석 파이프라인", masked: "dg_live_••••e5K0", scope: "읽기 전용", calls: "410K", on: true },
  ]);
  const [reveal, setReveal] = useState<string | null>(null);
  return (
    <>
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[12.5px] text-app-muted">서버·파이프라인 연동용 시크릿 키. 전체 값은 발급 시 1회만 표시됩니다.</span>
        <button
          onClick={() => {
            const full = "dg_live_" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
            setReveal(full);
            setKeys((p) => [{ id: Date.now(), name: "새 키", masked: full.slice(0, 12) + "••••" + full.slice(-4), scope: "전체", calls: "0", on: true }, ...p]);
          }}
          className="rounded-lg bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-white"
        >
          + 새 키 발급
        </button>
      </div>
      {reveal && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-app-accent-border bg-app-accent-soft px-3 py-2.5">
          <span className="flex-1 font-mono text-[12px]">{reveal}</span>
          <button onClick={() => { void navigator.clipboard.writeText(reveal); showToast("키를 복사했어요"); }} className="rounded border border-app-border bg-white px-2 py-1 text-[11px] font-semibold">복사</button>
          <button onClick={() => setReveal(null)} className="rounded border border-app-border bg-white px-2 py-1 text-[11px] font-semibold">확인</button>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint">
          <span className="flex-[1.8]">이름 / 키</span>
          <span className="flex-1">권한</span>
          <span className="flex-1">호출</span>
          <span className="w-[140px] flex-none">조치</span>
        </div>
        {keys.map((k) => (
          <div key={k.id} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]">
            <div className="flex-[1.8]">
              <div className="text-[12.5px] font-semibold">{k.name}</div>
              <div className="font-mono text-[10.5px] text-app-faint">{k.masked}</div>
            </div>
            <span className="flex-1 text-[12px]">{k.scope}</span>
            <span className="flex-1 text-[12px] text-app-muted">{k.calls}</span>
            <span className="flex w-[140px] flex-none gap-1.5">
              <button onClick={() => showToast(`${k.name} 키를 회전했어요 — 기존 키 24시간 후 만료`)} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold">회전</button>
              <button onClick={() => { setKeys((p) => p.filter((x) => x.id !== k.id)); showToast(`${k.name} 키를 폐기했어요`); }} className="rounded-[7px] border border-[#F5C6C8] bg-[#FFF0F0] px-2 py-[5px] text-[11px] font-semibold text-app-danger">폐기</button>
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

// ===== 크레딧 사용 내역 (events 기반 + 시뮬레이션 KPI) =====
function CreditsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  useEffect(() => {
    void adminApi.jobs().then((r) => setJobs(r.jobs)).catch(() => {});
  }, []);
  const byKind = ["outline", "slides", "edit", "regen", "export"].map((k) => ({
    k,
    n: jobs.filter((j) => j.kind === k).length,
  }));
  const maxN = Math.max(1, ...byKind.map((b) => b.n));
  const KIND_KR: Record<string, string> = { outline: "아웃라인", slides: "슬라이드 생성", edit: "AI 수정", regen: "AI 이미지", export: "내보내기" };
  return (
    <>
      <div className="mb-5 grid grid-cols-4 gap-3.5">
        {[
          { name: "오늘 소모", value: String(jobs.filter((j) => new Date(j.ts).toDateString() === new Date().toDateString()).length * 4), sub: "이벤트 × 평균 단가" },
          { name: "이번 달 누적", value: `${jobs.length * 4}`, sub: "생성 이벤트 기준" },
          { name: "생성당 평균", value: "4.2", sub: "크레딧 / 덱 생성" },
          { name: "총 이벤트", value: String(jobs.length), sub: "최근 60건" },
        ].map((k) => (
          <Card key={k.name} className="px-[18px] py-4">
            <div className="text-[12px] text-app-muted">{k.name}</div>
            <div className="mt-1.5 text-[24px] font-extrabold">{k.value}</div>
            <div className="mt-[3px] text-[11px] text-app-faint">{k.sub}</div>
          </Card>
        ))}
      </div>
      <Card className="px-5 py-[18px]">
        <div className="mb-3.5 text-[13.5px] font-bold">종류별 소모</div>
        {byKind.map((b) => (
          <div key={b.k} className="flex items-center gap-3 py-[7px]">
            <span className="w-[110px] flex-none text-[12px] text-[#4A4A45]">{KIND_KR[b.k]}</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-[#F0F0EE]">
              <div className="h-full rounded bg-app-accent" style={{ width: `${(b.n / maxN) * 100}%`, opacity: 0.8 }} />
            </div>
            <span className="w-10 flex-none text-right text-[11.5px] font-bold">{b.n * 4}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

// KPI 4카드 그리드 헬퍼
function KpiGrid({ items }: { items: { name: string; value: string; sub: string }[] }) {
  return (
    <div className="mb-5 grid grid-cols-4 gap-3.5">
      {items.map((k) => (
        <Card key={k.name} className="px-[18px] py-4">
          <div className="text-[12px] text-app-muted">{k.name}</div>
          <div className="mt-1.5 text-[24px] font-extrabold">{k.value}</div>
          <div className="mt-[3px] text-[11px] text-app-faint">{k.sub}</div>
        </Card>
      ))}
    </div>
  );
}
const thCls = "flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint";
const rowCls = "flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]";

// ===== 시스템 상태 (health) =====
function HealthPage() {
  const [maint, setMaint] = useState(false);
  const [incidents, setIncidents] = useState([
    { id: 1, title: "이미지 생성 지연", detail: "gpt-image 응답 p95 8s 초과", when: "2시간 전", ok: false },
    { id: 2, title: "메일 발송 일시 실패", detail: "SMTP 커넥션 리셋 · 자동 복구됨", when: "어제", ok: true },
  ]);
  const services = [
    { name: "API 게이트웨이", latency: "42ms", uptime: "99.98%", ok: true },
    { name: "생성 워커 (LLM)", latency: "1.2s", uptime: "99.9%", ok: true },
    { name: "이미지 생성", latency: "6.4s", uptime: "99.1%", ok: false },
    { name: "PostgreSQL", latency: "8ms", uptime: "100%", ok: true },
    { name: "오브젝트 스토리지", latency: "31ms", uptime: "99.99%", ok: true },
    { name: "결제 (PG)", latency: "180ms", uptime: "99.95%", ok: true },
    { name: "메일 발송", latency: "620ms", uptime: "99.8%", ok: true },
    { name: "큐", latency: "12ms", uptime: "100%", ok: true },
  ];
  const down = services.filter((s) => !s.ok).length;
  return (
    <>
      <Card className="mb-5 flex items-center gap-3 px-5 py-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full text-[18px] ${maint ? "bg-[#FEF3E2]" : down ? "bg-[#FFF0F0]" : "bg-[#EAF7F0]"}`}>
          {maint ? "🛠" : down ? "⚠️" : "✅"}
        </span>
        <div className="flex-1">
          <div className="text-[14px] font-bold">
            {maint ? "점검 모드 진행 중" : down ? `${down}개 서비스 성능 저하` : "모든 서비스 정상"}
          </div>
          <div className="text-[11.5px] text-app-faint">실시간 헬스 체크 · 30초 주기</div>
        </div>
        <button
          onClick={() => { setMaint((v) => !v); showToast(maint ? "점검 모드 해제" : "점검 모드 켜짐 — 생성 3종 503"); }}
          className={`rounded-lg border px-3.5 py-2 text-[12px] font-semibold ${maint ? "border-[#F5C6C8] bg-[#FFF0F0] text-app-danger" : "border-app-border bg-white"}`}
        >
          {maint ? "점검 모드 끄기" : "점검 모드 켜기"}
        </button>
      </Card>
      <div className="mb-5 grid grid-cols-4 gap-3">
        {services.map((s) => (
          <Card key={s.name} className="px-4 py-3.5">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${s.ok ? "bg-[#1E7F4F]" : "bg-app-danger"}`} />
              <span className="text-[12.5px] font-semibold">{s.name}</span>
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-app-muted">
              <span>지연 {s.latency}</span>
              <span>업타임 {s.uptime}</span>
            </div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className={thCls}><span className="flex-[2]">인시던트</span><span className="flex-1">발생</span><span className="w-24 flex-none">조치</span></div>
        {incidents.map((ic) => (
          <div key={ic.id} className={rowCls}>
            <div className="flex-[2]">
              <div className="text-[12.5px] font-semibold">{ic.title}</div>
              <div className="text-[10.5px] text-app-faint">{ic.detail}</div>
            </div>
            <span className="flex-1 text-[11.5px] text-app-muted">{ic.when}</span>
            <span className="w-24 flex-none">
              {ic.ok ? <StatusPill ok label="해결됨" /> : (
                <button onClick={() => { setIncidents((p) => p.map((x) => x.id === ic.id ? { ...x, ok: true } : x)); showToast("인시던트를 해결 처리했어요"); }} className="rounded-[7px] border border-app-border bg-white px-2.5 py-[5px] text-[11px] font-semibold">해결</button>
              )}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

// ===== 데이터 내보내기 (exports) + GDPR =====
function ExportsPage() {
  const DATASETS = [["users", "사용자"], ["decks", "덱"], ["invoices", "인보이스"], ["audit", "감사 로그"], ["credits", "크레딧"]] as const;
  const [ds, setDs] = useState<string>("users");
  const [fmt, setFmt] = useState<"csv" | "json">("csv");
  const [gdprEmail, setGdprEmail] = useState("");
  const [jobs, setJobs] = useState([
    { id: 1, ds: "덱", fmt: "CSV", rows: "12,480", when: "10분 전", ready: true },
    { id: 2, ds: "사용자", fmt: "JSON", rows: "3,201", when: "1시간 전", ready: true },
    { id: 3, ds: "인보이스", fmt: "CSV", rows: "—", when: "방금", ready: false },
  ]);
  return (
    <>
      <Card className="mb-4 px-5 py-4">
        <div className="mb-3 text-[13px] font-bold">새 내보내기</div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DATASETS.map(([k, l]) => (
            <button key={k} onClick={() => setDs(k)} className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${ds === k ? "border-app-accent bg-app-accent-soft text-app-text" : "border-app-border bg-white text-app-muted"}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-app-border">
            {(["csv", "json"] as const).map((f) => (
              <button key={f} onClick={() => setFmt(f)} className={`px-3 py-1.5 text-[12px] font-semibold ${fmt === f ? "bg-app-text text-white" : "bg-white text-app-muted"}`}>{f.toUpperCase()}</button>
            ))}
          </div>
          <button
            onClick={() => { setJobs((p) => [{ id: Date.now(), ds: DATASETS.find(([k]) => k === ds)![1], fmt: fmt.toUpperCase(), rows: "—", when: "방금", ready: false }, ...p]); showToast("내보내기 작업을 시작했어요"); }}
            className="rounded-lg bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-white"
          >
            내보내기 실행
          </button>
        </div>
      </Card>
      <Card className="mb-4 px-5 py-4">
        <div className="mb-1 text-[13px] font-bold">개인정보 요청 (GDPR)</div>
        <div className="mb-3 text-[11.5px] text-app-faint">이메일로 사용자를 특정해 데이터 이동권(추출)·삭제권(파기)을 처리합니다.</div>
        <div className="flex items-center gap-2">
          <input value={gdprEmail} onChange={(e) => setGdprEmail(e.target.value)} placeholder="user@example.com" className="flex-1 rounded-lg border border-app-border px-3 py-2 text-[12.5px] focus:border-app-accent focus:outline-none" />
          <button onClick={() => gdprEmail && showToast(`${gdprEmail} 데이터 추출을 시작했어요`)} className="rounded-lg border border-app-border bg-white px-3.5 py-2 text-[12px] font-semibold">데이터 추출</button>
          <button onClick={() => gdprEmail && showToast(`${gdprEmail} 데이터 파기를 예약했어요`)} className="rounded-lg border border-[#F5C6C8] bg-[#FFF0F0] px-3.5 py-2 text-[12px] font-semibold text-app-danger">데이터 파기</button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className={thCls}><span className="flex-[1.4]">데이터셋</span><span className="flex-1">형식</span><span className="flex-1">행</span><span className="flex-1">생성</span><span className="w-24 flex-none">조치</span></div>
        {jobs.map((j) => (
          <div key={j.id} className={rowCls}>
            <span className="flex-[1.4] text-[12.5px] font-semibold">{j.ds}</span>
            <span className="flex-1 text-[12px]">{j.fmt}</span>
            <span className="flex-1 text-[12px] text-app-muted">{j.rows}</span>
            <span className="flex-1 text-[11.5px] text-app-faint">{j.when}</span>
            <span className="w-24 flex-none">
              {j.ready ? <button onClick={() => showToast("파일을 다운로드합니다")} className="rounded-[7px] border border-app-border bg-white px-2.5 py-[5px] text-[11px] font-semibold">⬇ 다운로드</button> : <span className="text-[11px] text-app-faint">생성 중…</span>}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

// ===== A/B 테스트 (abtest) =====
function AbtestPage() {
  const [exps, setExps] = useState([
    { id: 1, name: "온보딩 프롬프트 문구", metric: "첫 덱 생성률", days: 6, running: true, lift: "+12%", vars: [{ n: "A (기존)", share: 50, conv: 34, win: false }, { n: "B (신규)", share: 50, conv: 46, win: true }] },
    { id: 2, name: "요금제 CTA 색상", metric: "업그레이드 클릭률", days: 3, running: true, lift: "+4%", vars: [{ n: "A 검정", share: 50, conv: 8, win: false }, { n: "B 바이올렛", share: 50, conv: 12, win: true }] },
    { id: 3, name: "빈 상태 일러스트", metric: "이탈률", days: 12, running: false, lift: "—", vars: [{ n: "A", share: 50, conv: 21, win: false }, { n: "B", share: 50, conv: 20, win: false }] },
  ]);
  return (
    <>
      <div className="mb-3.5 flex justify-end">
        <button onClick={() => { setExps((p) => [{ id: Date.now(), name: "새 실험", metric: "지표 미정", days: 0, running: true, lift: "—", vars: [{ n: "A", share: 50, conv: 0, win: false }, { n: "B", share: 50, conv: 0, win: false }] }, ...p]); showToast("새 실험을 생성했어요"); }} className="rounded-lg bg-app-accent px-4 py-2 text-[12.5px] font-semibold text-white">+ 새 실험</button>
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        {exps.map((ex) => {
          const maxConv = Math.max(1, ...ex.vars.map((v) => v.conv));
          return (
            <Card key={ex.id} className="px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex-1 text-[13.5px] font-bold">{ex.name}</span>
                <StatusPill ok={ex.running} label={ex.running ? `진행 ${ex.days}일` : "종료"} />
              </div>
              <div className="mb-3 text-[11.5px] text-app-faint">목표: {ex.metric} · 우세 {ex.lift}</div>
              <div className="space-y-2">
                {ex.vars.map((v) => (
                  <div key={v.n} className="flex items-center gap-2">
                    <span className="w-24 flex-none text-[11.5px] font-medium">{v.n}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded bg-[#F0F0EE]">
                      <div className="h-full rounded" style={{ width: `${(v.conv / maxConv) * 100}%`, background: v.win ? "#1E7F4F" : "#8B6BFF", opacity: 0.85 }} />
                    </div>
                    <span className="w-16 flex-none text-right text-[11px] font-bold">{v.conv}%{v.win ? " 🏆" : ""}</span>
                  </div>
                ))}
              </div>
              {ex.running && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => { setExps((p) => p.map((x) => x.id === ex.id ? { ...x, running: false } : x)); showToast("실험을 중지했어요"); }} className="flex-1 rounded-lg border border-app-border bg-white py-1.5 text-[11.5px] font-semibold">중지</button>
                  <button onClick={() => { setExps((p) => p.map((x) => x.id === ex.id ? { ...x, running: false } : x)); showToast("승자 변형을 전체 적용했어요"); }} className="flex-1 rounded-lg bg-app-text py-1.5 text-[11.5px] font-semibold text-white">승자 전체 적용</button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ===== 이메일 발송 로그 (emails) =====
function EmailsPage() {
  const rows = [
    { id: 1, time: "10:24", to: "kim@corp.com", tpl: "공유 초대", subject: "덱에 초대되었습니다", st: "열람" },
    { id: 2, time: "10:11", to: "guest_9f2@x.io", tpl: "결제 영수증", subject: "DeckGen Plus 결제 완료", st: "전송됨" },
    { id: 3, time: "09:52", to: "lee@corp.com", tpl: "이메일 인증", subject: "인증 코드: 402913", st: "열람" },
    { id: 4, time: "09:30", to: "bad@spam.io", tpl: "재동의 요청", subject: "약관 변경 안내", st: "반송" },
    { id: 5, time: "08:47", to: "park@corp.com", tpl: "비밀번호 재설정", subject: "비밀번호 재설정 링크", st: "전송됨" },
  ];
  const pill = (st: string) => st === "열람" ? "border-[#C9EBD9] bg-[#EAF7F0] text-[#1E7F4F]" : st === "반송" ? "border-[#F5C6C8] bg-[#FFF0F0] text-app-danger" : "border-app-border bg-app-bg text-app-muted";
  return (
    <>
      <KpiGrid items={[
        { name: "오늘 발송", value: "1,284", sub: "전 템플릿 합산" },
        { name: "전송률", value: "98.6%", sub: "반송 제외" },
        { name: "오픈율", value: "54.2%", sub: "인증·초대 포함" },
        { name: "억제 목록", value: "37", sub: "반송·수신거부" },
      ]} />
      <Card className="overflow-hidden">
        <div className={thCls}><span className="w-14 flex-none">시각</span><span className="flex-[1.4]">수신자</span><span className="flex-1">템플릿</span><span className="flex-[1.6]">제목</span><span className="w-16 flex-none">상태</span><span className="w-20 flex-none">조치</span></div>
        {rows.map((r) => (
          <div key={r.id} className={rowCls}>
            <span className="w-14 flex-none text-[11.5px] text-app-muted">{r.time}</span>
            <span className="flex-[1.4] truncate text-[12px]">{r.to}</span>
            <span className="flex-1 text-[12px] text-app-muted">{r.tpl}</span>
            <span className="flex-[1.6] truncate text-[12px]">{r.subject}</span>
            <span className="w-16 flex-none"><span className={`rounded-full border px-2 py-[2px] text-[10px] font-semibold ${pill(r.st)}`}>{r.st}</span></span>
            <span className="w-20 flex-none"><button onClick={() => showToast(`${r.to}에게 재발송했어요`)} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold">재발송</button></span>
          </div>
        ))}
      </Card>
    </>
  );
}

// ===== 기능 플래그 (flags) =====
function FlagsPage() {
  const [rows, setRows] = useState([
    { id: "fig_export", name: "Figma 내보내기", desc: "SVG zip 핸드오프", rollout: 100, target: "전체", on: true },
    { id: "auto_agent", name: "Auto Agent", desc: "멀티스텝 자동 편집", rollout: 20, target: "내부 스탭", on: false },
    { id: "realtime_collab", name: "실시간 협업", desc: "라이브 커서·프레즌스", rollout: 100, target: "전체", on: true },
    { id: "web_research", name: "웹 리서치", desc: "생성 시 웹 검색 보강", rollout: 30, target: "Plus 이상", on: false },
    { id: "new_editor", name: "신규 에디터", desc: "차기 캔버스 엔진", rollout: 10, target: "내부 스탭", on: false },
    { id: "video_embed", name: "동영상 임베드", desc: "YouTube 슬라이드", rollout: 50, target: "Plus 이상", on: true },
  ]);
  const upd = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r));
  const onCnt = rows.filter((r) => r.on).length;
  return (
    <>
      <div className="mb-3.5 text-[12.5px] text-app-muted">활성 {onCnt} / {rows.length}개</div>
      <Card className="overflow-hidden">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-[#F0F0EE] px-[18px] py-3 last:border-b-0">
            <div className="flex-[1.6]">
              <div className="text-[12.5px] font-semibold">{r.name}</div>
              <div className="font-mono text-[10.5px] text-app-faint">{r.id} · {r.desc}</div>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <input type="range" min={0} max={100} step={10} value={r.rollout} onChange={(e) => upd(r.id, { rollout: Number(e.target.value) })} className="flex-1 accent-app-accent" />
              <span className="w-10 text-right text-[11px] font-bold tabular-nums">{r.rollout}%</span>
            </div>
            <select value={r.target} onChange={(e) => upd(r.id, { target: e.target.value })} className="w-24 flex-none rounded-md border border-app-border px-1.5 py-1 text-[11px]">
              <option>전체</option><option>Plus 이상</option><option>내부 스탭</option>
            </select>
            <Toggle on={r.on} onClick={() => upd(r.id, { on: !r.on })} />
          </div>
        ))}
      </Card>
    </>
  );
}

// ===== 약관 · 정책 (policies) =====
function PoliciesPage() {
  const [rows, setRows] = useState([
    { id: 1, name: "이용약관", version: "v3.2", reconsent: false, draft: false },
    { id: 2, name: "개인정보 처리방침", version: "v4.0", reconsent: true, draft: false },
    { id: 3, name: "환불 정책", version: "v1.1", reconsent: false, draft: false },
    { id: 4, name: "마케팅 수신 동의", version: "v2.0 (초안)", reconsent: false, draft: true },
  ]);
  const pub = rows.filter((r) => !r.draft).length;
  return (
    <>
      <div className="mb-3.5 text-[12.5px] text-app-muted">게시됨 {pub} / {rows.length}개</div>
      <Card className="overflow-hidden">
        <div className={thCls}><span className="flex-[1.8]">문서</span><span className="flex-1">버전</span><span className="flex-1">상태</span><span className="w-[220px] flex-none">조치</span></div>
        {rows.map((r) => (
          <div key={r.id} className={rowCls}>
            <div className="flex-[1.8]">
              <span className="text-[12.5px] font-semibold">{r.name}</span>
              {r.reconsent && <span className="ml-2 rounded-full border border-[#F5C6C8] bg-[#FFF0F0] px-1.5 py-[1px] text-[10px] font-semibold text-app-danger">재동의 필요</span>}
            </div>
            <span className="flex-1 font-mono text-[11.5px]">{r.version}</span>
            <span className="flex-1"><StatusPill ok={!r.draft} label={r.draft ? "초안" : "게시됨"} /></span>
            <span className="flex w-[220px] flex-none gap-1.5">
              <button onClick={() => showToast(`${r.name} 새 버전을 만들었어요`)} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold">새 버전</button>
              {r.draft
                ? <button onClick={() => { setRows((p) => p.map((x) => x.id === r.id ? { ...x, draft: false } : x)); showToast("게시했어요"); }} className="rounded-[7px] bg-app-text px-2 py-[5px] text-[11px] font-semibold text-white">게시</button>
                : <button onClick={() => { setRows((p) => p.map((x) => x.id === r.id ? { ...x, reconsent: true } : x)); showToast("재동의를 요청했어요"); }} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold">재동의 요청</button>}
              <button onClick={() => showToast("버전 이력을 표시합니다")} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold">이력</button>
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

// ===== 환불 · 청구 (refunds) =====
function RefundsPage() {
  const [rows, setRows] = useState([
    { id: "INV-2041", user: "kim@corp.com", plan: "Plus", amt: "₩19,000", method: "카드", st: "결제 완료" },
    { id: "INV-2040", user: "guest_9f2", plan: "Pro", amt: "₩49,000", method: "카드", st: "환불됨" },
    { id: "INV-2039", user: "lee@corp.com", plan: "Plus", amt: "₩19,000", method: "카드", st: "실패" },
    { id: "INV-2038", user: "park@corp.com", plan: "Team", amt: "₩99,000", method: "세금계산서", st: "결제 완료" },
  ]);
  const pill = (st: string) => st === "결제 완료" ? "border-[#C9EBD9] bg-[#EAF7F0] text-[#1E7F4F]" : st === "실패" ? "border-[#F5C6C8] bg-[#FFF0F0] text-app-danger" : "border-app-border bg-app-bg text-app-muted";
  return (
    <>
      <KpiGrid items={[
        { name: "이번 달 매출", value: "₩4.2M", sub: "구독 + 크레딧" },
        { name: "활성 구독", value: "312", sub: "Plus 248 · Pro 64" },
        { name: "환불 (이번 달)", value: "₩186K", sub: "8건" },
        { name: "결제 실패", value: "5", sub: "재청구 대기" },
      ]} />
      <Card className="overflow-hidden">
        <div className={thCls}><span className="flex-1">인보이스</span><span className="flex-[1.4]">사용자</span><span className="w-16 flex-none">플랜</span><span className="w-24 flex-none text-right">금액</span><span className="w-24 flex-none">결제수단</span><span className="w-20 flex-none">상태</span><span className="w-[150px] flex-none">조치</span></div>
        {rows.map((r) => (
          <div key={r.id} className={rowCls}>
            <span className="flex-1 font-mono text-[11.5px]">{r.id}</span>
            <span className="flex-[1.4] truncate text-[12px]">{r.user}</span>
            <span className="w-16 flex-none text-[12px]">{r.plan}</span>
            <span className="w-24 flex-none text-right text-[12px] font-semibold tabular-nums">{r.amt}</span>
            <span className="w-24 flex-none text-[11.5px] text-app-muted">{r.method}</span>
            <span className="w-20 flex-none"><span className={`rounded-full border px-2 py-[2px] text-[10px] font-semibold ${pill(r.st)}`}>{r.st}</span></span>
            <span className="flex w-[150px] flex-none gap-1.5">
              {r.st === "결제 완료" && <button onClick={() => { setRows((p) => p.map((x) => x.id === r.id ? { ...x, st: "환불됨" } : x)); showToast(`${r.id} 환불 처리`); }} className="rounded-[7px] border border-[#F5C6C8] bg-[#FFF0F0] px-2 py-[5px] text-[11px] font-semibold text-app-danger">환불</button>}
              {r.st === "실패" && <button onClick={() => { setRows((p) => p.map((x) => x.id === r.id ? { ...x, st: "결제 완료" } : x)); showToast(`${r.id} 재청구 성공`); }} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold">재청구</button>}
              <button onClick={() => showToast("인보이스를 표시합니다")} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold">인보이스</button>
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

// ===== 역할 · 권한 (roles) =====
function RolesPage() {
  const [staff, setStaff] = useState([
    { id: 1, name: "관리자 (나)", email: "admin@deckgen.io", role: "관리자", owner: true },
    { id: 2, name: "이서포트", email: "support@deckgen.io", role: "서포트", owner: false },
    { id: 3, name: "박애널", email: "analyst@deckgen.io", role: "분석가", owner: false },
  ]);
  const [email, setEmail] = useState("");
  const perms = [
    { name: "대시보드", admin: true, support: true, analyst: true },
    { name: "사용자 관리", admin: true, support: true, analyst: false },
    { name: "결제·환불", admin: true, support: false, analyst: false },
    { name: "서비스 설정", admin: true, support: false, analyst: false },
    { name: "감사 로그", admin: true, support: false, analyst: true },
  ];
  const cell = (ok: boolean) => <span className={ok ? "text-[#1E7F4F]" : "text-app-faint"}>{ok ? "✓" : "—"}</span>;
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="overflow-hidden">
        <div className="border-b border-app-border px-[18px] py-2.5 text-[12.5px] font-bold">관리자 멤버 ({staff.length})</div>
        {staff.map((s) => (
          <div key={s.id} className="flex items-center gap-2 border-b border-[#F0F0EE] px-[18px] py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">{s.name}</div>
              <div className="truncate text-[10.5px] text-app-faint">{s.email}</div>
            </div>
            <select value={s.role} disabled={s.owner} onChange={(e) => setStaff((p) => p.map((x) => x.id === s.id ? { ...x, role: e.target.value } : x))} className="rounded-md border border-app-border px-1.5 py-1 text-[11px] disabled:opacity-50">
              <option>관리자</option><option>서포트</option><option>분석가</option>
            </select>
            {!s.owner && <button onClick={() => setStaff((p) => p.filter((x) => x.id !== s.id))} className="rounded-md border border-[#F5C6C8] bg-[#FFF0F0] px-2 py-1 text-[11px] font-semibold text-app-danger">제거</button>}
          </div>
        ))}
        <div className="flex gap-1.5 px-[18px] py-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="멤버 이메일 초대" className="min-w-0 flex-1 rounded-lg border border-app-border px-3 py-2 text-[12px] focus:border-app-accent focus:outline-none" />
          <button onClick={() => { if (email) { setStaff((p) => [...p, { id: Date.now(), name: email.split("@")[0], email, role: "서포트", owner: false }]); setEmail(""); showToast("초대 메일을 보냈어요"); } }} className="flex-none rounded-lg bg-app-text px-3 py-2 text-[12px] font-semibold text-white">초대</button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-app-border px-[18px] py-2.5 text-[12.5px] font-bold">역할별 권한</div>
        <div className="flex border-b border-[#F0F0EE] bg-[#FBFBFA] px-[18px] py-2 text-[11px] font-bold text-app-faint">
          <span className="flex-[1.6]">권한</span><span className="flex-1 text-center">관리자</span><span className="flex-1 text-center">서포트</span><span className="flex-1 text-center">분석가</span>
        </div>
        {perms.map((p) => (
          <div key={p.name} className="flex border-b border-[#F0F0EE] px-[18px] py-2.5 text-[12px] last:border-b-0">
            <span className="flex-[1.6]">{p.name}</span>
            <span className="flex-1 text-center">{cell(p.admin)}</span>
            <span className="flex-1 text-center">{cell(p.support)}</span>
            <span className="flex-1 text-center">{cell(p.analyst)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ===== 콘솔 셸 =====
export function AdminPage() {
  const [authed, setAuthed] = useState(() => !!getAdminToken());
  const [page, setPage] = useState<PageId>("dash");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("dg_admin_sidebar") === "0");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((g) => [g.label, true])),
  );
  const toggleSidebar = () => {
    setCollapsed((v) => {
      localStorage.setItem("dg_admin_sidebar", v ? "1" : "0");
      return !v;
    });
  };

  if (!authed) return <AdminLogin onAuthed={() => setAuthed(true)} />;
  const cur = PAGES.find((p) => p.id === page)!;

  return (
    <div className="flex h-screen overflow-hidden bg-app-bg">
      {/* 사이드바 (접이식 + 그룹 아코디언) */}
      <div
        className="flex flex-none flex-col bg-[#17151F] py-4 transition-all"
        style={{ width: collapsed ? 64 : 216, paddingLeft: 12, paddingRight: 12 }}
      >
        <div className="mb-3 flex items-center gap-[9px] px-1.5">
          <span className="h-[22px] w-[22px] flex-none rounded-md bg-app-accent" />
          {!collapsed && (
            <>
              <span className="text-[14px] font-bold text-white">DeckGen</span>
              <span className="rounded-[5px] bg-[rgba(139,107,255,.15)] px-1.5 py-0.5 text-[10px] font-bold text-[#8B6BFF]">
                ADMIN
              </span>
            </>
          )}
          <button
            onClick={toggleSidebar}
            title={collapsed ? "펼치기" : "접기"}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-[rgba(255,255,255,.6)] hover:bg-[rgba(255,255,255,.08)] ${collapsed ? "" : "ml-auto"}`}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {collapsed
            ? // 레일 모드 — 아이콘만
              PAGES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPage(p.id)}
                  title={p.name}
                  className="mb-0.5 flex w-full items-center justify-center rounded-[9px] py-2.5 text-[15px]"
                  style={{ background: page === p.id ? "rgba(139,107,255,.16)" : "transparent" }}
                >
                  {p.icon}
                </button>
              ))
            : // 그룹 아코디언
              NAV_GROUPS.map((g) => {
                const items = g.ids.map((id) => PAGES.find((p) => p.id === id)!).filter(Boolean);
                const open = openGroups[g.label];
                return (
                  <div key={g.label} className="mb-1">
                    <button
                      onClick={() => setOpenGroups((s) => ({ ...s, [g.label]: !s[g.label] }))}
                      className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] font-bold tracking-wide text-[rgba(255,255,255,.4)] uppercase"
                    >
                      <span className={`text-[9px] transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                      {g.label}
                    </button>
                    {open &&
                      items.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setPage(p.id)}
                          className="mb-0.5 flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left"
                          style={{ background: page === p.id ? "rgba(139,107,255,.16)" : "transparent" }}
                        >
                          <span className="flex-none text-[13px]">{p.icon}</span>
                          <span
                            className="flex-1 text-[12.5px]"
                            style={{
                              color: page === p.id ? "#fff" : "rgba(255,255,255,.6)",
                              fontWeight: page === p.id ? 700 : 500,
                            }}
                          >
                            {p.name}
                          </span>
                        </button>
                      ))}
                  </div>
                );
              })}
        </div>

        <div className="mt-2 flex items-center gap-[9px] border-t border-[rgba(255,255,255,.1)] pt-3">
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-app-accent text-[11px] font-bold text-white">
            관
          </span>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-white">관리자</div>
              </div>
              <button
                onClick={() => {
                  setAdminToken("");
                  setAuthed(false);
                }}
                className="rounded-[7px] border border-[rgba(255,255,255,.2)] px-2 py-1 text-[10.5px] font-semibold text-[rgba(255,255,255,.65)]"
              >
                로그아웃
              </button>
            </>
          )}
        </div>
      </div>

      {/* 메인 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-app-border bg-white px-6 py-[13px]">
          <span className="text-[16px] font-bold">{cur.name}</span>
          <span className="text-[12px] text-app-faint">{cur.desc}</span>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C9EBD9] bg-[#EAF7F0] px-2.5 py-1 text-[11.5px] font-semibold text-[#1E7F4F]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1E7F4F]" />
            API 연결됨
          </span>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {page === "dash" && <DashPage />}
          {page === "users" && <UsersPage />}
          {page === "jobs" && <JobsPage />}
          {page === "errors" && <ErrorsPage />}
          {page === "audit" && <AuditPage />}
          {page === "banners" && <BannersPage />}
          {page === "templates" && <TemplatesPage />}
          {page === "decks" && <DecksPage />}
          {page === "collab" && <CollabPage />}
          {page === "models" && <ModelsPage />}
          {page === "apikeys" && <ApiKeysPage />}
          {page === "credits" && <CreditsPage />}
          {page === "plans" && <PlansPage />}
          {page === "settings" && <SettingsPage />}
          {page === "health" && <HealthPage />}
          {page === "exports" && <ExportsPage />}
          {page === "abtest" && <AbtestPage />}
          {page === "emails" && <EmailsPage />}
          {page === "flags" && <FlagsPage />}
          {page === "policies" && <PoliciesPage />}
          {page === "refunds" && <RefundsPage />}
          {page === "roles" && <RolesPage />}
        </div>
      </div>
    </div>
  );
}
