import { create } from "zustand";
import { api, getToken, setToken } from "../api/client";

export const useAuthStore = create((set) => ({
  user: null,
  ready: false,
  clientId: "c_" + Math.random().toString(36).slice(2, 10),

  // 앱 시작 시 토큰이 있으면 세션 복구
  init: async () => {
    if (!getToken()) {
      set({ ready: true });
      return;
    }
    try {
      const { user } = await api.me();
      set({ user, ready: true });
    } catch {
      setToken("");
      set({ user: null, ready: true });
    }
  },

  login: async (nickname, color) => {
    const { user, token } = await api.authNickname(nickname, color);
    setToken(token);
    set({ user });
    return user;
  },

  logout: () => {
    setToken("");
    set({ user: null });
  },
}));
