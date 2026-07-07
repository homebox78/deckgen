// 키보드 단축키 — 그룹화(탐색 / 요소 편집 / 발표). ? 로 열기.
interface Props {
  onClose: () => void;
}

const GROUPS: { label: string; items: [string, string][] }[] = [
  {
    label: "탐색",
    items: [
      ["← / →", "이전 / 다음 슬라이드"],
      ["F", "슬라이드 검색"],
      ["?", "이 도움말 열기"],
    ],
  },
  {
    label: "요소 편집",
    items: [
      ["더블클릭", "텍스트 편집"],
      ["드래그", "이동 (스냅 가이드)"],
      ["Ctrl+C / V", "복사 / 붙여넣기"],
      ["Ctrl+D", "복제"],
      ["Ctrl+G", "그룹화 / 해제"],
      ["[ / ]", "z-순서 뒤/앞으로"],
      ["방향키", "1px 이동 (Shift 10px)"],
      ["Delete", "삭제"],
    ],
  },
  {
    label: "발표",
    items: [
      ["Space / Enter", "다음 슬라이드"],
      ["N", "발표자 노트 토글"],
      ["Esc", "발표 종료"],
    ],
  },
];

export function ShortcutsModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,20,26,.45)] p-4"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-w-[94vw] rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[16px] font-bold">키보드 단축키</p>
          <button
            onClick={onClose}
            className="rounded-lg border border-app-border bg-white px-2.5 py-1 text-[13px] text-app-muted hover:border-app-accent"
          >
            <span className="mi text-[15px]">close</span>
          </button>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 text-[11px] font-bold tracking-wide text-app-faint uppercase">
                {g.label}
              </p>
              <div className="space-y-1">
                {g.items.map(([k, d]) => (
                  <div key={k} className="flex items-center gap-2 text-[12.5px]">
                    <kbd className="shrink-0 rounded-md border border-app-border bg-app-bg px-1.5 py-0.5 font-mono text-[11px] font-semibold text-app-text">
                      {k}
                    </kbd>
                    <span className="text-app-muted">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
