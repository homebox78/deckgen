// 알림 종 — 안읽음 배지 + 드롭다운(작성자·본문·슬라이드 점프) + 실시간 토스트
import { useEffect, useRef, useState } from "react";
import { markAllRead, markRead, useNotifs, type Notif } from "../../store/notifStore";

interface Props {
  deckId: string;
  onJump: (slideIndex: number) => void;
}

function relTime(t: number): string {
  const d = Date.now() - t;
  if (d < 60_000) return "방금";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}분 전`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}시간 전`;
  return `${Math.floor(d / 86_400_000)}일 전`;
}

export function NotificationBell({ deckId, onJump }: Props) {
  const notifs = useNotifs(deckId);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notif | null>(null);
  const unread = notifs.filter((n) => !n.read).length;
  const seenIds = useRef<Set<string>>(new Set(notifs.map((n) => n.id)));

  // 새 알림 도착 → 실시간 토스트
  useEffect(() => {
    const fresh = notifs.find((n) => !seenIds.current.has(n.id));
    notifs.forEach((n) => seenIds.current.add(n.id));
    if (fresh && !open) {
      setToast(fresh);
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [notifs, open]);

  return (
    <span className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          setToast(null);
        }}
        title="알림"
        className={`relative flex h-8 w-8 items-center justify-center rounded-[9px] border text-[14px] text-app-text hover:border-app-accent ${
          open ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-white"
        }`}
      >
        <span className="mi text-[17px]">notifications</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full border-[1.5px] border-white bg-app-danger px-1 text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-app-border bg-white shadow-[0_10px_32px_rgba(0,0,0,.16)]">
            <div className="flex items-center gap-2 border-b border-app-border-soft px-3.5 py-3">
              <span className="flex-1 text-[13px] font-bold">알림</span>
              <button
                onClick={() => markAllRead(deckId)}
                className="text-[11px] font-semibold text-app-muted hover:text-app-text"
              >
                모두 읽음
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="px-4 py-7 text-center text-[12px] text-app-faint">
                  새 알림이 없어요
                </div>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      markRead(deckId, n.id);
                      onJump(n.slideIndex);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start gap-2.5 border-b border-app-border-soft px-3.5 py-2.5 text-left last:border-b-0 hover:bg-app-bg ${
                      n.read ? "" : "bg-app-accent-soft/40"
                    }`}
                  >
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ background: n.color }}
                    >
                      {n.who.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] leading-snug text-app-text">{n.text}</span>
                      <span className="mt-0.5 block text-[10.5px] text-app-faint">
                        {relTime(n.at)} · 슬라이드 {n.slideIndex + 1}
                      </span>
                    </span>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-app-accent" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* 실시간 토스트 */}
      {toast && (
        <button
          onClick={() => {
            markRead(deckId, toast.id);
            onJump(toast.slideIndex);
            setToast(null);
          }}
          className="dg-anim-slide-r fixed right-4 top-16 z-[60] flex w-72 items-start gap-2.5 rounded-xl border border-app-border bg-white px-3.5 py-3 text-left shadow-[0_10px_32px_rgba(0,0,0,.18)]"
        >
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: toast.color }}
          >
            {toast.who.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] leading-snug text-app-text">{toast.text}</span>
            <span className="mt-0.5 block text-[10.5px] text-app-faint">
              슬라이드 {toast.slideIndex + 1} · 지금
            </span>
          </span>
        </button>
      )}
    </span>
  );
}
