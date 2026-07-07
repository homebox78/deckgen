// 배포 서브디렉터리(/deckGen) 대응 — dev에선 ""(루트)
export const API_BASE: string = import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiUrl(path: string): string {
  return API_BASE + path;
}
