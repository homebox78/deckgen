// 실시간 스트림 — DeckGen Collab과 동일한 SSE(EventSource) 패턴.
// /events 로 element/presence/clear 이벤트 수신, 커서는 throttle 후 POST.
import { EVENTS_URL, api } from "../api/client";

export function connectBoard(boardId, clientId, handlers) {
  let es = null;
  let closed = false;

  const open = () => {
    if (closed) return;
    es = new EventSource(EVENTS_URL(boardId, clientId));
    es.addEventListener("hello", (e) => handlers.onPresence?.(JSON.parse(e.data).peers || []));
    es.addEventListener("presence", (e) => handlers.onPresence?.(JSON.parse(e.data).peers || []));
    es.addEventListener("event", (e) => {
      const { kind, origin, payload } = JSON.parse(e.data);
      if (origin && origin === clientId) return; // 내 낙관적 업데이트 에코 무시
      handlers.onEvent?.(kind, payload);
    });
    es.onerror = () => {
      // EventSource가 자동 재접속하지만, 110초 종료 후에도 확실히 재연결되게 방어
      if (closed) return;
    };
  };
  open();

  return () => {
    closed = true;
    es?.close();
  };
}

// 커서 throttle poster (30ms)
export function makeCursorSender(boardId, clientId) {
  let last = 0;
  let pending = null;
  let timer = null;
  const flush = () => {
    if (!pending) return;
    const { x, y } = pending;
    pending = null;
    last = Date.now();
    api.cursor(boardId, { clientId, x, y }).catch(() => {});
  };
  return (x, y) => {
    pending = { x: Math.round(x), y: Math.round(y) };
    const now = Date.now();
    if (now - last >= 60) {
      clearTimeout(timer);
      flush();
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, 60);
    }
  };
}
