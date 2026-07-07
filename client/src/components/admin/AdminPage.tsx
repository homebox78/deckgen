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
  | "settings";

const PAGES: { id: PageId; name: string; desc: string }[] = [
  { id: "dash", name: "대시보드", desc: "서비스 전체 현황 · 실데이터" },
  { id: "users", name: "사용자 관리", desc: "협업 참여자 · 차단" },
  { id: "jobs", name: "생성 작업 큐", desc: "AI 파이프라인 이벤트" },
  { id: "errors", name: "오류 로그", desc: "미해결 오류 그룹" },
  { id: "audit", name: "감사 로그", desc: "append-only 관리자 기록" },
  { id: "banners", name: "공지 / 배너", desc: "사용자 화면 상단 안내 관리" },
  { id: "templates", name: "템플릿 관리", desc: "홈 갤러리 노출·순서·PRO 지정" },
  { id: "decks", name: "덱 · 공유 관리", desc: "공유 링크 · 멤버 · 강제 잠금" },
  { id: "collab", name: "초대 · 댓글", desc: "초대 메일 상태 · 댓글 모더레이션" },
  { id: "models", name: "AI 모델", desc: "플랜별 노출 · 크레딧 비용" },
  { id: "apikeys", name: "API 키 관리", desc: "서버 연동 키 · 회전 · 폐기" },
  { id: "credits", name: "크레딧 사용 내역", desc: "모델별 소모 · 로그" },
  { id: "plans", name: "플랜 · 결제", desc: "플랜 정의 (결제 연동 2차)" },
  { id: "settings", name: "서비스 설정", desc: "한도·점검 모드·모델 정책" },
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
    </>
  );
}

function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
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
          <span className="flex-[1.6]">사용자</span>
          <span className="flex-1">참여 덱 수</span>
          <span className="flex-1">최근 활동</span>
          <span className="flex-1">상태</span>
          <span className="w-[110px] flex-none" />
        </div>
        {rows.map((u) => (
          <div key={u.name} className="flex items-center border-b border-[#F0F0EE] px-[18px] py-[11px]">
            <div className="flex flex-[1.6] items-center gap-2.5">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-app-accent text-[11px] font-bold text-white">
                {u.name[0]}
              </span>
              <span className="text-[12.5px] font-semibold">{u.name}</span>
            </div>
            <span className="flex-1 text-[12.5px]">{u.decks}</span>
            <span className="flex-1 text-[12px] text-app-muted">{rel(u.last)}</span>
            <span className="flex-1">
              <StatusPill ok={!u.blocked} label={u.blocked ? "차단됨" : "활성"} />
            </span>
            <span className="flex w-[110px] flex-none justify-end">
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

// ===== 콘솔 셸 =====
export function AdminPage() {
  const [authed, setAuthed] = useState(() => !!getAdminToken());
  const [page, setPage] = useState<PageId>("dash");

  if (!authed) return <AdminLogin onAuthed={() => setAuthed(true)} />;
  const cur = PAGES.find((p) => p.id === page)!;

  return (
    <div className="flex h-screen overflow-hidden bg-app-bg">
      {/* 사이드바 */}
      <div className="flex w-[216px] flex-none flex-col bg-[#17151F] px-3 py-4">
        <div className="flex items-center gap-[9px] px-2.5 pb-[18px] pt-1.5">
          <span className="h-[22px] w-[22px] rounded-md bg-app-accent" />
          <span className="text-[14px] font-bold text-white">DeckGen</span>
          <span className="rounded-[5px] bg-[rgba(139,107,255,.15)] px-1.5 py-0.5 text-[10px] font-bold text-[#8B6BFF]">
            ADMIN
          </span>
        </div>
        {PAGES.map((p) => (
          <button
            key={p.id}
            onClick={() => setPage(p.id)}
            className="mb-0.5 flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left"
            style={{ background: page === p.id ? "rgba(139,107,255,.16)" : "transparent" }}
          >
            <span
              className="h-[7px] w-[7px] flex-none rounded-[2px]"
              style={{ background: page === p.id ? "#8B6BFF" : "rgba(255,255,255,.2)" }}
            />
            <span
              className="flex-1 text-[13px]"
              style={{
                color: page === p.id ? "#fff" : "rgba(255,255,255,.6)",
                fontWeight: page === p.id ? 700 : 500,
              }}
            >
              {p.name}
            </span>
          </button>
        ))}
        <div className="mt-auto flex items-center gap-[9px] border-t border-[rgba(255,255,255,.1)] pl-2.5 pt-3">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-app-accent text-[11px] font-bold text-white">
            관
          </span>
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
        </div>
      </div>
    </div>
  );
}
