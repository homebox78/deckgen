// DeckGen 브랜드 로고 (프로토타입 시안 1:1) — 어두운 라운드 사각형 + 슬라이드 글리프 + 원 2개.
// 모든 화면(홈·로그인·에디터·아웃라인·워크스페이스)에서 이 컴포넌트만 사용한다.
export function Logo({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      aria-label="DeckGen"
    >
      <rect width="24" height="24" rx="7" fill="#1A1A1A" />
      <rect x="4.5" y="5.5" width="15" height="10.5" rx="2" fill="#FFFFFF" />
      <rect x="7" y="8" width="7.5" height="2" rx="1" fill="#1A1A1A" />
      <rect x="7" y="11.5" width="5" height="1.6" rx="0.8" fill="rgba(26,26,26,.4)" />
      <circle cx="14.6" cy="17.3" r="2.8" fill="#FFFFFF" stroke="#1A1A1A" strokeWidth="1.2" />
      <circle cx="18.9" cy="17.3" r="2.8" fill="rgba(255,255,255,.6)" stroke="#1A1A1A" strokeWidth="1.2" />
    </svg>
  );
}
