// 설정 모달 (Demo Act 7) + 업그레이드 모달 (Demo Act 7) — 계정 없는 MVP라 로컬 설정
import { useState } from "react";
import { themes } from "../../engine/themes";

const THEME_LIST = Object.values(themes);
import { patchSettings, useSettings } from "../../store/settingsStore";
import { showToast } from "../ui/toast";

interface Plan {
  id: "Free" | "Beginner" | "Plus" | "Pro";
  price: string;
  desc: string;
  feats: string[];
  popular?: boolean;
}
const PLANS: Plan[] = [
  { id: "Free", price: "₩0", desc: "기본 생성 · 워터마크", feats: ["일 5회 생성", "PNG 내보내기", "1인 작업"] },
  { id: "Beginner", price: "₩5,000/월", desc: "가볍게 시작", feats: ["일 30회 생성", "PDF 내보내기", "협업 2명"] },
  { id: "Plus", price: "₩10,000/월", desc: "가장 인기 있는 플랜", feats: ["무제한 생성", "PPTX·Figma 내보내기", "AI 이미지", "협업 5명"], popular: true },
  { id: "Pro", price: "₩29,000/월", desc: "팀·조직용", feats: ["무제한 + 우선 처리", "브랜드 킷", "SSO·관리자", "협업 무제한"] },
];

const COMPARE = [
  ["월간 생성", "5/일", "30/일", "무제한", "무제한"],
  ["덱당 슬라이드", "12", "20", "40", "무제한"],
  ["AI 이미지", "—", "—", "supported", "supported"],
  ["워터마크", "있음", "없음", "없음", "없음"],
  ["PPTX 내보내기", "—", "supported", "supported", "supported"],
  ["Figma 내보내기", "—", "—", "supported", "supported"],
  ["처리 속도", "표준", "표준", "빠름", "우선"],
];

