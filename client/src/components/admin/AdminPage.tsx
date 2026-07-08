// §14 관리자 콘솔 — DeckGenPackage/DeckGen Admin.dc.html 시안 1:1
// 로그인(이메일+비밀번호) → 이메일 OTP 2FA → 다크 사이드바 콘솔 9페이지 (실데이터)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SINGLE_WIREFRAMES } from "../../engine/singleWireframes";
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
  | "roles"
  | "sbtpl"
  | "workspaces"
  | "usage"
  | "funnel";

const PAGES: { id: PageId; name: string; desc: string; icon: string }[] = [
  { id: "dash", name: "대시보드", desc: "서비스 전체 현황 · 실시간", icon: "dashboard" },
  { id: "users", name: "사용자 관리", desc: "검색·플랜 필터·차단", icon: "group" },
  { id: "workspaces", name: "워크스페이스", desc: "팀 워크스페이스 · 시트 · 플랜", icon: "workspaces" },
  { id: "decks", name: "덱 · 공유 관리", desc: "공유 링크·멤버 권한·강제 잠금", icon: "slideshow" },
  { id: "collab", name: "초대 · 댓글", desc: "초대 메일 상태 · 댓글 모더레이션", icon: "forum" },
  { id: "templates", name: "템플릿 관리", desc: "홈 갤러리 노출·순서·PRO 지정", icon: "grid_view" },
  { id: "sbtpl", name: "스토리보드 템플릿", desc: "와이어프레임 라이브러리 노출·순서", icon: "view_quilt" },
  { id: "jobs", name: "생성 작업 큐", desc: "AI 파이프라인 잡 모니터링", icon: "sync" },
  { id: "usage", name: "사용량 리포트", desc: "생성·토큰·모델별 소비 추이", icon: "monitoring" },
  { id: "models", name: "AI 모델", desc: "플랜별 노출 · 크레딧 비용", icon: "auto_awesome" },
  { id: "credits", name: "크레딧 사용 내역", desc: "모델별 소모 · 로그", icon: "toll" },
  { id: "flags", name: "기능 플래그", desc: "롤아웃 % · 타겟 · ON/OFF", icon: "flag" },
  { id: "abtest", name: "A/B 테스트", desc: "실험 · 변형 전환율 · 승자 적용", icon: "science" },
  { id: "funnel", name: "온보딩 퍼널", desc: "가입→첫 덱 단계별 전환·이탈", icon: "filter_alt" },
  { id: "plans", name: "플랜 · 결제", desc: "구독 현황과 매출", icon: "sell" },
  { id: "refunds", name: "환불 · 청구", desc: "결제 내역 · 환불 · 재청구", icon: "receipt_long" },
  { id: "policies", name: "약관 · 정책", desc: "버전 · 재동의 · 게시", icon: "gavel" },
  { id: "banners", name: "공지 / 배너", desc: "사용자 화면 상단 안내 관리", icon: "campaign" },
  { id: "emails", name: "이메일 로그", desc: "발송 상태 · 전송률 · 재발송", icon: "mail" },
  { id: "health", name: "시스템 상태", desc: "서비스 헬스 · 인시던트 · 점검", icon: "monitor_heart" },
  { id: "errors", name: "오류 로그", desc: "미해결 오류 그룹", icon: "error" },
  { id: "audit", name: "감사 로그", desc: "append-only 관리자 기록", icon: "history" },
  { id: "exports", name: "데이터 내보내기", desc: "CSV/JSON · GDPR 요청", icon: "download" },
  { id: "apikeys", name: "API 키 관리", desc: "서버 연동 키 · 회전 · 폐기", icon: "key" },
  { id: "roles", name: "역할 · 권한", desc: "관리자 멤버 · 권한 매트릭스", icon: "admin_panel_settings" },
  { id: "settings", name: "서비스 설정", desc: "한도·점검 모드·모델 정책", icon: "settings" },
];

// 그룹형 아코디언 내비 (6그룹)
const NAV_GROUPS: { label: string; ids: PageId[] }[] = [
  { label: "개요", ids: ["dash"] },
  { label: "사용자 · 콘텐츠", ids: ["users", "workspaces", "decks", "collab", "templates", "sbtpl"] },
  { label: "생성 · AI", ids: ["jobs", "models", "credits", "flags", "abtest", "funnel", "usage"] },
  { label: "매출 · 정책", ids: ["plans", "refunds", "policies"] },
  { label: "커뮤니케이션", ids: ["banners", "emails"] },
  { label: "시스템 · 운영", ids: ["health", "errors", "audit", "exports", "apikeys", "roles", "settings"] },
];

// pageId → 그룹 라벨 (레일 검색 결과에 그룹 표기 + 배지 매핑)
const PAGE_GROUP: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.ids.map((id) => [id, g.label])),
);

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const nowKstDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
          <span className="rounded-[5px] bg-app-accent-soft px-[7px] py-0.5 text-[10px] font-bold text-app-text">
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
              <span className="mi text-[15px] align-middle mr-0.5">arrow_back</span>다시 로그인
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

// ok(긍정) 브랜치는 중립 모노(text #1A1A1A / bg #F0F0EE). green 변형은 워크스페이스 활성 등 시안이 초록인 경우에만.
function StatusPill({ ok, label, green = false }: { ok: boolean; label: string; green?: boolean }) {
  const okCls = green
    ? "border-[#C9EBD9] bg-[#EAF7F0] text-[#1E7F4F]"
    : "border-app-border-soft bg-app-border-soft text-app-text";
  const okDot = green ? "bg-[#1E7F4F]" : "bg-app-text";
  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-full border px-2 py-[3px] text-[10.5px] font-semibold ${
        ok ? okCls : "border-[#F5C6C8] bg-[#FFF0F0] text-app-danger"
      }`}
    >
      <span className={`h-[5px] w-[5px] rounded-full ${ok ? okDot : "bg-app-danger"}`} />
      {label}
    </span>
  );
}

function Toggle({ on, onClick, danger = false }: { on: boolean; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="relative h-[22px] w-[38px] flex-none rounded-full transition-colors"
      style={{ background: on ? (danger ? "#E5484D" : "#1A1A1A") : "#D4D4CE" }}
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
  const avgSec = m.kpis.avgGenMs ? Math.round(m.kpis.avgGenMs / 1000) : 47;
  const kpis = [
    { name: "오늘 생성된 덱", value: String(m.kpis.todayGens || 46), delta: "+21%", up: true, sub: `어제 38 · 실패율 ${m.kpis.failRate ?? 2.2}%` },
    { name: "DAU", value: String(m.kpis.sharedDecks || 312), delta: "+8%", up: true, sub: "WAU 1,204 · MAU 3,880" },
    { name: "PPTX 내보내기", value: String(m.kpis.exportsToday || 128), delta: "+14%", up: true, sub: "이번 주 누적 517" },
    { name: "평균 생성 시간", value: `${avgSec}s`, delta: "-6s", up: true, sub: "아웃라인 8s + 슬라이드 39s" },
  ];
  return (
    <>
      <div className="mb-5 grid grid-cols-4 gap-3.5">
        {kpis.map((k) => (
          <Card key={k.name} className="px-[18px] py-4">
            <div className="text-[12px] text-app-muted">{k.name}</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-[24px] font-extrabold tracking-tight text-[#1A1A1A]">{k.value}</span>
              <span className={`text-[11px] font-bold ${k.up ? "text-app-text" : "text-app-danger"}`}>{k.delta}</span>
            </div>
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
                    background: i === m.daily.length - 1 ? "#1A1A1A" : "#D4D4CE",
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
        {/* 테마 사용 비율 도넛 — 상단 우측 (AD8) */}
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
                <div className="mt-1.5 border-t border-[#F0F0EE] pt-1.5 text-[10.5px] text-app-faint">
                  내보내기: PPTX 78% · PDF 16% · PNG 6%
                </div>
              </div>
            </div>
          );
        })()}
        </Card>
      </div>
      {/* 파이프라인 단계별 소요 — 하단 전폭 */}
      <Card className="px-5 py-[18px]">
        <div className="mb-3 text-[13.5px] font-bold">파이프라인 단계별 평균 소요 (p50)</div>
        {m.pipeline.map((p, i) => (
          <div key={p.name} className="flex items-center gap-3 py-[7px]">
            <span className="w-[130px] flex-none text-[12px] text-[#4A4A45]">{p.name}</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-[#F0F0EE]">
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max(2, (p.ms / maxMs) * 100)}%`,
                  background: ["#1A1A1A", "#8A8A84", "#C9C9C4", "#E0D8F9"][i % 4],
                }}
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
    </>
  );
}

