import { create } from "zustand";

interface ToastState {
  msg: string | null;
}

const useToastStore = create<ToastState>()(() => ({ msg: null }));

let timer: number | undefined;

export function showToast(msg: string): void {
  useToastStore.setState({ msg });
  window.clearTimeout(timer);
  timer = window.setTimeout(() => useToastStore.setState({ msg: null }), 2400);
}

/** 디자인 시안의 다크 토스트 — App 루트에 1회 마운트 */
export function Toaster() {
  const msg = useToastStore((s) => s.msg);
  if (!msg) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-[10px] bg-app-text px-[18px] py-2.5 text-[13px] font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,.25)]">
      {msg}
    </div>
  );
}
