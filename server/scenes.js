// Photos d'exemple pour les données de démo : scènes de chantier dessinées en SVG.
function rnd(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

function scene(kind, level, seed) {
  const r = rnd(seed), W = 640, H = 480;
  let g = "";
  if (kind === "ext") {
    g += `<rect width="320" height="240" fill="${["#A9CBE8", "#C3D8EA", "#EBD3A8"][seed % 3]}"/><rect y="170" width="320" height="70" fill="#B5683F"/><rect y="170" width="320" height="5" fill="#93502F"/>`;
    for (let i = 0; i < 16; i++) g += `<circle cx="${r() * 320}" cy="${180 + r() * 55}" r="${1 + r() * 2}" fill="#7C3F24" opacity=".55"/>`;
    if (level === 0) { for (let i = 0; i < 4; i++) g += `<line x1="${60 + i * 60}" y1="168" x2="${60 + i * 60}" y2="150" stroke="#5A3A20" stroke-width="3"/>`; g += `<line x1="60" y1="152" x2="240" y2="152" stroke="#fff" stroke-width="1.5"/><path d="M30 170q40-30 80 0z" fill="#9C5532"/>`; }
    if (level >= 1) g += `<rect x="50" y="160" width="220" height="12" fill="#A9A9A2"/><rect x="50" y="160" width="220" height="3" fill="#C4C4BD"/>`;
    if (level >= 2) {
      const h = level === 2 ? 20 : level === 3 ? 40 + Math.round(r() * 30) : 80;
      for (let row = 0; row * 10 < h; row++) { const y = 160 - (row + 1) * 10, off = row % 2 ? 10 : 0; for (let x = 52 + off; x < 268; x += 20) g += `<rect x="${x}" y="${y}" width="${Math.min(19, 268 - x)}" height="9" fill="#BAB7AE" stroke="#97948B" stroke-width=".6"/>`; }
      if (h >= 60) g += `<rect x="120" y="${180 - h}" width="34" height="${h - 20}" fill="#3A3A38"/><rect x="190" y="${182 - h}" width="40" height="26" fill="#3A3A38"/>`;
    }
    if (level >= 4) g += `<rect x="46" y="72" width="228" height="10" fill="#8F8F88"/>`;
    if (level >= 5) g += `<path d="M36 74 160 24 284 74Z" fill="#6E2F22"/>`;
    if (level >= 6) g += `<rect x="62" y="96" width="196" height="64" fill="#E9E2D0"/><rect x="120" y="110" width="34" height="50" fill="#5B3A22"/><rect x="190" y="112" width="40" height="26" fill="#7FA6C9"/>`;
    g += `<rect x="${250 + r() * 30}" y="148" width="22" height="22" fill="#D8D4C8"/><rect x="${20 + r() * 20}" y="152" width="26" height="18" rx="2" fill="#E0A100"/>`;
  } else {
    g += `<rect width="320" height="240" fill="${["#E6E1D6", "#DEDAD2", "#EBE6DC"][seed % 3]}"/><rect y="190" width="320" height="50" fill="#9D8F7C"/>`;
    if (level === 0) { for (let i = 0; i < 6; i++) g += `<rect x="${r() * 260}" y="${60 + r() * 120}" width="${20 + r() * 40}" height="${10 + r() * 30}" fill="#C9BFAE" opacity=".8"/>`; g += `<rect x="200" y="150" width="70" height="40" fill="#6E665C"/>`; }
    if (level === 1) g += `<path d="M40 190V110H180" fill="none" stroke="#C46B2B" stroke-width="5"/><path d="M60 190V130H220V60" fill="none" stroke="#3B6FB6" stroke-width="5"/><circle cx="220" cy="60" r="6" fill="#999"/>`;
    if (level === 2) { g += `<path d="M30 40H290" stroke="#555" stroke-width="2"/>`; for (let i = 0; i < 4; i++) { const x = 60 + i * 65; g += `<path d="M${x} 40V${110 + r() * 40}" stroke="${["#D23", "#36C", "#DA3", "#3A3"][i]}" stroke-width="2.5"/><rect x="${x - 8}" y="${120 + i * 6}" width="16" height="22" rx="2" fill="#F4F4F0" stroke="#999"/>`; } }
    if (level === 3) { for (let x = 0; x < 320; x += 60) g += `<rect x="${x}" y="30" width="58" height="160" fill="#F2F0EB" stroke="#D0CCC3"/>`; g += `<rect x="120" y="70" width="80" height="120" fill="#CFC8BB"/>`; }
    if (level === 4) { for (let x = 0; x < 320; x += 32) for (let y = 190; y < 240; y += 16) g += `<rect x="${x + ((y / 16) % 2 ? 16 : 0)}" y="${y}" width="31" height="15" fill="#C9C3B8" stroke="#A69F93" stroke-width=".8"/>`; for (let x = 20; x < 300; x += 24) for (let y = 40; y < 180; y += 24) g += `<rect x="${x}" y="${y}" width="23" height="23" fill="#EEF2F2" stroke="#C5CCCC" stroke-width=".8"/>`; }
    if (level >= 5) { g += `<rect width="320" height="190" fill="${["#F3EFE6", "#E8EEF0", "#F1E9E2"][seed % 3]}"/><rect x="80" y="110" width="160" height="80" fill="#F7F6F2" stroke="#BBB"/><rect x="90" y="96" width="140" height="14" fill="#5D5A55"/><rect x="30" y="40" width="60" height="50" fill="#9FC1D8" stroke="#fff" stroke-width="4"/>`; }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 320 240" preserveAspectRatio="xMidYMid slice">${g}</svg>`;
}

module.exports = { scene };
