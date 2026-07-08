// DeckGen 공유 PHP 서버의 /st/* API 래퍼. 같은 호스트(hom2box.com)라 CORS 없음.
const API_BASE = "/deckGen/api";

export function getToken() {
  return localStorage.getItem("st_token") || "";
}
export function setToken(t) {
  if (t) localStorage.setItem("st_token", t);
  else localStorage.removeItem("st_token");
}

async function req(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || "응답 파싱 실패" };
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

export const api = {
  // 인증
  authNickname: (nickname, color) => req("/st/auth", { method: "POST", body: { nickname, color }, auth: false }),
  me: () => req("/st/me"),
  // 보드
  listBoards: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/st/boards${q ? `?${q}` : ""}`, { auth: false });
  },
  createBoard: (payload) => req("/st/boards", { method: "POST", body: payload }),
  getBoard: (id) => req(`/st/boards/${id}`),
  updateBoard: (id, patch) => req(`/st/boards/${id}`, { method: "PATCH", body: patch }),
  deleteBoard: (id) => req(`/st/boards/${id}`, { method: "DELETE" }),
  joinBoard: (id) => req(`/st/boards/${id}/join`, { method: "POST" }),
  clearBoard: (id, clientId) => req(`/st/boards/${id}/clear`, { method: "POST", body: { clientId } }),
  // 요소
  addElement: (id, el) => req(`/st/boards/${id}/elements`, { method: "POST", body: el }),
  updateElement: (id, eid, patch) => req(`/st/boards/${id}/elements/${eid}`, { method: "PATCH", body: patch }),
  deleteElement: (id, eid, clientId) => req(`/st/boards/${id}/elements/${eid}`, { method: "DELETE", body: { clientId } }),
  // 커서
  cursor: (id, payload) => req(`/st/boards/${id}/cursor`, { method: "POST", body: payload, auth: true }),
  // 초대
  invite: (id) => req(`/st/boards/${id}/invite`, { method: "POST" }),
  resolveInvite: (code) => req(`/st/join/${code}`, { auth: false }),
  // 알림
  notifications: () => req("/st/notifications"),
  readNotifications: () => req("/st/notifications/read", { method: "POST" }),
  // 관리자
  bannedWords: () => req("/st/admin/banned-words"),
  addBannedWord: (w) => req("/st/admin/banned-words", { method: "POST", body: w }),
  deleteBannedWord: (wid) => req(`/st/admin/banned-words/${wid}`, { method: "DELETE" }),
};

export const EVENTS_URL = (id, clientId, since = 0) =>
  `${API_BASE}/st/boards/${id}/events?clientId=${encodeURIComponent(clientId)}&since=${since}`;
