// 로그인/회원가입 (시안 프로토타입 01·02) — 계정 없는 MVP라 클라 시뮬레이션(입력 후 홈 진입)
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../ui/Logo";
import { showToast } from "../ui/toast";

type Tab = "login" | "signup";

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16z" />
      <path fill="#FBBC05" d="M10.4 28.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.6 2.1-8.8 2.1-6.4 0-11.7-3.8-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

type Mode = "main" | "forgot" | "verify";

export function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("login");
  const [mode, setMode] = useState<Mode>("main");
  const [email, setEmail] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "signup") {
      setMode("verify"); // 가입 → 이메일 인증 화면
      return;
    }
    showToast("로그인되었어요");
    navigate("/");
  };
  const oauth = (who: string) => showToast(`${who} 계정으로 계속합니다 (데모)`);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="w-[460px] max-w-full rounded-2xl border border-app-border bg-app-surface p-8 shadow-[0_10px_40px_rgba(0,0,0,.06)]">
        <div className="mb-6 flex items-center gap-2.5">
          <Logo size={26} />
          <span className="text-[16px] font-bold tracking-tight">DeckGen</span>
        </div>
        {children}
      </div>
    </div>
  );

  // 비밀번호 재설정 화면
  if (mode === "forgot") {
    return (
      <Shell>
        <h1 className="text-[18px] font-bold">비밀번호 재설정</h1>
        <p className="mt-1 mb-5 text-[12.5px] text-app-muted">
          가입한 이메일로 재설정 링크를 보내드려요.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            showToast(`${email || "메일함"}으로 재설정 링크를 보냈어요 (데모)`);
            setMode("main");
          }}
          className="flex flex-col gap-2.5"
        >
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="rounded-xl border border-app-border px-3.5 py-2.5 text-[13px] focus:border-app-accent focus:outline-none"
          />
          <button type="submit" className="mt-1 rounded-xl bg-app-accent py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90">
            재설정 링크 보내기
          </button>
        </form>
        <button onClick={() => setMode("main")} className="mt-4 flex w-full items-center justify-center gap-1 text-[12px] text-app-muted hover:text-app-text">
          <span className="mi text-[15px]">arrow_back</span>로그인으로 돌아가기
        </button>
      </Shell>
    );
  }

  // 이메일 인증 화면 (가입 후)
  if (mode === "verify") {
    return (
      <Shell>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-accent-soft">
            <span className="mi text-[28px] text-app-accent">mark_email_read</span>
          </span>
          <h1 className="mt-4 text-[18px] font-bold">메일함을 확인하세요</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-app-muted">
            <b className="text-app-text">{email || "입력한 이메일"}</b>로 인증 메일을 보냈어요.
            <br />
            메일의 링크를 눌러 가입을 완료하세요.
          </p>
          <button
            onClick={() => {
              showToast("이메일 인증 완료 — 환영합니다!");
              navigate("/");
            }}
            className="mt-5 w-full rounded-xl bg-app-accent py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90"
          >
            인증 완료했어요 (시뮬레이션)
          </button>
          <button onClick={() => { setMode("main"); setTab("signup"); }} className="mt-3 flex items-center gap-1 text-[12px] text-app-muted hover:text-app-text">
            <span className="mi text-[15px]">arrow_back</span>다른 이메일로 가입
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="w-[460px] max-w-full rounded-2xl border border-app-border bg-app-surface p-8 shadow-[0_10px_40px_rgba(0,0,0,.06)]">
        {/* 로고 */}
        <div className="mb-6 flex items-center gap-2.5">
          <Logo size={26} />
          <span className="text-[16px] font-bold tracking-tight">DeckGen</span>
        </div>

        {/* 탭 토글 */}
        <div className="mb-5 flex rounded-xl bg-app-bg p-1">
          {(
            [
              ["login", "로그인"],
              ["signup", "회원가입"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-colors ${
                tab === k ? "bg-white text-app-text shadow-sm" : "text-app-muted"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2.5">
          {tab === "signup" && (
            <input
              required
              placeholder="이름"
              className="rounded-xl border border-app-border px-3.5 py-2.5 text-[13px] focus:border-app-accent focus:outline-none"
            />
          )}
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="rounded-xl border border-app-border px-3.5 py-2.5 text-[13px] focus:border-app-accent focus:outline-none"
          />
          <input
            required
            type="password"
            placeholder={tab === "signup" ? "비밀번호 (8자 이상)" : "비밀번호"}
            minLength={tab === "signup" ? 8 : undefined}
            className="rounded-xl border border-app-border px-3.5 py-2.5 text-[13px] focus:border-app-accent focus:outline-none"
          />
          <button
            type="submit"
            className="mt-1 rounded-xl bg-app-accent py-2.5 text-[13.5px] font-semibold text-white hover:opacity-90"
          >
            {tab === "login" ? "로그인" : "가입하기"}
          </button>
        </form>

        {tab === "login" && (
          <button
            onClick={() => setMode("forgot")}
            className="mt-3 w-full text-center text-[12px] text-app-muted hover:text-app-text"
          >
            비밀번호를 잊으셨나요?
          </button>
        )}

        {/* 또는 구분선 */}
        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-app-border" />
          <span className="text-[11.5px] text-app-faint">또는</span>
          <span className="h-px flex-1 bg-app-border" />
        </div>

        {/* OAuth */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => oauth("Google")}
            className="flex items-center justify-center gap-2 rounded-xl border border-app-border bg-white py-2.5 text-[13px] font-semibold hover:bg-app-bg"
          >
            <GoogleG />
            Google로 계속하기
          </button>
          <button
            onClick={() => oauth("카카오")}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-2.5 text-[13px] font-semibold text-[#191600] hover:brightness-95"
          >
            <span className="mi text-[16px]">chat_bubble</span>
            카카오로 계속하기
          </button>
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-app-faint">
          계속하면 이용약관 및 개인정보처리방침에
          <br />
          동의하는 것으로 간주됩니다
        </p>
      </div>
    </div>
  );
}
