// 온보딩 마법사 (Demo Act 1) — 언어 선택 + 용도 멀티선택 + 완료. 첫 실행 시 or 설정에서 재실행.
import { useState } from "react";
import { patchSettings } from "../../store/settingsStore";

const LANGS = [
  ["ko", "한국어", "🇰🇷"],
  ["en", "English", "🇺🇸"],
  ["ja", "日本語", "🇯🇵"],
  ["zh", "中文 (简)", "🇨🇳"],
  ["es", "Español", "🇪🇸"],
  ["fr", "Français", "🇫🇷"],
  ["de", "Deutsch", "🇩🇪"],
  ["pt", "Português", "🇵🇹"],
] as const;

const FOCUS = [
  ["pitch", "Startup Pitch", "투자 유치 및 IR 덱"],
  ["report", "Business Report", "전략, 분석 및 인사이트"],
  ["academic", "Academic", "연구 및 학습 발표"],
  ["sales", "Sales Deck", "제안서 및 세일즈 덱"],
  ["other", "Other", "그 외 다른 목적"],
] as const;

export function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<string>("ko");
  const [focus, setFocus] = useState<string[]>([]);

  const finish = () => {
    patchSettings({ onboardingDone: true, genLang: (lang as never) ?? "ko" });
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(20,20,26,.55)] p-4">
      <div className="w-[520px] max-w-[94vw] rounded-2xl bg-white p-7 shadow-[0_24px_64px_rgba(0,0,0,.4)]">
        {/* 진행 점 */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-app-text" : "w-1.5 bg-app-border"}`} />
            ))}
          </div>
          {step < 2 && (
            <button onClick={finish} className="text-[12px] text-app-faint hover:text-app-text">건너뛰기</button>
          )}
        </div>

        {step === 0 && (
          <>
            <h2 className="text-[19px] font-bold">주로 어떤 언어로 작업하시나요?</h2>
            <p className="mt-1 mb-4 text-[12.5px] text-app-muted">생성 언어의 기본값이 됩니다. 언제든 바꿀 수 있어요.</p>
            <div className="grid grid-cols-4 gap-2">
              {LANGS.map(([id, name, flag]) => (
                <button
                  key={id}
                  onClick={() => setLang(id)}
                  className={`flex flex-col items-center gap-1 rounded-xl border py-3 ${
                    lang === id ? "border-[1.5px] border-app-text bg-app-accent-soft" : "border-app-border hover:border-app-muted"
                  }`}
                >
                  <span className="text-[22px]">{flag}</span>
                  <span className="text-[11px] font-semibold">{name}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={() => setStep(1)} className="rounded-lg bg-app-text px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">계속 →</button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-[19px] font-bold">어떤 프레젠테이션을 만들 예정인가요?</h2>
            <p className="mt-1 mb-4 text-[12.5px] text-app-muted">여러 개 선택할 수 있어요.</p>
            <div className="flex flex-col gap-2">
              {FOCUS.map(([id, name, desc]) => {
                const on = focus.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => setFocus((p) => (on ? p.filter((x) => x !== id) : [...p, id]))}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                      on ? "border-[1.5px] border-app-text bg-app-accent-soft" : "border-app-border hover:border-app-muted"
                    }`}
                  >
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] ${on ? "border-app-text bg-app-text text-white" : "border-app-border"}`}>
                      {on ? "✓" : ""}
                    </span>
                    <div>
                      <div className="text-[13px] font-semibold">{name}</div>
                      <div className="text-[11.5px] text-app-faint">{desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex justify-between">
              <button onClick={() => setStep(0)} className="rounded-lg border border-app-border px-4 py-2.5 text-[13px] font-semibold hover:border-app-accent">← 뒤로</button>
              <button onClick={() => setStep(2)} className="rounded-lg bg-app-text px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">계속 →</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="rounded-2xl bg-app-text p-6 text-center text-white">
              <p className="text-[20px] font-bold">준비가 끝났습니다.</p>
              <p className="mt-1 text-[13px] text-white/70">이제 시작해볼게요.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px]">
                  {LANGS.find((l) => l[0] === lang)?.[1]}
                </span>
                {focus.map((f) => (
                  <span key={f} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px]">
                    {FOCUS.find((x) => x[0] === f)?.[1]}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-3 text-center text-[11.5px] text-app-faint">설정에서 언제든지 기본 설정을 변경할 수 있습니다.</p>
            <div className="mt-4 flex justify-center">
              <button onClick={finish} className="rounded-lg bg-app-text px-6 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">생성 시작하기</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
