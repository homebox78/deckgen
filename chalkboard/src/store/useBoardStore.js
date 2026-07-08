import { create } from "zustand";
import { api } from "../api/client";
import { connectBoard, makeCursorSender } from "../realtime/boardStream";

// 칠판 1개의 실시간 상태. 요소는 배열, 서버 이벤트로 동기화(낙관적 업데이트).
export const useBoardStore = create((set, get) => ({
  board: null,
  elements: [],
  members: [],
  peers: [], // {clientId, name, color, cursor:{x,y}}
  myRole: null,
  myGrade: 0,
  caps: null,
  loading: true,
  error: null,
  _disconnect: null,
  _cursorSend: null,

  load: async (boardId, clientId) => {
    set({ loading: true, error: null });
    try {
      const data = await api.getBoard(boardId);
      set({
        board: data.board,
        elements: data.elements || [],
        members: data.members || [],
        myRole: data.myRole,
        myGrade: data.myGrade,
        caps: data.caps,
        loading: false,
      });
      get().connect(boardId, clientId);
    } catch (e) {
      set({ loading: false, error: e.message || "칠판을 불러오지 못했어요." });
    }
  },

  connect: (boardId, clientId) => {
    get()._disconnect?.();
    const disconnect = connectBoard(boardId, clientId, {
      onPresence: (peers) => set({ peers: peers.filter((p) => p.clientId !== clientId) }),
      onEvent: (kind, payload) => get().applyEvent(kind, payload),
    });
    set({ _disconnect: disconnect, _cursorSend: makeCursorSender(boardId, clientId) });
  },

  disconnect: () => {
    get()._disconnect?.();
    set({ _disconnect: null, peers: [], _cursorSend: null });
  },

  sendCursor: (x, y) => get()._cursorSend?.(x, y),

  // 서버 이벤트 반영
  applyEvent: (kind, payload) => {
    const { elements } = get();
    if (kind === "add") {
      if (elements.some((e) => e.id === payload.id)) return;
      set({ elements: [...elements, payload] });
    } else if (kind === "update") {
      set({ elements: elements.map((e) => (e.id === payload.id ? { ...e, ...payload } : e)) });
    } else if (kind === "delete") {
      set({ elements: elements.filter((e) => e.id !== payload.id) });
    } else if (kind === "clear") {
      set({ elements: [] });
    } else if (kind === "board") {
      set({ board: { ...get().board, ...payload } });
    } else if (kind === "member") {
      set({ board: { ...get().board, memberCount: payload.memberCount, boardLevel: payload.boardLevel } });
    }
  },

  // 로컬 낙관적 추가 → 서버 확정
  addElementOptimistic: async (boardId, clientId, type, data, zIndex = 0) => {
    const tempId = "tmp_" + Math.random().toString(36).slice(2, 9);
    const temp = { id: tempId, type, data, zIndex, _pending: true, authorId: -1 };
    set({ elements: [...get().elements, temp] });
    try {
      const res = await api.addElement(boardId, { type, data, zIndex, clientId });
      if (res.rejected) {
        set({ elements: get().elements.filter((e) => e.id !== tempId) });
        return { rejected: true, reason: res.reason };
      }
      if (res.pending) {
        set({ elements: get().elements.filter((e) => e.id !== tempId) });
        return { pending: true };
      }
      set({ elements: get().elements.map((e) => (e.id === tempId ? res.element : e)) });
      return { element: res.element };
    } catch (e) {
      set({ elements: get().elements.filter((e) => e.id !== tempId) });
      return { error: e.message };
    }
  },

  updateElementOptimistic: async (boardId, clientId, eid, patch) => {
    const prev = get().elements;
    set({ elements: prev.map((e) => (e.id === eid ? { ...e, ...patch } : e)) });
    try {
      await api.updateElement(boardId, eid, { ...patch, clientId });
    } catch {
      set({ elements: prev }); // 롤백
    }
  },

  deleteElementOptimistic: async (boardId, clientId, eid) => {
    const prev = get().elements;
    set({ elements: prev.filter((e) => e.id !== eid) });
    try {
      await api.deleteElement(boardId, eid, clientId);
    } catch {
      set({ elements: prev });
    }
  },

  setBoard: (b) => set({ board: b }),
}));
