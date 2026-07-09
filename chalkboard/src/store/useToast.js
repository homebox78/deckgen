import { create } from "zustand";

let seq = 0;
export const useToast = create((set, get) => ({
  toasts: [],
  push: (message, kind = "info") => {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, message, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2600);
  },
  remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

// 편의 함수 (컴포넌트 밖에서도 호출)
export const toast = (msg, kind) => useToast.getState().push(msg, kind);
