// 유튜브 URL/ID 파싱
export function parseYoutubeId(input) {
  if (!input) return null;
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function youtubeThumb(id) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
export function youtubeEmbed(id) {
  return `https://www.youtube.com/embed/${id}?autoplay=1`;
}