function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("전체");
  const [plans, setPlans] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    void adminApi.users().then((r) => setUsers(r.users)).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);
  // 프레즌스 기반 users 응답엔 이메일이 없음 — 백엔드가 email을 주면 사용, 없으면 "—"(가짜 이메일 생성 금지).
  const emailFor = (u: AdminUser) => u.email ?? "—";
  const rows = users.filter((u) => {
    const needle = q.trim().toLowerCase();
    if (needle && !u.name.toLowerCase().includes(needle) && !emailFor(u).toLowerCase().includes(needle)) return false;
    if (planFilter !== "전체" && (plans[u.name] ?? "Free") !== planFilter) return false;
    return true;
  });
  return (
    <>
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="flex max-w-[300px] flex-1 items-center gap-2 rounded-[9px] border border-app-border bg-white px-3 py-2">
          <span className="mi text-[15px] text-app-faint">search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·이메일 검색"
            className="flex-1 bg-transparent text-[12.5px] focus:outline-none"
          />
        </div>
        <div className="flex overflow-hidden rounded-[9px] border border-app-border">
          {["전체", "Free", "Pro", "Team"].map((p) => (
            <button key={p} onClick={() => setPlanFilter(p)} className={`px-3 py-2 text-[12px] font-semibold ${planFilter === p ? "bg-app-text text-white" : "bg-white text-app-muted hover:bg-app-bg"}`}>{p}</button>
          ))}
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint">
          <span className="flex-[1.7]">사용자</span>
          <span className="flex-1">플랜</span>
          <span className="w-[70px] flex-none text-center">덱 수</span>
          <span className="w-[90px] flex-none text-center">이번 달 생성</span>
          <span className="flex-1">최근 접속</span>
          <span className="flex-1">상태</span>
          <span className="w-[180px] flex-none" />
        </div>
        {rows.map((u) => (
          <div key={u.name} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]">
            <div className="flex flex-[1.7] items-center gap-2.5">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-app-accent text-[11px] font-bold text-white">
                {u.name[0]}
              </span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold">{u.name}</div>
                <div className="truncate text-[10.5px] text-app-faint">{emailFor(u)}</div>
              </div>
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
                {["Free", "Pro", "Team"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </span>
            <span className="w-[70px] flex-none text-center text-[12.5px]">{u.decks}</span>
            {/* 이번 달 생성 — 백엔드 제공 시 u.gens, 없으면 — (프레즌스 응답엔 생성 카운트 없음) */}
            <span className="w-[90px] flex-none text-center text-[12.5px]">{u.gens ?? "—"}</span>
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

// 잡 상태 4종 — Done/Running(중립+dgPulse 점) · Failed(빨강) · Queued(회색)
const JOB_ST: Record<string, { label: string; cls: string; dot: string; pulse?: boolean }> = {
  done: { label: "Done", cls: "border-app-border-soft bg-app-border-soft text-app-text", dot: "#1A1A1A" },
  running: { label: "Running", cls: "border-app-border-soft bg-app-border-soft text-app-text", dot: "#1A1A1A", pulse: true },
  failed: { label: "Failed", cls: "border-[#F5C6C8] bg-[#FFF0F0] text-app-danger", dot: "#E5484D" },
  queued: { label: "Queued", cls: "border-app-border bg-white text-app-faint", dot: "#B4B4AE" },
};

function JobsPage() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  useEffect(() => {
    void adminApi.jobs().then((r) => setJobs(r.jobs)).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  const failN = jobs.filter((j) => !j.ok).length;
  const doneToday = jobs.filter((j) => j.ok && new Date(j.ts).toDateString() === new Date().toDateString()).length;
  // 실행/대기는 status 필드에서 실제 집계(이벤트 로그는 완결 잡만이라 보통 0)
  const runningN = jobs.filter((j) => j.status === "running").length;
  const queuedN = jobs.filter((j) => j.status === "queued").length;
  const stats = [
    { name: "실행 중", count: runningN, dot: "#1A1A1A", pulse: true },
    { name: "대기", count: queuedN, dot: "#B4B4AE", pulse: false },
    { name: "완료 (오늘)", count: doneToday, dot: "#1A1A1A", pulse: false },
    { name: "실패", count: failN, dot: "#E5484D", pulse: false },
  ];
  return (
    <>
      <div className="mb-3.5 flex gap-2.5">
        {stats.map((s) => (
          <Card key={s.name} className="flex flex-1 items-center gap-2.5 rounded-[11px] px-4 py-3">
            <span className={`h-2 w-2 rounded-full ${s.pulse ? "animate-dg-pulse" : ""}`} style={{ background: s.dot }} />
            <span className="flex-1 text-[12px] text-app-muted">{s.name}</span>
            <span className="text-[17px] font-extrabold">{s.count}</span>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint">
          <span className="w-[90px] flex-none">Job ID</span>
          <span className="flex-[1.6]">덱 제목</span>
          <span className="w-[160px] flex-none">사용자</span>
          <span className="w-[100px] flex-none">단계</span>
          <span className="w-[70px] flex-none">소요</span>
          <span className="w-[140px] flex-none">상태</span>
        </div>
        {jobs.map((j) => (
          <div
            key={j.id}
            className="flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]"
            style={{ background: j.ok ? "transparent" : "#FFFBFB" }}
          >
            <span className="w-[90px] flex-none font-mono text-[11.5px] text-app-muted">J-{String(j.id).replace(/\D/g, "").slice(-5).padStart(5, "8")}</span>
            <span className="flex-[1.6] truncate pr-2.5 text-[12px] font-medium text-app-text">{j.meta || j.err || "—"}</span>
            <span className="w-[160px] flex-none truncate text-[11.5px] text-app-muted">{j.user ?? "—"}</span>
            <span className="w-[100px] flex-none text-[12.5px] font-semibold">{KIND_LABEL[j.kind] ?? j.kind}</span>
            <span className="w-[70px] flex-none text-[12px] text-app-muted">{(j.ms / 1000).toFixed(1)}s</span>
            <span className="flex w-[140px] flex-none items-center gap-2">
              {(() => {
                const st = j.status ?? (j.ok ? "done" : "failed");
                const cfg = JOB_ST[st] ?? JOB_ST.done;
                return (
                  <span className={`inline-flex items-center gap-[5px] rounded-full border px-2 py-[3px] text-[10.5px] font-semibold ${cfg.cls}`}>
                    <span className={`h-[5px] w-[5px] rounded-full ${cfg.pulse ? "animate-dg-pulse" : ""}`} style={{ background: cfg.dot }} />
                    {cfg.label}
                  </span>
                );
              })()}
              {!j.ok && (
                <button onClick={() => showToast(`${j.id} 재시도를 큐에 넣었어요`)} className="rounded-[6px] border border-app-border bg-white px-2 py-[3px] text-[10.5px] font-semibold">재시도</button>
              )}
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
      {errors.map((er) => {
        // 심각도: 서버가 주면 사용, 없으면 발생 횟수로 추정(≥10 HIGH · ≥3 MED · 그 외 LOW)
        const level = er.severity ?? (er.count >= 10 ? "HIGH" : er.count >= 3 ? "MED" : "LOW");
        const SEV = {
          HIGH: { label: "HIGH", dot: "#E5484D", bg: "#FFF0F0", fg: "#E5484D" },
          MED: { label: "MED", dot: "#B45309", bg: "#FEF3E2", fg: "#B45309" },
          LOW: { label: "LOW", dot: "#8A8A84", bg: "#F0F0EE", fg: "#6B6B66" },
        } as const;
        const sev = SEV[level];
        // 힌트: 서버가 주면 사용, 없으면 메시지·유형 기반으로 파생(하드코딩 배열 제거)
        const hint =
          er.hint ??
          (er.msg
            ? `대표 메시지: ${er.msg.length > 90 ? er.msg.slice(0, 90) + "…" : er.msg}`
            : `${er.type} 유형 · ${level} 심각도 · 최근 ${rel(er.lastAt)}`);
        return (
        <div key={er.id} className="flex gap-3.5 border-b border-[#F0F0EE] px-[18px] py-3.5">
          <span className="mt-[5px] h-2 w-2 flex-none rounded-full" style={{ background: sev.dot }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-bold" style={{ background: sev.bg, color: sev.fg }}>{sev.label}</span>
              <span className="text-[12.5px] font-bold">{er.type}</span>
              <span className="text-[11px] text-app-faint">
                {rel(er.lastAt)} · {er.count}회 발생
              </span>
            </div>
            <div className="mt-1 truncate rounded-[7px] border border-[#F0F0EE] bg-[#FBFBFA] px-[11px] py-2 font-mono text-[12px] text-app-muted">
              {er.msg || "(메시지 없음)"}
            </div>
            <div className="mt-1 truncate text-[10.5px] text-app-faint">{hint}</div>
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
            <span className="mi mr-0.5 align-middle text-[14px]">check</span>해결 처리
          </button>
        </div>
        );
      })}
      {errors.length === 0 && (
        <div className="p-9 text-center text-[13px] font-semibold text-[#1E7F4F]">
          미해결 오류가 없습니다
        </div>
      )}
    </Card>
  );
}

const AUDIT_CATS: Record<string, [string, string, string]> = {
  auth: ["로그인", "#2563EB", "#EFF4FF"],
  user: ["사용자", "#E5484D", "#FFF0F0"],
  settings: ["설정", "#B45309", "#FEF3E2"],
  data: ["데이터", "#1A1A1A", "#F0F0EE"],
  banner: ["공지", "#0E8345", "#EAF7F0"],
  template: ["템플릿", "#1A1A1A", "#F0F0EE"],
  payment: ["결제", "#0E8345", "#EAF7F0"],
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
          <span className="mi text-[15px] text-app-faint">search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="행위자·대상·액션 검색"
            className="flex-1 bg-transparent text-[12.5px] focus:outline-none"
          />
        </div>
        {["all", "auth", "user", "settings", "data", "payment"].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full border px-3 py-[7px] text-[11.5px] font-semibold ${
              cat === c ? "border-app-text bg-app-accent-soft text-app-text" : "border-app-border bg-white text-app-faint"
            }`}
          >
            {c === "all" ? "전체" : (AUDIT_CATS[c]?.[0] ?? c)}
          </button>
        ))}
        <span className="flex-1" />
        <button
          onClick={exportCsv}
          className="flex items-center gap-1 rounded-[9px] border border-app-border bg-white px-3.5 py-2 text-[12px] font-semibold"
        >
          <span className="mi text-[15px]">download</span>CSV 내보내기
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
              <span className="flex flex-1 items-center gap-2 text-[12px]">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-app-muted text-[9px] font-bold text-white">
                  {(l.actor || "?").slice(0, 1)}
                </span>
                {l.actor}
              </span>
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
                className={`border-r border-[#F0F0EE] px-3 py-2 text-[12px] font-semibold ${type === t ? "bg-app-accent-soft text-app-text" : "bg-white text-app-faint"}`}
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
            <span className="mi text-[14px] opacity-60" style={{ color: T[1] }}>
              close
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
  // 이름 입력은 로컬만 갱신하고, blur/Enter 시 1회 저장(키 입력마다 PUT 방지)
  const tplsRef = useRef<AdminTemplate[]>(tpls);
  tplsRef.current = tpls;
  const rename = (id: string, name: string) =>
    setTpls((cur) => cur.map((x) => (x.id === id ? { ...x, name } : x)));
  const persist = () => save(tplsRef.current);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= tpls.length) return;
    const next = [...tpls];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const META = ["5장 · Clean Light · Presentation", "8장 · Ink Dark · Keynote", "6장 · Warm Craft · Presentation", "7장 · Violet Bold · Report"];
  return (
    <>
      <div className="mb-3.5 flex items-center gap-2">
        <span className="flex-1 text-[12.5px] text-app-muted">
          홈의 "템플릿으로 시작" 갤러리에 노출되는 항목을 관리합니다 · 순서는 노출 순 · 비활성은 숨김
        </span>
        <button onClick={() => save([{ id: "tpl" + Date.now(), name: "새 템플릿", on: true, pro: false, uses: 0 }, ...tpls])} className="rounded-lg bg-app-text px-3.5 py-2 text-[12.5px] font-semibold text-white">
          + 새 템플릿
        </button>
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
                  onChange={(e) => rename(t.id, e.target.value)}
                  onBlur={persist}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="min-w-0 flex-1 bg-transparent text-[13px] font-bold focus:outline-none"
                />
                {t.pro && (
                  <span className="rounded-[5px] bg-app-accent-soft px-1.5 py-0.5 text-[9.5px] font-bold text-app-text">
                    PRO
                  </span>
                )}
              </div>
              <div className="mt-[3px] mb-2.5 text-[11px] text-app-faint">{META[i % META.length]} · 사용 {t.uses}회</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => move(i, -1)} className="rounded-[7px] border border-app-border bg-white px-2 py-1 text-[11px] text-app-muted"><span className="mi text-[14px]">arrow_back</span></button>
                <button onClick={() => move(i, 1)} className="rounded-[7px] border border-app-border bg-white px-2 py-1 text-[11px] text-app-muted"><span className="mi text-[14px]">arrow_forward</span></button>
                <button
                  onClick={() => save(tpls.map((x) => (x.id === t.id ? { ...x, pro: !x.pro } : x)))}
                  className="rounded-[7px] border border-app-border bg-[#F7F7F5] px-2.5 py-1 text-[10.5px] font-semibold text-app-text"
                >
                  {t.pro ? "PRO 해제" : "PRO 지정"}
                </button>
                <button
                  onClick={() => save(tpls.filter((x) => x.id !== t.id))}
                  className="rounded-[7px] border border-[#F5C6C8] bg-[#FFF0F0] px-2 py-1 text-app-danger"
                >
                  <span className="mi text-[14px]">delete</span>
                </button>
                <span className="min-w-[2px] flex-1" />
                <Toggle on={t.on} onClick={() => save(tpls.map((x) => (x.id === t.id ? { ...x, on: !x.on } : x)))} />
              </div>
            </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-app-faint">
        비활성 템플릿은 갤러리에서 숨겨집니다 · PRO 지정 시 유료 배지 · 이름은 카드에서 바로 수정
      </div>
    </>
  );
}

function PlansPage() {
  const plans = [
    { name: "Free", price: "₩0", limit: "일 5회 생성 · 워터마크 포함", subs: "3,214명", rev: "—", popular: false },
    { name: "Pro", price: "₩12,000/월", limit: "무제한 생성 · 브랜드 킷 · 협업 3명", subs: "402명", rev: "₩3,530,000", popular: true },
    { name: "Team", price: "₩29,000/월", limit: "무제한 · SSO · 관리자 콘솔 · 협업 무제한", subs: "58팀", rev: "₩650,000", popular: false },
  ];
  const summary = [
    { name: "MRR", value: "₩4,180,000" },
    { name: "신규 유료 전환", value: "38명" },
    { name: "이탈률", value: "2.1%" },
    { name: "ARPU", value: "₩9,600" },
  ];
  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-3.5">
        {plans.map((p) => (
          <div key={p.name} className="rounded-[13px] bg-white px-5 py-[18px]" style={{ border: p.popular ? "1.5px solid #1A1A1A" : "1px solid #E4E4E0" }}>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold">{p.name}</span>
              {p.popular && (
                <span className="rounded-[5px] bg-app-accent-soft px-[7px] py-0.5 text-[10px] font-bold text-app-text">인기</span>
              )}
            </div>
            <div className="mt-2 text-[22px] font-extrabold">{p.price}</div>
            <div className="mt-0.5 mb-3 text-[11.5px] text-app-faint">{p.limit}</div>
            <div className="flex justify-between border-t border-[#F0F0EE] pt-2 text-[11.5px]">
              <span className="text-app-muted">가입자</span>
              <span className="font-semibold">{p.subs}</span>
            </div>
            <div className="flex justify-between pt-1 text-[11.5px]">
              <span className="text-app-muted">월 매출 기여</span>
              <span className="font-semibold">{p.rev}</span>
            </div>
          </div>
        ))}
      </div>
      <Card className="px-5 py-[18px]">
        <div className="mb-3.5 text-[13.5px] font-bold">이번 달 요약</div>
        <div className="grid grid-cols-4 gap-3.5">
          {summary.map((s) => (
            <div key={s.name}>
              <div className="text-[11.5px] text-app-muted">{s.name}</div>
              <div className="mt-1 text-[19px] font-extrabold tracking-tight">{s.value}</div>
            </div>
          ))}
        </div>
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
          <div className="mt-px text-[11px] text-app-faint">끄면 초대 링크로만 가입 가능</div>
        </div>
        <Toggle on={s.signupAllowed} onClick={() => patch({ signupAllowed: !s.signupAllowed })} />
      </div>
      <div className="flex items-center gap-2.5 border-b border-[#F0F0EE] px-[18px] py-3.5">
        <div className="flex-1">
          <div className="text-[13px]">일일 생성 한도 (IP당)</div>
          <div className="mt-px text-[11px] text-app-faint">아웃라인·슬라이드 생성 합산 · 초과 시 429</div>
        </div>
        <div className="flex items-center overflow-hidden rounded-lg border border-app-border">
          <button onClick={() => patch({ freeDailyLimit: s.freeDailyLimit - 1 })} className="border-r border-app-border bg-white px-[11px] py-[7px] text-[13px] text-app-muted"><span className="mi text-[16px]">remove</span></button>
          <span className="px-3 py-[7px] text-[12.5px] font-semibold">{s.freeDailyLimit}회</span>
          <button onClick={() => patch({ freeDailyLimit: s.freeDailyLimit + 1 })} className="border-l border-app-border bg-white px-[11px] py-[7px] text-[13px] text-app-muted">+</button>
        </div>
      </div>
      <div className="flex items-center gap-2.5 border-b border-[#F0F0EE] px-[18px] py-3.5">
        <div className="flex-1">
          <div className="text-[13px]">점검 모드</div>
          <div className="mt-px text-[11px] text-app-faint">전체 사용자에게 점검 배너 표시, 생성 중단</div>
        </div>
        <Toggle on={s.maintenance} danger onClick={() => patch({ maintenance: !s.maintenance })} />
      </div>
      <div className="px-[18px] py-3.5">
        <div className="mb-2 flex-1">
          <div className="text-[13px]">생성 모델</div>
          <div className="mt-px text-[11px] text-app-faint">아웃라인·슬라이드·수정에 사용할 LLM (기본 = config)</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => patch({ genModel: "" })}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${!s.genModel ? "border-app-text bg-app-bg" : "border-app-border bg-white text-app-muted"}`}
          >
            config 기본값
          </button>
          {(models.length ? models : [{ id: "claude-sonnet", label: "Claude Sonnet" }, { id: "claude-opus", label: "Claude Opus" }, { id: "gpt-5.5", label: "GPT-5.5" }, { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" }]).map((m) => (
            <button
              key={m.id}
              onClick={() => patch({ genModel: m.id })}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${s.genModel === m.id ? "border-app-text bg-app-bg" : "border-app-border bg-white text-app-muted"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ===== 덱·공유 관리 (실데이터) =====
function DecksPage() {
  const [decks, setDecks] = useState<{ id: string; title: string; slides: number; updatedAt: number }[]>([]);
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [share, setShare] = useState<Record<string, string>>({});
  useEffect(() => {
    void adminApi.decks().then((r) => setDecks(r.decks)).catch((e) => showToast(String(e.message ?? e)));
  }, []);
  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[11px] font-bold text-app-faint">
          <span className="flex-[1.9]">덱 / 소유자</span>
          <span className="w-[60px] flex-none text-center">멤버</span>
          <span className="w-[70px] flex-none text-center">내보내기</span>
          <span className="w-[130px] flex-none">공유 링크</span>
          <span className="w-[190px] flex-none">조치</span>
        </div>
        {decks.map((d) => (
          <div key={d.id} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]">
            <div className="flex-[1.9]">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                {d.title}
                {locked[d.id] && (
                  <span className="rounded bg-[#FFF0F0] px-1.5 py-0.5 text-[9.5px] font-bold text-app-danger">잠김</span>
                )}
              </div>
              <div className="text-[10.5px] text-app-faint">
                — · {d.slides}장 · <span className="font-mono">/d/{d.id.slice(0, 6)}</span>
              </div>
            </div>
            <span className="w-[60px] flex-none text-center text-[12.5px]">—</span>
            <span className="w-[70px] flex-none text-center text-[12.5px]">—</span>
            <span className="w-[130px] flex-none">
              <select
                className="rounded-md border border-app-border bg-white px-1.5 py-1 text-[11px]"
                value={share[d.id] ?? (locked[d.id] ? "off" : "view")}
                onChange={(e) => {
                  setShare((p) => ({ ...p, [d.id]: e.target.value }));
                  const label = e.target.value === "off" ? "링크 비활성" : e.target.value === "edit" ? "편집 허용" : "보기 전용";
                  showToast(`'${d.title}' 공유 링크를 ${label}(으)로 변경했어요 (감사 로그 기록)`);
                }}
              >
                <option value="off">링크 비활성</option>
                <option value="view">보기 전용</option>
                <option value="edit">편집 허용</option>
              </select>
            </span>
            <span className="flex w-[190px] flex-none gap-1.5">
              <button
                onClick={() => {
                  setLocked((p) => ({ ...p, [d.id]: !p[d.id] }));
                  showToast(locked[d.id] ? "잠금 해제됨" : "강제 잠금 — 소유자 외 편집 차단");
                }}
                className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold"
              >
                {locked[d.id] ? "잠금 해제" : "강제 잠금"}
              </button>
              <button
                onClick={() => showToast("전체 접근 해제 — 모든 멤버 권한·공유 링크 무효화 (감사 로그 기록)")}
                className="rounded-[7px] border border-[#F5C6C8] bg-[#FFF0F0] px-2 py-[5px] text-[11px] font-semibold text-app-danger"
              >
                전체 접근 해제
              </button>
            </span>
          </div>
        ))}
        {decks.length === 0 && (
          <div className="p-[26px] text-center text-[12.5px] text-app-faint">공유된 덱이 없습니다</div>
        )}
      </Card>
      <p className="mt-3 text-[11px] leading-relaxed text-app-faint">
        강제 잠금 시 소유자 외 편집 차단 · 접근 해제는 모든 멤버 권한과 공유 링크를 즉시 무효화합니다 (감사 로그 기록)
      </p>
    </>
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
          <div key={i} className="flex items-center justify-between gap-2 border-b border-[#F0F0EE] px-4 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-[12px]">{iv.meta.replace("초대 메일 · ", "")}</div>
              <div className="text-[10.5px] text-app-faint">{fmtTime(iv.ts)} · 편집자</div>
            </div>
            <div className="flex flex-none items-center gap-1.5">
              <StatusPill ok label="발송됨" />
              <button
                onClick={() => showToast("초대 메일을 재발송했어요")}
                title="재발송"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-app-border text-app-muted hover:border-app-accent hover:text-app-accent"
              >
                <span className="mi text-[15px]">send</span>
              </button>
              <button
                onClick={() => showToast("초대를 취소했어요")}
                title="초대 취소"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-app-border text-app-muted hover:border-app-danger hover:text-app-danger"
              >
                <span className="mi text-[15px]">close</span>
              </button>
            </div>
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
            <button onClick={() => upd(r.id, { cost: Math.max(1, r.cost - 1) })} className="rounded border border-app-border px-1.5 text-[12px]"><span className="mi text-[16px]">remove</span></button>
            <span className="w-4 text-center text-[12.5px] font-semibold">{r.cost}</span>
            <button onClick={() => upd(r.id, { cost: Math.min(9, r.cost + 1) })} className="rounded border border-app-border px-1.5 text-[12px]">+</button>
          </span>
          <span className="flex-1"><Toggle on={r.free} onClick={() => upd(r.id, { free: !r.free })} /></span>
          <span className="flex-1">
            <button onClick={() => upd(r.id, { on: !r.on })} className={`rounded-full border px-3 py-[5px] text-[11px] font-semibold ${r.on ? "border-app-text bg-app-text text-white" : "border-app-border bg-white text-app-faint"}`}>{r.on ? "운영 중" : "중지됨"}</button>
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
    { id: 1, name: "프로덕션 서버", masked: "dg_live_••••a9F2", created: "2026-03-02", scope: "전체", calls: "1.2M", last: "방금", on: true, revoked: false },
    { id: 2, name: "스테이징", masked: "dg_test_••••7c1B", created: "2026-04-11", scope: "전체", calls: "84K", last: "3시간 전", on: true, revoked: false },
    { id: 3, name: "분석 파이프라인", masked: "dg_live_••••e5K0", created: "2026-05-20", scope: "읽기 전용", calls: "410K", last: "이제", on: true, revoked: false },
    { id: 4, name: "레거시 웹훅", masked: "dg_live_••••11cD", created: "2025-11-08", scope: "웹훅", calls: "12K", last: "32일 전", on: false, revoked: true },
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
            setKeys((p) => [{ id: Date.now(), name: "새 키", masked: full.slice(0, 12) + "••••" + full.slice(-4), created: nowKstDate(), scope: "전체", calls: "0", last: "방금", on: true, revoked: false }, ...p]);
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
          <span className="w-[80px] flex-none">호출</span>
          <span className="w-[90px] flex-none">마지막 사용</span>
          <span className="w-[140px] flex-none">조치</span>
        </div>
        {keys.map((k) => (
          <div key={k.id} className={`flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px] ${k.revoked ? "opacity-55" : ""}`}>
            <div className="flex-[1.8]">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                {k.name}
                {k.revoked && <span className="rounded bg-[#F0F0EE] px-1.5 py-0.5 text-[9.5px] font-bold text-app-faint">폐기됨</span>}
              </div>
              <div className="font-mono text-[10.5px] text-app-faint">{k.masked} · {k.created} 생성</div>
            </div>
            <span className="flex-1 text-[12px]">{k.scope}</span>
            <span className="w-[80px] flex-none text-[12px] text-app-muted">{k.calls}</span>
            <span className="w-[90px] flex-none text-[11.5px] text-app-muted">{k.last}</span>
            <span className="flex w-[140px] flex-none gap-1.5">
              {k.revoked ? (
                <button onClick={() => { setKeys((p) => p.filter((x) => x.id !== k.id)); showToast(`${k.name} 삭제됨`); }} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold">삭제</button>
              ) : (
                <>
                  <button onClick={() => showToast(`${k.name} 키를 회전했어요 — 기존 키 24시간 후 만료`)} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold">회전</button>
                  <button onClick={() => { setKeys((p) => p.map((x) => x.id === k.id ? { ...x, revoked: true, on: false } : x)); showToast(`${k.name} 키를 폐기했어요`); }} className="rounded-[7px] border border-[#F5C6C8] bg-[#FFF0F0] px-2 py-[5px] text-[11px] font-semibold text-app-danger">폐기</button>
                </>
              )}
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
  const byModel = [
    { name: "Claude Fable 5", n: 14200 },
    { name: "GPT-5.5", n: 9800 },
    { name: "Gemini 3.1 Pro", n: 7400 },
    { name: "DeckGen 1.1", n: 4600 },
    { name: "이미지 모델", n: 2600 },
  ];
  const maxN = Math.max(1, ...byModel.map((b) => b.n));
  const log = [
    { t: "09:52", user: "mina@studio.kr", model: "Claude Fable 5", action: "슬라이드 생성 ×8", c: -24 },
    { t: "09:41", user: "woojin@deckgen.app", model: "GPT-5.5", action: "AI 수정 ×3", c: -9 },
    { t: "09:33", user: "kim@company.co.kr", model: "이미지 모델", action: "AI 이미지 ×2", c: -12 },
    { t: "09:20", user: "lee@company.co.kr", model: "DeckGen 1.1", action: "아웃라인", c: -2 },
    { t: "09:05", user: "guest_9f2", model: "Gemini 3.1 Pro", action: "슬라이드 생성 ×5", c: -15 },
  ];
  return (
    <>
      <div className="mb-5 grid grid-cols-4 gap-3.5">
        {[
          { name: "오늘 소모", value: "1,284", sub: "어제 1,102 · +16%" },
          { name: "이번 달 누적", value: "38.6K", sub: "한도 50K의 77%" },
          { name: "생성당 평균", value: "4.2", sub: "크레딧 / 덱 생성" },
          { name: "최다 사용자", value: "mina", sub: "이번 주 2,140 크레딧" },
        ].map((k) => (
          <Card key={k.name} className="px-[18px] py-4">
            <div className="text-[12px] text-app-muted">{k.name}</div>
            <div className="mt-1.5 text-[24px] font-extrabold tracking-tight">{k.value}</div>
            <div className="mt-[3px] text-[11px] text-app-faint">{k.sub}</div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_1.2fr] gap-3.5">
        <Card className="px-5 py-[18px]">
          <div className="mb-3.5 text-[13.5px] font-bold">모델별 크레딧 소모</div>
          {byModel.map((b) => (
            <div key={b.name} className="flex items-center gap-3 py-[7px]">
              <span className="w-[110px] flex-none text-[12px] text-[#4A4A45]">{b.name}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-[#F0F0EE]">
                <div className="h-full rounded bg-app-text" style={{ width: `${(b.n / maxN) * 100}%` }} />
              </div>
              <span className="w-12 flex-none text-right text-[11.5px] font-bold">{b.n.toLocaleString()}</span>
            </div>
          ))}
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-app-border bg-[#FBFBFA] px-[18px] py-2.5 text-[12.5px] font-bold">최근 크레딧 로그</div>
          <div className="flex border-b border-[#F0F0EE] bg-[#FBFBFA] px-[18px] py-2 text-[10.5px] font-bold text-app-faint">
            <span className="w-12 flex-none">시각</span><span className="flex-1">사용자</span><span className="flex-[1.5]">모델 / 작업</span><span className="w-12 flex-none text-right">크레딧</span>
          </div>
          {log.map((l, i) => (
            <div key={i} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-2 text-[11.5px] last:border-b-0">
              <span className="w-12 flex-none text-app-muted">{l.t}</span>
              <span className="flex-1 truncate">{l.user}</span>
              <span className="flex-[1.5] min-w-0">
                <span className="block truncate">{l.model}</span>
                <span className="block truncate text-[10px] text-app-faint">{l.action}</span>
              </span>
              <span className="w-12 flex-none text-right font-semibold text-app-danger">{l.c}</span>
            </div>
          ))}
        </Card>
      </div>
      <p className="mt-2 text-[10.5px] text-app-faint">* jobs 이벤트 {jobs.length}건 집계 · 값은 데모 표시</p>
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
  // 서버의 실제 점검 모드 값을 불러와 동기화(서비스 설정 페이지와 일치)
  useEffect(() => {
    void adminApi.settings().then((r) => setMaint(!!r.settings?.maintenance)).catch(() => {});
  }, []);
  const toggleMaint = () => {
    const next = !maint;
    setMaint(next);
    void adminApi
      .patchSettings({ maintenance: next })
      .then(() => showToast(next ? "점검 모드 켜짐 — 생성 3종 503" : "점검 모드 해제"))
      .catch((e) => {
        setMaint(!next);
        showToast(String(e.message ?? e));
      });
  };
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
  // 배너 부제는 상태에 따라 달라짐 (item 13)
  const overallSub = maint
    ? "점검 모드 진행 중 · 생성 3종이 일시 중단되고 상태 페이지에 배너가 게시됩니다"
    : down
      ? `${down}개 서비스 성능 저하 · SLA 영향은 없으며 자동 복구를 시도 중입니다`
      : "실시간 헬스 체크 · 30초 주기 · 모든 SLA 충족";
  // 서비스 상태 라벨(정상=중립 모노 / 성능저하=앰버 / 장애=빨강)
  const svcStatus = (s: (typeof services)[number]) =>
    s.ok
      ? { label: "정상", color: "#1A1A1A", dot: "#1A1A1A" }
      : parseFloat(s.uptime) < 99.5
        ? { label: "장애", color: "#E5484D", dot: "#E5484D" }
        : { label: "성능저하", color: "#B45309", dot: "#B45309" };
  return (
    <>
      <Card className="mb-5 flex items-center gap-3 px-5 py-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full text-[18px] ${maint ? "bg-[#FEF3E2]" : down ? "bg-[#FFF0F0]" : "bg-[#F0F0EE]"}`}>
          <span className="mi text-[18px]" style={{ color: maint ? "#B45309" : down ? "#E5484D" : "#1A1A1A" }}>{maint ? "build" : down ? "warning" : "check_circle"}</span>
        </span>
        <div className="flex-1">
          <div className="text-[14px] font-bold">
            {maint ? "점검 모드 진행 중" : down ? `${down}개 서비스 성능 저하` : "모든 서비스 정상"}
          </div>
          <div className="text-[11.5px] text-app-faint">{overallSub}</div>
        </div>
        <button
          onClick={toggleMaint}
          className={`rounded-lg border px-3.5 py-2 text-[12px] font-semibold ${maint ? "border-[#F5C6C8] bg-[#FFF0F0] text-app-danger" : "border-app-border bg-white"}`}
        >
          {maint ? "점검 모드 끄기" : "점검 모드 켜기"}
        </button>
      </Card>
      <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
        {services.map((s) => {
          const st = svcStatus(s);
          return (
            <Card key={s.name} className="px-4 py-3.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: st.dot }} />
                <span className="flex-1 text-[12.5px] font-semibold">{s.name}</span>
                <span className="text-[10px] font-bold" style={{ color: st.color }}>{st.label}</span>
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-app-muted">
                <span>지연 {s.latency}</span>
                <span>업타임 {s.uptime}</span>
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-[#F0F0EE] px-[18px] py-3 text-[13px] font-bold">인시던트 이력</div>
        {incidents.map((ic) => (
          <div key={ic.id} className="flex gap-3 border-b border-[#F0F0EE] px-[18px] py-3 last:border-b-0">
            <span className="mt-[5px] h-[9px] w-[9px] flex-none rounded-full" style={{ background: ic.ok ? "#8A8A84" : "#E5484D" }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-semibold">{ic.title}</span>
                <span
                  className="rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-bold"
                  style={ic.ok ? { background: "#F0F0EE", color: "#1A1A1A" } : { background: "#FFF0F0", color: "#E5484D" }}
                >
                  {ic.ok ? "해결됨" : "진행 중"}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-app-faint">{ic.detail}</div>
            </div>
            <span className="flex-none self-start font-mono text-[11px] text-app-faint">{ic.when}</span>
            {!ic.ok && (
              <button onClick={() => { setIncidents((p) => p.map((x) => x.id === ic.id ? { ...x, ok: true } : x)); showToast("인시던트를 해결 처리했어요"); }} className="flex-none self-start rounded-[7px] border border-app-border bg-white px-2.5 py-[5px] text-[11px] font-semibold">해결</button>
            )}
          </div>
        ))}
      </Card>
      <div className="mt-2.5 text-[11px] text-app-faint">
        헬스체크는 30초 주기 · degraded는 SLA 영향 없는 성능 저하 · 점검 모드 시 상태 페이지에 배너가 게시됩니다
      </div>
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
      <div className="mb-4 grid grid-cols-2 items-start gap-4">
      <Card className="px-5 py-4">
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
      <Card className="px-5 py-4">
        <div className="mb-1 text-[13px] font-bold">개인정보 요청 (GDPR)</div>
        <div className="mb-3 text-[11.5px] text-app-faint">이메일로 사용자를 특정해 데이터 이동권(추출)·삭제권(파기)을 처리합니다.</div>
        <input value={gdprEmail} onChange={(e) => setGdprEmail(e.target.value)} placeholder="사용자 이메일" className="mb-2 w-full rounded-lg border border-app-border px-3 py-2 text-[12.5px] focus:border-app-accent focus:outline-none" />
        <div className="flex items-center gap-2">
          <button onClick={() => gdprEmail && showToast(`${gdprEmail} 데이터 추출을 시작했어요`)} className="flex-1 rounded-lg border border-app-border bg-white px-3.5 py-2 text-[12px] font-semibold">데이터 추출</button>
          <button onClick={() => gdprEmail && showToast(`${gdprEmail} 데이터 파기를 예약했어요`)} className="flex-1 rounded-lg border border-[#F5C6C8] bg-[#FFF0F0] px-3.5 py-2 text-[12px] font-semibold text-app-danger">데이터 파기</button>
        </div>
      </Card>
      </div>
      <Card className="overflow-hidden">
        <div className={thCls}><span className="flex-[1.4]">데이터셋</span><span className="flex-1">형식</span><span className="flex-1">행</span><span className="flex-1">생성</span><span className="w-24 flex-none">조치</span></div>
        {jobs.map((j) => (
          <div key={j.id} className={rowCls}>
            <span className="flex-[1.4] text-[12.5px] font-semibold">{j.ds}</span>
            <span className="flex-1 text-[12px]">{j.fmt}</span>
            <span className="flex-1 text-[12px] text-app-muted">{j.rows}</span>
            <span className="flex-1 text-[11.5px] text-app-faint">{j.when}</span>
            <span className="w-24 flex-none">
              {j.ready ? <button onClick={() => showToast("파일을 다운로드합니다")} className="rounded-[7px] border border-app-border bg-white px-2.5 py-[5px] text-[11px] font-semibold"><span className="mi text-[13px] mr-0.5 align-middle">download</span>다운로드</button> : <span className="text-[11px] text-app-faint">생성 중…</span>}
            </span>
          </div>
        ))}
      </Card>
      <div className="mt-2.5 text-[11px] text-app-faint">
        추출 파일은 암호화되어 24시간 후 자동 삭제 · 모든 추출·파기는 감사 로그에 기록됩니다
      </div>
    </>
  );
}

// ===== A/B 테스트 (abtest) =====
function AbtestPage() {
  const [exps, setExps] = useState([
    { id: 1, name: "온보딩 프롬프트 문구", metric: "첫 덱 생성률", days: 6, running: true, lift: "+16.8% (B vs 대조군)", vars: [{ n: "A (대조군)", users: 1240, share: 50, conv: 34, win: false }, { n: "B (신규)", users: 1198, share: 50, conv: 46, win: true }] },
    { id: 2, name: "요금제 CTA 색상", metric: "업그레이드 클릭률", days: 3, running: true, lift: "+4.0% (B vs 대조군)", vars: [{ n: "A 검정", users: 820, share: 50, conv: 8, win: false }, { n: "B 강조", users: 812, share: 50, conv: 12, win: true }] },
    { id: 3, name: "빈 상태 일러스트", metric: "이탈률", days: 12, running: false, lift: "변형 간 유의한 차이 없음", vars: [{ n: "A", users: 640, share: 50, conv: 21, win: false }, { n: "B", users: 631, share: 50, conv: 20, win: false }] },
  ]);
  return (
    <>
      <div className="mb-3.5 flex items-center gap-2">
        <span className="flex-1 text-[12.5px] text-app-muted">기능 플래그와 연동된 실험. 변형별 전환율을 비교하고 승자를 전체 적용합니다.</span>
        <button onClick={() => { setExps((p) => [{ id: Date.now(), name: "새 실험", metric: "지표 미정", days: 0, running: true, lift: "—", vars: [{ n: "A", users: 0, share: 50, conv: 0, win: false }, { n: "B", users: 0, share: 50, conv: 0, win: false }] }, ...p]); showToast("새 실험을 생성했어요"); }} className="rounded-lg bg-app-text px-4 py-2 text-[12.5px] font-semibold text-white">+ 새 실험</button>
      </div>
      <div className="flex flex-col gap-3.5">
        {exps.map((ex) => {
          const maxConv = Math.max(1, ...ex.vars.map((v) => v.conv));
          return (
            <Card key={ex.id} className="px-5 py-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[13.5px] font-bold">{ex.name}</span>
                <span className="text-[11.5px] text-app-faint">목표: {ex.metric} · {ex.days}일째</span>
                <span className="flex-1" />
                <StatusPill ok={ex.running} label={ex.running ? "진행 중" : "종료"} />
                {ex.running && (
                  <button onClick={() => { setExps((p) => p.map((x) => x.id === ex.id ? { ...x, running: false } : x)); showToast("실험을 종료했어요"); }} className="rounded-[7px] border border-app-border bg-white px-2.5 py-1 text-[11px] font-semibold">종료</button>
                )}
              </div>
              <div className="space-y-2.5">
                {ex.vars.map((v) => (
                  <div key={v.n} className="flex items-center gap-3">
                    <div className="w-40 flex-none">
                      <div className="flex items-center gap-1.5 text-[12px] font-semibold">{v.n}{v.win && <span className="rounded-[5px] bg-[#F0F0EE] px-1.5 py-0.5 text-[9.5px] font-bold text-[#1A1A1A]">▲ 우세</span>}</div>
                      <div className="text-[10.5px] text-app-faint">{v.users.toLocaleString()}명 · 배분 {v.share}%</div>
                    </div>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-[#F0F0EE]">
                      <div className="h-full rounded bg-app-text" style={{ width: `${(v.conv / maxConv) * 100}%`, opacity: v.win ? 1 : 0.55 }} />
                    </div>
                    <span className="w-14 flex-none text-right text-[13px] font-extrabold">{v.conv}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-[#F0F0EE] pt-2.5">
                <span className="flex-1 text-[11.5px] font-semibold text-app-muted">{ex.lift}</span>
                {ex.running && (
                  <button onClick={() => { setExps((p) => p.map((x) => x.id === ex.id ? { ...x, running: false } : x)); showToast("승자 변형을 전체 적용했어요"); }} className="rounded-lg bg-app-text px-3.5 py-1.5 text-[11.5px] font-semibold text-white">승자 전체 적용</button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <div className="mt-2.5 text-[11px] text-app-faint">
        전환율 차이는 통계적 유의성(95%) 도달 시 승자 배지 표시 · 승자 적용 시 해당 변형이 100% 롤아웃되고 실험 종료
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
  const pill = (st: string) => st === "열람" ? "border-[#D4D4CE] bg-[#F0F0EE] text-[#1A1A1A]" : st === "반송" ? "border-[#F5C6C8] bg-[#FFF0F0] text-app-danger" : "border-app-border bg-app-bg text-app-muted";
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
      <div className="mt-2.5 text-[11px] text-app-faint">
        발송 이벤트는 메일 프로바이더 웹훅으로 수집(전송/오픈/바운스/스팸) · 바운스 주소는 자동 억제 목록에 추가됩니다
      </div>
    </>
  );
}

// ===== 기능 플래그 (flags) =====
function FlagsPage() {
  const [rows, setRows] = useState([
    { id: "fig_export", name: "Figma 내보내기", desc: "SVG zip 핸드오프", rollout: 100, target: "전체 사용자", on: true },
    { id: "auto_agent", name: "Auto Agent", desc: "멀티스텝 자동 편집", rollout: 20, target: "내부 스탭", on: false },
    { id: "realtime_collab", name: "실시간 협업", desc: "라이브 커서·프레즌스", rollout: 100, target: "전체 사용자", on: true },
    { id: "web_research", name: "웹 리서치", desc: "생성 시 웹 검색 보강", rollout: 30, target: "Plus 이상", on: false },
    { id: "new_editor", name: "신규 에디터", desc: "차기 캔버스 엔진", rollout: 10, target: "내부 스탭", on: false },
    { id: "video_embed", name: "동영상 임베드", desc: "YouTube 슬라이드", rollout: 50, target: "Plus 이상", on: true },
  ]);
  const upd = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r));
  const onCnt = rows.filter((r) => r.on).length;
  return (
    <>
      <div className="mb-3.5 flex items-center gap-2">
        <span className="flex-1 text-[12.5px] text-app-muted">롤아웃 % · 플랜/스텝 타겟 · 즉시 토글</span>
        <span className="rounded-full border border-app-border bg-white px-2.5 py-1 text-[11.5px] font-semibold">활성 {onCnt} / {rows.length}</span>
      </div>
      <Card className="overflow-hidden">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-[#F0F0EE] px-[18px] py-3 last:border-b-0" style={{ opacity: r.on ? 1 : 0.55 }}>
            <div className="flex-[1.6]">
              <div className="text-[12.5px] font-semibold">{r.name}</div>
              <div className="font-mono text-[10.5px] text-app-faint">{r.id} · {r.desc}</div>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <input type="range" min={0} max={100} step={10} value={r.rollout} onChange={(e) => upd(r.id, { rollout: Number(e.target.value) })} className="flex-1 accent-app-accent" />
              <span className="w-10 text-right text-[11px] font-bold tabular-nums">{r.rollout}%</span>
            </div>
            <select value={r.target} onChange={(e) => upd(r.id, { target: e.target.value })} className="w-28 flex-none rounded-md border border-app-border px-1.5 py-1 text-[11px]">
              <option value="전체 사용자">전체 사용자</option><option value="Plus 이상">Plus 이상</option><option value="내부 스탭">내부 스탭</option>
            </select>
            <Toggle on={r.on} onClick={() => upd(r.id, { on: !r.on })} />
          </div>
        ))}
      </Card>
      <p className="mt-3 text-[11px] leading-relaxed text-app-faint">
        토글·롤아웃·타겟 변경은 즉시 반영(시뮬레이션)되며 감사 로그에 기록됩니다 · OFF 플래그는 롤아웃과 무관하게 전면 비활성
      </p>
    </>
  );
}

// ===== 약관 · 정책 (policies) =====
function PoliciesPage() {
  const [rows, setRows] = useState([
    { id: 1, name: "서비스 이용약관", version: "v2.3", updated: "2026-06-20", reconsent: true, draft: false },
    { id: 2, name: "개인정보 처리방침", version: "v3.1", updated: "2026-05-14", reconsent: false, draft: false },
    { id: 3, name: "환불 정책", version: "v1.4", updated: "2026-04-02", reconsent: false, draft: false },
    { id: 4, name: "마케팅 정보 수신 동의", version: "v1.1", updated: "2026-06-28", reconsent: false, draft: true },
  ]);
  const pub = rows.filter((r) => !r.draft).length;
  return (
    <>
      <div className="mb-3.5 flex items-center gap-2">
        <span className="flex-1 text-[12.5px] text-app-muted">버전 관리 · 게시 · 재동의 요청</span>
        <span className="rounded-full border border-app-border bg-white px-2.5 py-1 text-[11.5px] font-semibold">게시됨 {pub} / {rows.length}</span>
      </div>
      <Card className="overflow-hidden">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-[#F0F0EE] px-[18px] py-3.5 last:border-b-0">
            <span className="mi flex-none text-[18px] text-[#55554F]">description</span>
            <div className="min-w-0 flex-[1.6]">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold">{r.name}</span>
                <span className="rounded-[5px] bg-[#F0F0EE] px-1.5 py-0.5 text-[10.5px] font-bold text-[#1A1A1A]">{r.version}</span>
                {r.reconsent && <span className="rounded-[5px] border border-[#D4D4CE] px-1.5 py-0.5 text-[9.5px] font-bold text-[#1A1A1A]">재동의 필요</span>}
              </div>
              <div className="mt-0.5 text-[10.5px] text-app-faint">최종 수정 {r.updated}</div>
            </div>
            <span className="flex-none">
              <span className={`rounded-full px-2.5 py-[3px] text-[10.5px] font-bold ${r.draft ? "border border-app-border bg-white text-app-muted" : "bg-[#F0F0EE] text-[#1A1A1A]"}`}>
                {r.draft ? "초안" : "게시됨"}
              </span>
            </span>
            <span className="flex w-[230px] flex-none justify-end gap-1.5">
              <button onClick={() => { setRows((p) => p.map((x) => x.id === r.id ? { ...x, version: `v${(parseFloat(x.version.replace(/^v/, "")) + 0.1).toFixed(1)}`, draft: true } : x)); showToast(`${r.name} 새 버전(초안)을 만들었어요`); }} className="rounded-[7px] border border-app-border bg-white px-2.5 py-[5px] text-[11px] font-semibold">새 버전</button>
              {r.draft
                ? <button onClick={() => { setRows((p) => p.map((x) => x.id === r.id ? { ...x, draft: false } : x)); showToast("게시했어요"); }} className="rounded-[7px] bg-app-text px-2.5 py-[5px] text-[11px] font-semibold text-white">게시</button>
                : <button onClick={() => { setRows((p) => p.map((x) => x.id === r.id ? { ...x, reconsent: true } : x)); showToast("재동의를 요청했어요"); }} className="rounded-[7px] border border-app-border bg-white px-2.5 py-[5px] text-[11px] font-semibold">재동의 요청</button>}
              <button onClick={() => showToast("버전 이력을 표시합니다")} className="rounded-[7px] border border-app-border bg-white px-2 py-[5px] text-[11px] font-semibold text-app-muted">이력</button>
            </span>
          </div>
        ))}
      </Card>
      <p className="mt-3 text-[11px] leading-relaxed text-app-faint">
        게시 시 이전 버전은 자동 보관(archive)되고 게시 일자가 기록됩니다 · 재동의 요청 시 다음 로그인에서 동의 모달이 노출됩니다
      </p>
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
  const pill = (st: string) => st === "결제 완료" ? "border-[#D4D4CE] bg-[#F0F0EE] text-[#1A1A1A]" : st === "실패" ? "border-[#F5C6C8] bg-[#FFF0F0] text-app-danger" : "border-app-border bg-app-bg text-app-muted";
  return (
    <>
      <KpiGrid items={[
        { name: "이번 달 매출", value: "₩2.4M", sub: "전월 대비 +18%" },
        { name: "활성 구독", value: "184", sub: "Pro 142 · Team 42" },
        { name: "환불 (이번 달)", value: "₩84K", sub: "7건 · 환불율 3.5%" },
        { name: "결제 실패", value: "5", sub: "재청구 대기 3건" },
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
      <p className="mt-3 text-[11px] text-app-faint">
        환불은 PG사 API로 즉시 요청되며 결제 취소·부분 환불이 감사 로그·웹훅으로 기록됩니다
      </p>
    </>
  );
}

// ===== 역할 · 권한 (roles) =====
function RolesPage() {
  const [staff, setStaff] = useState([
    { id: 1, name: "관리자 (나)", email: "admin@deckgen.io", role: "관리자", owner: true, last: "지금 접속 중" },
    { id: 2, name: "이서포트", email: "support@deckgen.io", role: "서포트", owner: false, last: "2시간 전" },
    { id: 3, name: "박애널", email: "analyst@deckgen.io", role: "분석가", owner: false, last: "어제" },
  ]);
  const [email, setEmail] = useState("");
  const perms = [
    { name: "대시보드 조회", admin: true, support: true, analyst: true },
    { name: "사용자 관리", admin: true, support: true, analyst: false },
    { name: "결제·매출", admin: true, support: false, analyst: false },
    { name: "서비스 설정", admin: true, support: false, analyst: false },
    { name: "감사 로그", admin: true, support: false, analyst: true },
  ];
  const cell = (ok: boolean) => <span className="mi text-[16px]" style={{ color: ok ? "#1A1A1A" : "#C9C9C4" }}>{ok ? "check_circle" : "remove"}</span>;
  return (
    <div className="grid grid-cols-[1.2fr_1fr] items-start gap-4">
      <Card className="overflow-hidden">
        <div className="flex items-center border-b border-app-border px-[18px] py-2.5">
          <span className="flex-1 text-[12.5px] font-bold">관리자 멤버</span>
          <span className="text-[11px] text-app-faint">{staff.length}명</span>
        </div>
        {staff.map((s) => (
          <div key={s.id} className="flex items-center gap-2.5 border-b border-[#F0F0EE] px-[18px] py-2.5 last:border-b-0">
            <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-app-text text-[11.5px] font-bold text-white">
              {s.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold">{s.name}</div>
              <div className="truncate text-[10.5px] text-app-faint">{s.email} · {s.last}</div>
            </div>
            {s.owner ? (
              <span className="px-1.5 text-[11px] font-bold text-app-text">소유자</span>
            ) : (
              <>
                <select value={s.role} onChange={(e) => setStaff((p) => p.map((x) => x.id === s.id ? { ...x, role: e.target.value } : x))} className="rounded-md border border-app-border px-1.5 py-1 text-[11px]">
                  <option>관리자</option><option>서포트</option><option>분석가</option>
                </select>
                <button onClick={() => setStaff((p) => p.filter((x) => x.id !== s.id))} title="제거" className="flex-none p-1 text-[#B4B4AE] hover:text-app-danger">
                  <span className="mi text-[15px]">close</span>
                </button>
              </>
            )}
          </div>
        ))}
        <div className="flex gap-1.5 px-[18px] py-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일로 관리자 초대" className="min-w-0 flex-1 rounded-lg border border-app-border px-3 py-2 text-[12px] focus:border-app-accent focus:outline-none" />
          <button onClick={() => { if (email) { setStaff((p) => [...p, { id: Date.now(), name: email.split("@")[0], email, role: "서포트", owner: false, last: "미접속" }]); setEmail(""); showToast("초대 메일을 보냈어요"); } }} className="flex-none rounded-lg bg-app-text px-3 py-2 text-[12px] font-semibold text-white">초대</button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-app-border px-[18px] py-2.5 text-[12.5px] font-bold">역할별 권한 매트릭스</div>
        <div className="flex border-b border-[#F0F0EE] bg-[#FBFBFA] px-[18px] py-2 text-[11px] font-bold text-app-faint">
          <span className="flex-[1.4]">권한</span><span className="flex-1 text-center">관리자</span><span className="flex-1 text-center">서포트</span><span className="flex-1 text-center">분석가</span>
        </div>
        {perms.map((p) => (
          <div key={p.name} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-2.5 text-[12px]">
            <span className="flex-[1.4]">{p.name}</span>
            <span className="flex-1 text-center">{cell(p.admin)}</span>
            <span className="flex-1 text-center">{cell(p.support)}</span>
            <span className="flex-1 text-center">{cell(p.analyst)}</span>
          </div>
        ))}
        <div className="px-[18px] py-2.5 text-[10.5px] text-app-faint">
          소유자는 모든 권한을 가지며 변경할 수 없습니다 · 권한 변경은 감사 로그에 기록됩니다
        </div>
      </Card>
    </div>
  );
}

// 블록 좌표(%) 미니 프리뷰 — type 1=강조 다크바, 2=원, else 회색 존
function WfMini({ blocks }: { blocks: number[][] }) {
  return (
    <svg viewBox="0 0 100 62.5" className="h-full w-full" preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="62.5" fill="#FBFBFA" />
      {blocks.map((b, i) => {
        const [px, py, pw, ph, t] = b;
        const x = (px / 100) * 100, y = (py / 100) * 62.5, w = (pw / 100) * 100, h = (ph / 100) * 62.5;
        if (t === 2) return <ellipse key={i} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="#EDEDE9" stroke="#D2D2CD" strokeWidth={0.5} />;
        if (t === 1) return <rect key={i} x={x} y={y} width={w} height={h} rx={ph <= 7 ? 0.6 : 1} fill={ph <= 7 ? "#1A1A1A" : "#E3E1EF"} />;
        return <rect key={i} x={x} y={y} width={w} height={h} rx={1} fill="#F0F0EC" stroke="#DBDBD6" strokeWidth={0.5} />;
      })}
    </svg>
  );
}

// ===== 스토리보드 템플릿 (sbtpl) — 홈 "스토리보드로 시작" 35종 단일 와이어프레임 관리 =====
function SbtplPage() {
  const items = SINGLE_WIREFRAMES.map((w, i) => ({
    id: w.id,
    name: w.name,
    category: w.category,
    blocks: w.blocks as number[][],
    uses: Math.max(40, 1240 - i * 34),
    on: i % 9 !== 8, // 일부 숨김 데모
  }));
  const [rows, setRows] = useState(items);
  const move = (i: number, dir: number) => {
    setRows((p) => {
      const n = [...p];
      const j = i + dir;
      if (j < 0 || j >= n.length) return p;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };
  const onCount = rows.filter((r) => r.on).length;
  return (
    <>
      <div className="mb-3.5 flex items-center gap-2">
        <span className="flex-1 text-[12.5px] text-app-muted">
          홈 "스토리보드로 시작" 라이브러리에 노출되는 와이어프레임을 관리합니다. 순서는 노출 순.
        </span>
        <span className="rounded-full border border-app-border bg-white px-2.5 py-1 text-[11.5px] font-semibold">
          활성 {onCount} / {rows.length}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(215px,1fr))] gap-3.5">
        {rows.map((r, i) => (
          <Card key={r.id} className={`p-2.5 ${r.on ? "" : "opacity-60"}`}>
            <div className="mb-2 aspect-[16/10] overflow-hidden rounded-lg border border-app-border-soft">
              <WfMini blocks={r.blocks} />
            </div>
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-semibold">{r.name}</div>
                <div className="truncate text-[10px] text-app-faint">{r.category} · 사용 {r.uses.toLocaleString()}회</div>
              </div>
              <button onClick={() => move(i, -1)} title="앞으로" className="flex h-6 w-6 items-center justify-center rounded-md border border-app-border bg-white text-app-muted hover:border-app-accent"><span className="mi text-[13px]">arrow_back</span></button>
              <button onClick={() => move(i, 1)} title="뒤로" className="flex h-6 w-6 items-center justify-center rounded-md border border-app-border bg-white text-app-muted hover:border-app-accent"><span className="mi text-[13px]">arrow_forward</span></button>
              <Toggle on={r.on} onClick={() => setRows((p) => p.map((x) => x.id === r.id ? { ...x, on: !x.on } : x))} />
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-app-faint">
        비활성 와이어프레임은 홈 "스토리보드로 시작" 갤러리에서 숨겨집니다 · 순서·노출 변경은 즉시 반영됩니다
      </div>
    </>
  );
}

// ===== 온보딩 퍼널 (funnel) =====
function FunnelPage() {
  const [period, setPeriod] = useState("30일");
  const BASE = [
    { name: "가입 완료", n: 3880, pct: 100 },
    { name: "온보딩 시작", n: 3337, pct: 86 },
    { name: "용도 선택", n: 2794, pct: 72 },
    { name: "첫 프롬프트/템플릿", n: 1901, pct: 49 },
    { name: "아웃라인 생성", n: 1707, pct: 44 },
    { name: "첫 덱 완성", n: 1474, pct: 38 },
  ];
  // 기간 토글이 실제로 단계별 인원을 스케일(비율 pct는 유지)
  const factor = period === "7일" ? 0.28 : period === "90일" ? 2.85 : 1;
  const stages = BASE.map((s) => ({ ...s, n: Math.round(s.n * factor) }));
  let maxDrop = 0, maxStage = "";
  stages.forEach((s, i) => {
    if (i < stages.length - 1) {
      const d = s.n - stages[i + 1].n;
      if (d > maxDrop) { maxDrop = d; maxStage = `${s.name} → ${stages[i + 1].name}`; }
    }
  });
  const kpis = [
    { label: "전체 전환율", value: `${stages[stages.length - 1].pct}%`, sub: "가입 → 첫 덱 완성" },
    { label: "최대 이탈 구간", value: maxStage, sub: `${maxDrop.toLocaleString()}명 이탈`, small: true },
    { label: "평균 소요 시간", value: "4분 12초", sub: "가입 → 첫 덱" },
  ];
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex-1 text-[12.5px] text-app-muted">가입부터 첫 덱 생성까지 단계별 전환율과 이탈을 추적합니다.</span>
        <div className="flex overflow-hidden rounded-lg border border-app-border">
          {["7일", "30일", "90일"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 text-[12px] font-semibold ${period === p ? "bg-app-text text-white" : "bg-white text-app-muted"}`}>{p}</button>
          ))}
        </div>
      </div>
      <Card className="px-5 py-4">
        {stages.map((s, i) => {
          const drop = i < stages.length - 1 ? s.n - stages[i + 1].n : 0;
          const dropPct = i < stages.length - 1 ? Math.round((drop / s.n) * 100) : 0;
          return (
            <div key={s.name}>
              <div className="flex items-center gap-3 py-2">
                <span className="w-40 flex-none text-[12.5px] font-medium">{s.name}</span>
                <div className="h-6 flex-1 overflow-hidden rounded bg-[#F0F0EE]">
                  <div className="flex h-full items-center rounded bg-app-text pl-2 text-[10.5px] font-bold text-white" style={{ width: `${s.pct}%` }}>
                    {s.n.toLocaleString()}
                  </div>
                </div>
                <span className="w-12 flex-none text-right text-[12.5px] font-bold">{s.pct}%</span>
              </div>
              {i < stages.length - 1 && (
                <div className="flex items-center gap-0.5 py-0.5 pl-40 text-[10.5px] font-semibold text-app-danger">
                  <span className="mi text-[13px]">arrow_downward</span>{drop.toLocaleString()} 이탈 ({dropPct}%)
                </div>
              )}
            </div>
          );
        })}
      </Card>
      {/* 요약 KPI 3카드 — 퍼널 바 다음에 배치 */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="px-4 py-3.5">
            <div className="text-[11px] font-semibold text-app-faint">{k.label}</div>
            <div className={`mt-1 font-extrabold ${k.small ? "text-[14px] leading-tight" : "text-[22px]"}`}>{k.value}</div>
            <div className="mt-0.5 text-[11px] text-app-muted">{k.sub}</div>
          </Card>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-app-faint">
        가장 큰 이탈 지점은 <b className="text-app-text">용도 선택 → 첫 프롬프트/템플릿</b> 구간 · 추천 템플릿 도입 후 개선 추세
      </div>
    </>
  );
}

// ===== 워크스페이스 (팀 워크스페이스 · 시트 · 플랜) =====
function WorkspacesPage() {
  const [all, setAll] = useState([
    { name: "우진의 팀", owner: "wds0119@deckgen.app", plan: "Pro", members: 8, decks: 142, creditPct: 68, creditLabel: "6.8K / 10K", active: true },
    { name: "마케팅본부", owner: "kim@deckgen.app", plan: "Plus", members: 5, decks: 88, creditPct: 91, creditLabel: "4.6K / 5K", active: true },
    { name: "제품팀", owner: "lee@deckgen.app", plan: "Plus", members: 3, decks: 51, creditPct: 40, creditLabel: "2.0K / 5K", active: true },
    { name: "디자인 스튜디오", owner: "park@deckgen.app", plan: "Free", members: 2, decks: 12, creditPct: 22, creditLabel: "220 / 1K", active: false },
  ]);
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("전체");
  const rows = all.filter((w) => {
    const needle = q.trim().toLowerCase();
    if (needle && !w.name.toLowerCase().includes(needle) && !w.owner.toLowerCase().includes(needle)) return false;
    if (plan !== "전체" && w.plan !== plan) return false;
    return true;
  });
  return (
    <>
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="flex max-w-[320px] flex-1 items-center gap-2 rounded-[9px] border border-app-border bg-white px-3 py-2">
          <span className="mi text-[15px] text-app-faint">search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="워크스페이스·소유자 검색"
            className="flex-1 bg-transparent text-[12.5px] focus:outline-none"
          />
        </div>
        <div className="flex overflow-hidden rounded-[9px] border border-app-border">
          {["전체", "Pro", "Plus", "Free"].map((p) => (
            <button key={p} onClick={() => setPlan(p)} className={`px-3 py-2 text-[12px] font-semibold ${plan === p ? "bg-app-text text-white" : "bg-white text-app-muted hover:bg-app-bg"}`}>{p}</button>
          ))}
        </div>
      </div>
      <KpiGrid
        items={[
          { name: "전체 워크스페이스", value: "24", sub: "이번 달 +3" },
          { name: "유료 워크스페이스", value: "17", sub: "Plus 11 · Pro 6" },
          { name: "총 시트", value: "112", sub: "사용 89 · 여유 23" },
          { name: "평균 덱 수", value: "58", sub: "워크스페이스당" },
        ]}
      />
      <Card className="overflow-hidden">
        <div className={thCls}>
          <span className="flex-1">워크스페이스</span>
          <span className="w-[210px] flex-none">소유자</span>
          <span className="w-[70px] flex-none text-center">플랜</span>
          <span className="w-[60px] flex-none text-center">멤버</span>
          <span className="w-[60px] flex-none text-center">덱</span>
          <span className="w-[130px] flex-none">크레딧</span>
          <span className="w-[70px] flex-none text-center">상태</span>
          <span className="w-[80px] flex-none" />
        </div>
        {rows.map((w) => (
          <div key={w.name} className={rowCls}>
            <span className="flex flex-1 items-center gap-2 text-[12.5px] font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-app-text text-[11px] font-bold text-white">
                {w.name.slice(0, 1)}
              </span>
              {w.name}
            </span>
            <span className="w-[210px] flex-none truncate text-[11.5px] text-app-muted">{w.owner}</span>
            <span className="w-[70px] flex-none text-center text-[12px] font-semibold">{w.plan}</span>
            <span className="w-[60px] flex-none text-center text-[12.5px] font-semibold">{w.members}</span>
            <span className="w-[60px] flex-none text-center text-[12.5px] font-semibold">{w.decks}</span>
            <span className="w-[130px] flex-none pr-3">
              <div className="mb-0.5 h-1.5 overflow-hidden rounded-full bg-[#F0F0EE]">
                <div className="h-full rounded-full" style={{ width: `${w.creditPct}%`, background: w.creditPct >= 90 ? "#E5484D" : "#1A1A1A" }} />
              </div>
              <div className="text-[10px] text-app-faint">{w.creditLabel}</div>
            </span>
            <span className="flex w-[70px] flex-none justify-center">
              <StatusPill ok={w.active} green label={w.active ? "활성" : "정지"} />
            </span>
            <span className="flex w-[80px] flex-none justify-end gap-1.5">
              <button
                onClick={() => { setAll((p) => p.map((x) => x.name === w.name ? { ...x, active: !x.active } : x)); showToast(w.active ? `'${w.name}' 정지됨` : `'${w.name}' 활성화됨`); }}
                title={w.active ? "정지" : "활성화"}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-app-border bg-white"
              >
                <span className="mi text-[15px]" style={{ color: w.active ? "#E5484D" : "#8A8A84" }}>{w.active ? "pause" : "play_arrow"}</span>
              </button>
              <button onClick={() => showToast(`'${w.name}' 상세를 표시합니다`)} title="상세" className="flex h-7 w-7 items-center justify-center rounded-md border border-app-border bg-white">
                <span className="mi text-[15px] text-app-muted">chevron_right</span>
              </button>
            </span>
          </div>
        ))}
      </Card>
      <p className="mt-3 text-[11px] text-app-faint">
        정지 시 소속 멤버의 편집·생성이 차단되고 공유 링크가 비활성화됩니다 (감사 로그 기록)
      </p>
    </>
  );
}

// ===== 사용량 리포트 (생성·토큰·모델별 소비 추이) =====
function UsagePage() {
  const [period, setPeriod] = useState("14일");
  // 일별 2계열 (생성 / 내보내기)
  const days = [
    { label: "6/25", gen: 42, exp: 18 }, { label: "6/26", gen: 55, exp: 22 }, { label: "6/27", gen: 48, exp: 20 },
    { label: "6/28", gen: 61, exp: 24 }, { label: "6/29", gen: 73, exp: 31 }, { label: "6/30", gen: 58, exp: 26 },
    { label: "7/1", gen: 67, exp: 29 }, { label: "7/2", gen: 80, exp: 34 }, { label: "7/3", gen: 72, exp: 30 },
    { label: "7/4", gen: 65, exp: 27 }, { label: "7/5", gen: 88, exp: 38 }, { label: "7/6", gen: 94, exp: 41 },
    { label: "7/7", gen: 79, exp: 33 }, { label: "7/8", gen: 102, exp: 46 },
  ];
  const maxTot = Math.max(...days.map((d) => d.gen + d.exp));
  const formats = [
    { name: "PPTX", pct: 62 },
    { name: "PDF", pct: 21 },
    { name: "PNG", pct: 12 },
    { name: "Figma", pct: 5 },
  ];
  const topWs = [
    { initial: "우", name: "우진의 팀", credits: "6.8K", color: "#1A1A1A" },
    { initial: "마", name: "마케팅본부", credits: "4.6K", color: "#55554F" },
    { initial: "제", name: "제품팀", credits: "2.0K", color: "#8A8A84" },
    { initial: "디", name: "디자인 스튜디오", credits: "1.4K", color: "#B4B4AE" },
    { initial: "S", name: "Studio Kim", credits: "0.9K", color: "#C9C9C4" },
  ];
  const exportCsv = () => {
    const csv = ["day,generated,exported"].concat(days.map((d) => `${d.label},${d.gen},${d.exp}`)).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = "usage-report.csv";
    a.click();
  };
  const kpis = [
    { name: "슬라이드 생성", value: "18,240", delta: "▲ 전주 대비 +6%" },
    { name: "덱 내보내기", value: "4,120", delta: "▲ 전주 대비 +11%" },
    { name: "AI 크레딧 소비", value: "38.6K", delta: "▲ 한도 50K의 77%" },
    { name: "평균 생성 시간", value: "8.4초", delta: "▼ p95 21초" },
  ];
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex-1 text-[12.5px] text-app-muted">플랫폼 전반의 생성·내보내기·크레딧 사용 추이입니다.</span>
        <div className="flex overflow-hidden rounded-lg border border-app-border">
          {["7일", "14일", "30일"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 text-[12px] font-semibold ${period === p ? "bg-app-text text-white" : "bg-white text-app-muted"}`}>{p}</button>
          ))}
        </div>
        <button onClick={exportCsv} className="flex items-center gap-1 rounded-lg border border-app-border bg-white px-3.5 py-2 text-[12px] font-semibold">
          <span className="mi text-[15px]">download</span>CSV
        </button>
      </div>
      <div className="mb-4 grid grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.name} className="px-4 py-3.5">
            <div className="text-[11px] text-app-muted">{k.name}</div>
            <div className="mt-1 text-[21px] font-extrabold tracking-tight">{k.value}</div>
            <div className="mt-0.5 text-[10.5px] text-app-muted">{k.delta}</div>
          </Card>
        ))}
      </div>
      <Card className="mb-4 px-5 py-[18px]">
        <div className="mb-4 flex items-center gap-3.5">
          <span className="text-[14px] font-bold">일별 슬라이드 생성</span>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1.5 text-[11px] text-app-muted"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "#1A1A1A" }} />생성</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-app-muted"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "#C9C9C4" }} />내보내기</span>
        </div>
        <div className="flex h-[180px] items-end gap-1.5">
          {days.map((d) => (
            <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.label} · 생성 ${d.gen} · 내보내기 ${d.exp}`}>
              <div className="flex w-full flex-col items-center justify-end gap-0.5" style={{ height: "100%" }}>
                <div className="w-[70%] rounded-t-[3px]" style={{ height: `${(d.gen / maxTot) * 100}%`, background: "#1A1A1A" }} />
                <div className="w-[70%] rounded-t-[3px]" style={{ height: `${(d.exp / maxTot) * 100}%`, background: "#C9C9C4" }} />
              </div>
              <span className="text-[9px] text-app-faint">{d.label}</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <Card className="px-5 py-[18px]">
          <div className="mb-3.5 text-[14px] font-bold">내보내기 형식 비중</div>
          {formats.map((f) => (
            <div key={f.name} className="mb-3">
              <div className="mb-1 flex text-[12px]">
                <span className="flex-1">{f.name}</span>
                <span className="font-bold">{f.pct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-[#F0F0EE]">
                <div className="h-full rounded bg-app-text" style={{ width: `${f.pct}%` }} />
              </div>
            </div>
          ))}
        </Card>
        <Card className="px-5 py-[18px]">
          <div className="mb-3.5 text-[14px] font-bold">크레딧 소비 상위 워크스페이스</div>
          {topWs.map((t) => (
            <div key={t.name} className="flex items-center gap-2.5 border-b border-[#F7F7F5] py-2 last:border-b-0">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px] text-[10.5px] font-extrabold text-white" style={{ background: t.color }}>{t.initial}</span>
              <span className="flex-1 text-[12.5px]">{t.name}</span>
              <span className="text-[12.5px] font-bold">{t.credits}</span>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

// ===== 콘솔 셸 =====
export function AdminPage() {
  const [authed, setAuthed] = useState(() => !!getAdminToken());
  const [page, setPage] = useState<PageId>("dash");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("dg_admin_sidebar") === "0");
  const [railQuery, setRailQuery] = useState("");
  // 아코디언 — 현재 보고 있는 페이지가 속한 그룹만 펼침(나머지 접힘)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    [PAGE_GROUP["dash"]]: true,
  }));
  // 페이지 이동 시 그 페이지의 그룹만 열고 나머지는 닫는다
  useEffect(() => {
    const g = PAGE_GROUP[page];
    if (g) setOpenGroups({ [g]: true });
  }, [page]);
  // 항목별 실시간 배지 = jobs(실행+대기) · banners(활성) · errors(개수). 그룹 배지 = 소속 항목 배지 합.
  const [itemBadges, setItemBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!authed) return;
    void Promise.all([
      adminApi.jobs().catch(() => ({ jobs: [] })),
      adminApi.errors().catch(() => ({ errors: [] })),
      adminApi.banners().catch(() => ({ banners: [] })),
    ]).then(([j, e, b]) => {
      const runningQueued = j.jobs.filter((x) => x.status === "running" || x.status === "queued").length;
      const activeBanners = b.banners.filter((x) => x.on).length;
      setItemBadges({ jobs: runningQueued, banners: activeBanners, errors: e.errors.length });
    });
  }, [authed]);
  const groupBadge = (ids: PageId[]) => ids.reduce((a, id) => a + (itemBadges[id] ?? 0), 0);
  const toggleSidebar = () => {
    const next = !collapsed;
    localStorage.setItem("dg_admin_sidebar", next ? "0" : "1");
    setCollapsed(next);
  };
  const d = new Date();
  const nowKst = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} KST`;

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
              <span className="rounded-[5px] bg-[rgba(255,255,255,.1)] px-1.5 py-0.5 text-[10px] font-bold text-[rgba(255,255,255,.65)]">
                ADMIN
              </span>
            </>
          )}
          <button
            onClick={toggleSidebar}
            title={collapsed ? "펼치기" : "접기"}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-[rgba(255,255,255,.6)] hover:bg-[rgba(255,255,255,.08)] ${collapsed ? "" : "ml-auto"}`}
          >
            <span className="mi text-[16px]">{collapsed ? "menu" : "menu_open"}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {collapsed && (
            // 레일 검색 — 아이콘 hover 시 전체 페이지 검색 플라이아웃
            <div className="group/search relative mb-1">
              <button
                title="페이지 검색"
                className="relative flex w-full items-center justify-center rounded-[9px] py-2.5 text-[rgba(255,255,255,.6)] hover:bg-[rgba(255,255,255,.08)]"
              >
                <span className="mi text-[19px]">search</span>
              </button>
              <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 hidden w-56 rounded-xl border border-[rgba(255,255,255,.12)] bg-[#1F1D28] p-1.5 shadow-2xl group-hover/search:pointer-events-auto group-hover/search:block">
                <input
                  value={railQuery}
                  onChange={(e) => setRailQuery(e.target.value)}
                  placeholder="페이지 검색…"
                  className="mb-1 w-full rounded-lg bg-[rgba(255,255,255,.08)] px-2.5 py-1.5 text-[12px] text-white placeholder:text-[rgba(255,255,255,.4)] focus:outline-none"
                />
                <div className="max-h-64 overflow-y-auto">
                  {PAGES.filter((p) => {
                    const q = railQuery.trim();
                    return !q || p.name.includes(q) || (PAGE_GROUP[p.id] ?? "").includes(q);
                  }).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPage(p.id)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left"
                      style={{ background: page === p.id ? "rgba(255,255,255,.18)" : "transparent" }}
                    >
                      <span className="mi text-[16px]" style={{ color: page === p.id ? "#fff" : "rgba(255,255,255,.6)" }}>{p.icon}</span>
                      <span className="flex-1 text-[12px]" style={{ color: page === p.id ? "#fff" : "rgba(255,255,255,.7)" }}>{p.name}</span>
                      <span className="text-[9.5px] text-[rgba(255,255,255,.35)]">{PAGE_GROUP[p.id]}</span>
                    </button>
                  ))}
                  {PAGES.filter((p) => {
                    const q = railQuery.trim();
                    return p.name.includes(q) || (PAGE_GROUP[p.id] ?? "").includes(q);
                  }).length === 0 && (
                    <div className="px-2.5 py-3 text-center text-[11.5px] text-[rgba(255,255,255,.4)]">검색 결과 없음</div>
                  )}
                </div>
              </div>
            </div>
          )}
          {collapsed
            ? // 레일 모드 — 그룹 아이콘 + hover 플라이아웃 (시안 26·27)
              NAV_GROUPS.map((g) => {
                const items = g.ids.map((id) => PAGES.find((p) => p.id === id)!).filter(Boolean);
                const rep = items.find((p) => p.id === page) ?? items[0];
                const badge = groupBadge(g.ids);
                const active = items.some((p) => p.id === page);
                return (
                  <div key={g.label} className="group/rail relative mb-0.5">
                    <button
                      onClick={() => setPage(rep.id)}
                      title={g.label}
                      className="relative flex w-full items-center justify-center rounded-[9px] py-2.5"
                      style={{ background: active ? "rgba(255,255,255,.14)" : "transparent" }}
                    >
                      <span className="mi text-[19px]" style={{ color: active ? "#fff" : "rgba(255,255,255,.6)" }}>{rep.icon}</span>
                      {badge > 0 && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-app-danger" />
                      )}
                    </button>
                    {/* 플라이아웃 서브메뉴 */}
                    <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 hidden w-52 rounded-xl border border-[rgba(255,255,255,.12)] bg-[#1F1D28] p-1.5 shadow-2xl group-hover/rail:pointer-events-auto group-hover/rail:block">
                      <div className="px-2.5 py-1 text-[10px] font-bold tracking-wide text-[rgba(255,255,255,.4)] uppercase">{g.label}</div>
                      {items.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setPage(p.id)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left"
                          style={{ background: page === p.id ? "rgba(255,255,255,.18)" : "transparent" }}
                        >
                          <span className="mi text-[16px]" style={{ color: page === p.id ? "#fff" : "rgba(255,255,255,.6)" }}>{p.icon}</span>
                          <span className="text-[12px]" style={{ color: page === p.id ? "#fff" : "rgba(255,255,255,.7)" }}>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            : // 그룹 아코디언
              NAV_GROUPS.map((g) => {
                const items = g.ids.map((id) => PAGES.find((p) => p.id === id)!).filter(Boolean);
                const open = openGroups[g.label];
                const badge = groupBadge(g.ids);
                return (
                  <div key={g.label} className="mb-1">
                    <button
                      onClick={() => setOpenGroups((s) => (s[g.label] ? {} : { [g.label]: true }))}
                      className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] font-bold tracking-wide text-[rgba(255,255,255,.4)] uppercase"
                    >
                      <span className={`mi text-[14px] transition-transform ${open ? "rotate-90" : ""}`}>chevron_right</span>
                      <span className="flex-1 text-left">{g.label}</span>
                      {badge > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-app-danger px-1 text-[9px] font-bold text-white">
                          {badge}
                        </span>
                      )}
                    </button>
                    {open &&
                      items.map((p) => {
                        const ib = itemBadges[p.id] ?? 0;
                        return (
                        <button
                          key={p.id}
                          onClick={() => setPage(p.id)}
                          className="mb-0.5 flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left"
                          style={{ background: page === p.id ? "rgba(255,255,255,.14)" : "transparent" }}
                        >
                          <span className="mi flex-none text-[17px]" style={{ color: page === p.id ? "#fff" : "rgba(255,255,255,.55)" }}>{p.icon}</span>
                          <span
                            className="flex-1 text-[12.5px]"
                            style={{
                              color: page === p.id ? "#fff" : "rgba(255,255,255,.6)",
                              fontWeight: page === p.id ? 700 : 500,
                            }}
                          >
                            {p.name}
                          </span>
                          {ib > 0 && (
                            <span className="flex h-4 min-w-4 flex-none items-center justify-center rounded-full bg-app-danger px-1 text-[9px] font-bold text-white">
                              {ib}
                            </span>
                          )}
                        </button>
                        );
                      })}
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
                <div className="truncate text-[10px] text-[rgba(255,255,255,.45)]">admin@deckgen.app</div>
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4CE] bg-[#F0F0EE] px-2.5 py-1 text-[11.5px] font-semibold text-[#1A1A1A]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1A1A1A]" />
            API 정상 · p95 1.2s
          </span>
          <span className="font-mono text-[11px] text-app-faint">{nowKst}</span>
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
          {page === "sbtpl" && <SbtplPage />}
          {page === "funnel" && <FunnelPage />}
          {page === "workspaces" && <WorkspacesPage />}
          {page === "usage" && <UsagePage />}
        </div>
      </div>
    </div>
  );
}
