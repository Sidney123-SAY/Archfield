// Durée et début de chaque scène, à partir de la durée des phrases de la voix off (video/voix/durees.json).
// Partagé par tools/video.js (vidéo) et tools/video-vertical.js (version verticale et sous-titres).
const BASE = [4.6, 6.6, 6, 8.2, 6.6, 6.6, 6.8, 5.2, 5.4];
const LEAD = 0.5, TAIL = 0.75, END = 2.2;
function timeline(durees) {
  const list = BASE.map((d, i) => Math.max(d, LEAD + durees["s" + (i + 1)] + (i === BASE.length - 1 ? END : TAIL)));
  const starts = list.reduce((acc, d, i) => (acc.push(i ? acc[i - 1] + list[i - 1] : 0), acc), []);
  return { list, starts, total: list.reduce((a, b) => a + b, 0), LEAD };
}
module.exports = { timeline, BASE, LEAD, TAIL, END };