export function UpgradeModal({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(20,20,26,.5)] p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-[880px] max-w-[95vw] overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-bold">플랜 업그레이드</h2>
          <button onClick={onClose} className="text-[16px] text-app-faint hover:text-app-text"><span className="mi text-[15px]">close</span></button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border p-4 ${p.popular ? "border-[1.5px] border-app-accent" : "border-app-border"}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-bold">{p.id}</span>
                {p.popular && <span className="rounded bg-app-accent-soft px-1.5 py-0.5 text-[9.5px] font-bold text-app-accent">인기</span>}
              </div>
              <div className="mt-1.5 text-[18px] font-extrabold">{p.price}</div>
              <div className="mb-2.5 text-[11px] text-app-faint">{p.desc}</div>
              <ul className="mb-3 flex flex-col gap-1">
                {p.feats.map((f) => (
                  <li key={f} className="text-[11.5px] text-app-muted">· {f}</li>
                ))}
              </ul>
              <button
                onClick={() => {
                  patchSettings({ plan: p.id });
                  showToast(`${p.id} 플랜으로 변경했어요 (시뮬레이션)`);
                }}
                disabled={s.plan === p.id}
                className={`w-full rounded-lg py-2 text-[12px] font-semibold ${
                  s.plan === p.id
                    ? "cursor-default bg-app-bg text-app-faint"
                    : "bg-app-text text-white hover:opacity-90"
                }`}
              >
                {s.plan === p.id ? "현재 플랜" : "플랜 선택"}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-app-border">
          <div className="grid grid-cols-5 border-b border-app-border bg-[#FBFBFA] px-3 py-2 text-[11px] font-bold text-app-faint">
            <span>기능</span>
            <span className="text-center">Free</span>
            <span className="text-center">Beginner</span>
            <span className="text-center">Plus</span>
            <span className="text-center">Pro</span>
          </div>
          {COMPARE.map((row) => (
            <div key={row[0]} className="grid grid-cols-5 border-b border-[#F0F0EE] px-3 py-1.5 text-[11.5px] last:border-0">
              <span className="text-app-muted">{row[0]}</span>
              {row.slice(1).map((c, i) => (
                <span key={i} className="text-center">
                  {c === "supported" ? (
                    <span className="mi text-[16px] text-app-text">check</span>
                  ) : (
                    <span className="text-app-faint">{c}</span>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#F0F0EE] px-1 py-3 last:border-0">
      <div className="flex-1">
        <div className="text-[13px]">{label}</div>
        {sub && <div className="mt-0.5 text-[11px] text-app-faint">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative h-[22px] w-[38px] flex-none rounded-full transition-colors"
      style={{ background: on ? "#1A1A1A" : "#D4D4CE" }}
    >
      <span className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all" style={{ left: on ? 18 : 2 }} />
    </button>
  );
}

export function SettingsModal({ onClose, onRerunOnboarding }: { onClose: () => void; onRerunOnboarding: () => void }) {
  const s = useSettings();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.45)] p-4" onClick={onClose}>
        <div
          className="max-h-[90vh] w-[560px] max-w-[94vw] overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,.28)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-bold">설정</h2>
            <button onClick={onClose} className="text-[16px] text-app-faint hover:text-app-text"><span className="mi text-[15px]">close</span></button>
          </div>

          {/* 계정 */}
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-app-border p-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-app-text text-[14px] font-bold text-white">우</span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">우진</div>
              <div className="text-[11.5px] text-app-faint">woojin@example.com · {s.plan} 플랜</div>
            </div>
            <button onClick={() => setUpgradeOpen(true)} className="rounded-lg bg-app-text px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90">
              업그레이드
            </button>
          </div>

          <SectionTitle>브랜드 킷 — 슬라이드 마스터</SectionTitle>
          <Row label="로고 텍스트">
            <input
              value={s.brandLogo}
              onChange={(e) => patchSettings({ brandLogo: e.target.value })}
              placeholder="회사명"
              className="w-40 rounded-lg border border-app-border px-2.5 py-1.5 text-[12px] focus:border-app-accent focus:outline-none"
            />
          </Row>
          <Row label="브랜드 색" sub="모노크롬 v2 — 그레이 스케일">
            <div className="flex gap-1.5">
              {["", "#1A1A1A", "#55554F", "#8A8A84", "#C9C9C4"].map((c) => (
                <button
                  key={c || "def"}
                  onClick={() => patchSettings({ brandAccent: c })}
                  className={`h-6 w-6 rounded-md border ${s.brandAccent === c ? "border-[1.5px] border-app-text" : "border-black/10"}`}
                  style={{ background: c || "#E4E4E0" }}
                  title={c || "테마 기본"}
                />
              ))}
            </div>
          </Row>
          <Row label="푸터 표시" sub="모든 슬라이드 하단에 로고·페이지">
            <Toggle on={s.brandFooter} onClick={() => patchSettings({ brandFooter: !s.brandFooter })} />
          </Row>
          {s.brandFooter && (
            <Row label="푸터 문구">
              <input
                value={s.brandFooterText}
                onChange={(e) => patchSettings({ brandFooterText: e.target.value })}
                placeholder="© 2026 회사명"
                className="w-40 rounded-lg border border-app-border px-2.5 py-1.5 text-[12px] focus:border-app-accent focus:outline-none"
              />
            </Row>
          )}

          <div className="mt-4" />
          <SectionTitle>기본 생성 설정</SectionTitle>
          <Row label="생성 언어">
            <select
              value={s.genLang}
              onChange={(e) => patchSettings({ genLang: e.target.value as never })}
              className="rounded-lg border border-app-border px-2.5 py-1.5 text-[12px] focus:outline-none"
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="mix">혼합</option>
            </select>
          </Row>
          <Row label="기본 테마">
            <select
              value={s.defaultThemeId}
              onChange={(e) => patchSettings({ defaultThemeId: e.target.value })}
              className="rounded-lg border border-app-border px-2.5 py-1.5 text-[12px] focus:outline-none"
            >
              {THEME_LIST.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Row>
          <Row label="기본 슬라이드 수">
            <div className="flex items-center overflow-hidden rounded-lg border border-app-border">
              <button onClick={() => patchSettings({ defaultCount: Math.max(3, s.defaultCount - 1) })} className="border-r border-app-border px-2.5 py-1 text-[13px]"><span className="mi text-[16px]">remove</span></button>
              <span className="px-3 text-[12px] font-semibold">{s.defaultCount}장</span>
              <button onClick={() => patchSettings({ defaultCount: Math.min(12, s.defaultCount + 1) })} className="border-l border-app-border px-2.5 py-1 text-[13px]">+</button>
            </div>
          </Row>

          <div className="mt-4" />
          <SectionTitle>에디터</SectionTitle>
          <Row label="발표자 노트 표시">
            <Toggle on={s.showNotes} onClick={() => patchSettings({ showNotes: !s.showNotes })} />
          </Row>
          <Row label="슬라이드 전환 효과">
            <div className="flex overflow-hidden rounded-lg border border-app-border">
              {(["slide", "fade", "zoom", "none"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => patchSettings({ transition: t })}
                  className={`border-l border-app-border px-2.5 py-1 text-[11px] font-semibold first:border-l-0 ${s.transition === t ? "bg-app-accent-soft text-app-accent" : "text-app-faint"}`}
                >
                  {t === "slide" ? "슬라이드" : t === "fade" ? "페이드" : t === "zoom" ? "줌" : "없음"}
                </button>
              ))}
            </div>
          </Row>

          <div className="mt-4" />
          <SectionTitle>데이터</SectionTitle>
          <Row label="온보딩 다시 보기">
            <button onClick={() => { onClose(); onRerunOnboarding(); }} className="rounded-lg border border-app-border bg-white px-3 py-1.5 text-[12px] font-semibold hover:border-app-accent">
              실행
            </button>
          </Row>
          <Row label="모든 로컬 데이터 삭제" sub="저장된 덱·설정을 모두 지웁니다">
            <button
              onClick={() => {
                if (!confirm("저장된 모든 덱과 설정을 삭제할까요? 되돌릴 수 없습니다.")) return;
                Object.keys(localStorage).filter((k) => k.startsWith("deckgen:")).forEach((k) => localStorage.removeItem(k));
                showToast("로컬 데이터를 모두 삭제했어요");
                location.reload();
              }}
              className="rounded-lg border border-[#F5C6C8] bg-[#FFF0F0] px-3 py-1.5 text-[12px] font-semibold text-app-danger"
            >
              삭제
            </button>
          </Row>
        </div>
      </div>
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
    </>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <p className="mb-1 text-[11px] font-bold tracking-[.06em] text-app-faint">{children}</p>;
}
