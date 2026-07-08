// 온보딩 (Demo Act 1) — 풀페이지 3단계: 언어 → 용도 멀티선택 → 준비완료 + 추천 템플릿. 첫 실행/설정 재실행.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { patchSettings } from "../../store/settingsStore";

const LANGS = [
  ["ko", "한국어"],
  ["en", "English"],
  ["ja", "日本語"],
  ["zh", "中文 (简)"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["pt", "Português"],
] as const;

// 언어별 미니 CSS 플래그 (국기 색 그라디언트)
const FLAG: Record<string, string> = {
  ko: "linear-gradient(#fff 50%, #fff 50%)", // 흰 바탕(간이) — 아래 마커로 대체
  en: "linear-gradient(90deg,#B22234 33%,#fff 33% 66%,#3C3B6E 66%)",
  ja: "radial-gradient(circle,#BC002D 30%,#fff 30%)",
  zh: "linear-gradient(#DE2910,#DE2910)",
  es: "linear-gradient(#AA151B 25%,#F1BF00 25% 75%,#AA151B 75%)",
  fr: "linear-gradient(90deg,#0055A4 33%,#fff 33% 66%,#EF4135 66%)",
  de: "linear-gradient(#000 33%,#DD0000 33% 66%,#FFCE00 66%)",
  pt: "linear-gradient(90deg,#046A38 40%,#DA020E 40%)",
};

const FOCUS = [
  ["pitch", "Startup Pitch", "투자 유치 및 IR 덱"],
  ["report", "Business Report", "전략, 분석 및 인사이트"],
  ["academic", "Academic", "연구 및 학습 발표"],
  ["sales", "Sales Deck", "제안서 및 세일즈 덱"],
  ["other", "Other", "그 외 다른 목적"],
] as const;

// focus별 추천 템플릿 (Step3)
const RECS: Record<string, { name: string; sub: string; prompt: string }[]> = {
  sales: [
    { name: "영업 제안서", sub: "고객 맞춤 제안 6장", prompt: "고객사 맞춤 영업 제안서를 만들어줘: 문제, 솔루션, 도입 효과, 가격, 다음 단계" },
    { name: "제품 소개서", sub: "기능·가치 중심", prompt: "제품 소개서를 만들어줘: 핵심 가치, 주요 기능, 사용 사례, 도입 절차" },
    { name: "경영바우처 제안서", sub: "지원사업 제안 5장", prompt: "소상공인 경영바우처 지원 제안서를 만들어줘" },
  ],
  pitch: [
    { name: "시드 피치덱", sub: "투자 유치 8장", prompt: "시드 투자유치 피치덱을 만들어줘: 문제, 솔루션, 시장, 트랙션, 팀, 투자요청" },
    { name: "IR 업데이트", sub: "투자자 보고 6장", prompt: "분기 투자자 IR 보고 덱을 만들어줘: 핵심 지표, 성과, 계획" },
    { name: "제품 소개서", sub: "기능·가치 중심", prompt: "제품 소개서를 만들어줘: 핵심 가치, 주요 기능, 사용 사례" },
  ],
  report: [
    { name: "분기 실적 보고", sub: "실적·지표 6장", prompt: "분기 실적 보고서를 만들어줘: 매출, 핵심 지표, 이슈, 다음 분기 계획" },
    { name: "시장 분석", sub: "인사이트 중심", prompt: "시장 분석 보고서를 만들어줘: 시장 규모, 트렌드, 경쟁, 기회" },
    { name: "전략 제안", sub: "의사결정용 5장", prompt: "전략 제안 덱을 만들어줘: 현황, 문제, 전략 옵션, 권고안" },
  ],
  academic: [
    { name: "연구 발표", sub: "학술 발표 8장", prompt: "연구 발표 덱을 만들어줘: 배경, 연구 질문, 방법, 결과, 결론" },
    { name: "세미나 자료", sub: "강의·학습용", prompt: "세미나 강의 자료를 만들어줘: 개념 소개, 핵심 이론, 예시, 정리" },
    { name: "논문 요약", sub: "핵심 정리 5장", prompt: "논문 핵심 요약 덱을 만들어줘: 문제, 기여, 방법, 실험, 한계" },
  ],
  other: [
    { name: "제안서", sub: "범용 제안 5장", prompt: "제안서를 만들어줘: 배경, 목표, 방안, 기대효과, 일정" },
    { name: "회사 소개", sub: "브랜드 소개", prompt: "회사 소개 덱을 만들어줘: 비전, 연혁, 사업, 팀, 연락처" },
    { name: "행사 안내", sub: "이벤트 홍보 5장", prompt: "행사 안내 덱을 만들어줘: 개요, 프로그램, 참가 방법, 문의" },
  ],
};

export function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<string>("ko");
  const [focus, setFocus] = useState<string[]>([]);

  const finish = () => {
    patchSettings({ onboardingDone: true, genLang: (lang as never) ?? "ko" });
    onDone();
  };
  const primaryFocus = focus[0] ?? "sales";
  const focusName = FOCUS.find((f) => f[0] === primaryFocus)?.[1] ?? "Sales Deck";
  const recs = RECS[primaryFocus] ?? RECS.sales;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-app-bg">
      {/* 상단 진행바 + 건너뛰기 */}
      <div className="flex items-center gap-4 border-b border-app-border bg-app-surface px-6 py-3.5">
        <div className="flex flex-1 gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${i <= step ? "bg-app-text" : "bg-app-border"}`}
            />
          ))}
        </div>
        {step < 2 && (
          <button onClick={finish} className="text-[12px] text-app-faint hover:text-app-text">
            건너뛰기
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 py-10">
        <div className="w-[560px] max-w-full">
          {step === 0 && (
            <>
              <p className="mb-1.5 text-[11px] font-bold tracking-[.14em] text-app-faint uppercase">언어</p>
              <h2 className="text-[24px] font-bold tracking-tight">주로 어떤 언어로 작업하시나요?</h2>
              <p className="mt-1.5 mb-6 text-[13.5px] text-app-muted">
                선택한 언어를 기준으로 DeckGen이 슬라이드를 만들어 드립니다.
              </p>
              <div className="grid grid-cols-4 gap-2.5">
                {LANGS.map(([id, name]) => (
                  <button
                    key={id}
                    onClick={() => setLang(id)}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-4 text-[13px] font-semibold ${
                      lang === id
                        ? "border-[1.5px] border-app-text bg-app-text text-white"
                        : "border-app-border bg-white hover:border-app-muted"
                    }`}
                  >
                    <span
                      className="h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px] border border-black/10"
                      style={{ background: FLAG[id] ?? "#E4E4E0" }}
                    />
                    {name}
                  </button>
                ))}
              </div>
              <div className="mt-7 flex justify-end">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 rounded-xl bg-app-accent px-6 py-3 text-[13.5px] font-semibold text-white hover:opacity-90"
                >
                  계속<span className="mi text-[16px]">arrow_forward</span>
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="mb-1.5 text-[11px] font-bold tracking-[.14em] text-app-faint uppercase">Your Focus</p>
              <h2 className="text-[24px] font-bold tracking-tight">어떤 프레젠테이션을 만들 예정인가요?</h2>
              <p className="mt-1.5 mb-6 text-[13.5px] text-app-muted">
                해당하는 항목을 모두 선택해 주세요. 작업 방식에 맞는 템플릿과 제안을 맞춰 드립니다.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {FOCUS.map(([id, name, desc]) => {
                  const on = focus.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() => setFocus((p) => (on ? p.filter((x) => x !== id) : [...p, id]))}
                      className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-left ${
                        on ? "border-[1.5px] border-app-text bg-app-text text-white" : "border-app-border bg-white hover:border-app-muted"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold">{name}</div>
                        <div className={`mt-0.5 text-[11.5px] ${on ? "text-white/60" : "text-app-faint"}`}>{desc}</div>
                      </div>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          on ? "border-app-text bg-app-text text-white" : "border-app-border"
                        }`}
                      >
                        {on ? <span className="mi text-[13px]">check</span> : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-7 flex justify-between">
                <button
                  onClick={() => setStep(0)}
                  className="flex items-center gap-1 rounded-xl border border-app-border bg-white px-5 py-3 text-[13.5px] font-semibold hover:border-app-accent"
                >
                  <span className="mi text-[16px]">arrow_back</span>뒤로
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1 rounded-xl bg-app-accent px-6 py-3 text-[13.5px] font-semibold text-white hover:opacity-90"
                >
                  계속<span className="mi text-[16px]">arrow_forward</span>
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* 다크 히어로 */}
              <div className="rounded-2xl bg-app-text p-7 text-white">
                <p className="text-[22px] font-bold leading-tight">
                  준비가 끝났습니다.
                  <br />
                  이제 시작해볼게요.
                </p>
                <p className="mt-2.5 text-[13px] leading-relaxed text-white/70">
                  주제를 입력하면 DeckGen이 몇 초 안에 완성도 높은 덱을 만들어 드립니다.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px]">
                    {LANGS.find((l) => l[0] === lang)?.[1]}
                  </span>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px]">{focusName}</span>
                </div>
              </div>

              {/* 추천 템플릿 */}
              <p className="mt-6 mb-2.5 text-[13.5px] font-bold">{focusName} 추천 템플릿</p>
              <div className="flex flex-col gap-2">
                {recs.map((r) => (
                  <button
                    key={r.name}
                    onClick={() => {
                      patchSettings({ onboardingDone: true, genLang: (lang as never) ?? "ko" });
                      onDone();
                      navigate("/", { state: { prefillPrompt: r.prompt } });
                    }}
                    className="flex items-center gap-3 rounded-xl border border-app-border bg-white px-4 py-3 text-left hover:border-app-accent"
                  >
                    <span className="flex h-10 w-14 shrink-0 flex-col justify-center gap-1 rounded-md border border-app-border-soft bg-white px-2">
                      <span className="h-[3px] w-2/3 rounded-sm bg-app-accent" />
                      <span className="h-[2px] w-full rounded-sm bg-[#E4E4E0]" />
                      <span className="h-[2px] w-4/5 rounded-sm bg-[#E4E4E0]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold">{r.name}</div>
                      <div className="text-[11.5px] text-app-faint">{r.sub}</div>
                    </div>
                    <span className="mi text-[18px] text-app-faint">chevron_right</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] text-app-faint">
                템플릿을 고르면 주제·구성·테마가 미리 채워집니다.
              </p>

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 rounded-xl border border-app-border bg-white px-5 py-3 text-[13.5px] font-semibold hover:border-app-accent"
                >
                  <span className="mi text-[16px]">arrow_back</span>뒤로
                </button>
                <button
                  onClick={finish}
                  className="rounded-xl bg-app-accent px-6 py-3 text-[13.5px] font-semibold text-white hover:opacity-90"
                >
                  빈 프롬프트로 시작
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
