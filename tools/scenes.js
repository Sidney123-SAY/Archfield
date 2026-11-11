// Scènes de la page d'accueil : la même villa, du plan d'architecte à la maison finie, puis le salon, des murs bruts
// au salon meublé. Chaque étape est un groupe SVG (id) que public/js/build.js fait apparaître au défilement.
// Usage : node tools/scenes.js   →   public/img/chantier-ext.svg et public/img/chantier-int.svg
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(__dirname, "..", "public", "img");
const r = (x, y, w, h, a = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;
const p = (d, a = "") => `<path d="${d}" ${a}/>`;
const g = (id, body, a = "") => `<g id="${id}" ${a}>${body}</g>`;

/* ------------------------------------------------------------------ Extérieur ------------------------------------------------------------------ */
// Repères de la façade (vue de face) : rez-de-chaussée 500–660, dalle 486–500, étage 350–486, toiture 268–350.
const X0 = 540, X1 = 1060, GROUND = 660;
const RDC = [500, GROUND], ETG = [350, 486];
const COLS = [540, 700, 878, 1038];                       // poteaux (bord gauche, 22 px de large)
const OPEN_RDC = [[575, 535, 92, 82], [930, 535, 92, 82], [766, 540, 68, 120]];      // fenêtres, porte
const OPEN_ETG = [[575, 380, 92, 80], [930, 380, 92, 80], [764, 372, 72, 114]];      // fenêtres, porte-fenêtre du balcon
const ROOF = "M500 352 L1100 352 L1004 266 L596 266 Z";

function palm(x, y, s, color, a = "") {
  const fr = [[-150, -40], [-120, 30], [-60, 70], [60, 70], [125, 25], [150, -45], [40, -70], [-45, -72]];
  const top = `${x + 18 * s} ${y - 260 * s}`;
  return `<g ${a}>${p(`M${x} ${y} C${x + 10 * s} ${y - 120 * s} ${x - 6 * s} ${y - 190 * s} ${top}`, `stroke="${color}" stroke-width="${12 * s}" fill="none" stroke-linecap="round"`)}` +
    fr.map(([dx, dy]) => p(`M${top} q${dx * 0.5 * s} ${-40 * s + dy * 0.2 * s} ${dx * s} ${dy * s} q${-dx * 0.45 * s} ${-dy * 0.1 * s - 26 * s} ${-dx * s} ${-dy * s}Z`, `fill="${color}"`)).join("") + "</g>";
}
function blocks(x, y, w, h, id) {
  return `<pattern id="${id}" width="44" height="22" patternUnits="userSpaceOnUse" x="${x}" y="${y}"><rect width="44" height="22" fill="#CFC7B9"/><path d="M0 21H44M22 0V11M0 11H44M44 11V22M0 11V22" stroke="#B4AB9B" stroke-width="2"/></pattern>`;
}
// Mur percé de ses ouvertures (masque) : blocs bruts, ou enduit fini.
function wall(id, y0, y1, opens, fill, extra = "") {
  const mask = `<mask id="m-${id}"><rect x="0" y="0" width="1600" height="900" fill="#fff"/>${opens.map(([x, y, w, h]) => r(x, y, w, h, 'fill="#000"')).join("")}</mask>`;
  // L'intérieur de la maison, sombre, se voit par les ouvertures.
  const inside = fill.includes("blk") ? r(X0, y0, X1 - X0, y1 - y0, 'fill="#4A433B"') : "";
  return `${mask}${inside}${r(X0, y0, X1 - X0, y1 - y0, `fill="${fill}" mask="url(#m-${id})"`)}${extra}`;
}

function exterior() {
  const defs = `<defs>
    <linearGradient id="sky-n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070F1A"/><stop offset=".7" stop-color="#14263D"/><stop offset="1" stop-color="#1D3452"/></linearGradient>
    <linearGradient id="sky-d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8DB6DC"/><stop offset=".55" stop-color="#E8D9C4"/><stop offset="1" stop-color="#F5D3A6"/></linearGradient>
    <linearGradient id="soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C47A4F"/><stop offset="1" stop-color="#8E4E2E"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4E6278"/><stop offset=".45" stop-color="#26323F"/><stop offset=".55" stop-color="#3A4B5E"/><stop offset="1" stop-color="#1C252F"/></linearGradient>
    <linearGradient id="render" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F1E6"/><stop offset="1" stop-color="#E9DFCF"/></linearGradient>
    <linearGradient id="tiles" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C2643A"/><stop offset="1" stop-color="#9C4523"/></linearGradient>
    <radialGradient id="sunglow"><stop offset="0" stop-color="#FFE3B0" stop-opacity=".9"/><stop offset="1" stop-color="#FFE3B0" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    ${blocks(X0, 0, 0, 0, "blk")}
  </defs>`;
  // Ciel, soleil, lune, étoiles : très grands, pour couvrir tous les formats d'écran (le cadrage change avec l'écran).
  const sky = g("sky-day", r(-3000, -2500, 7600, 3160, 'fill="url(#sky-d)"') + `<circle cx="1260" cy="190" r="260" fill="url(#sunglow)"/><circle cx="1260" cy="190" r="58" fill="#FFD79A"/>`) +
    g("sky-night", r(-3000, -2500, 7600, 3160, 'fill="url(#sky-n)"') + `<circle cx="1240" cy="170" r="34" fill="#F0A27A" opacity=".85"/>` +
      Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 389) % 2600 - 500}" cy="${(i * 233) % 560 - 200}" r="${1 + (i % 3) * 0.6}" fill="#F4F2EE" opacity="${0.25 + (i % 5) * 0.12}"/>`).join(""));
  const back = g("bg", [
    `<g fill="#2F6B4A" opacity=".55">${Array.from({ length: 26 }, (_, i) => `<ellipse cx="${-600 + i * 110}" cy="${GROUND - 34 - (i % 3) * 14}" rx="${90 + (i % 4) * 20}" ry="${50 + (i % 3) * 16}"/>`).join("")}</g>`,
    palm(380, GROUND - 4, 1.05, "#2A5E42"), palm(1240, GROUND - 4, 1.12, "#2A5E42"), palm(1420, GROUND - 4, .8, "#336F4E"), palm(170, GROUND - 4, .85, "#336F4E"),
  ].join(""));
  const ground = g("ground", r(-3000, GROUND, 7600, 2400, 'fill="url(#soil)"') + p(`M-3000 ${GROUND + 70} C200 ${GROUND + 40} 1400 ${GROUND + 90} 4600 ${GROUND + 60}`, 'stroke="#B26A42" stroke-width="10" fill="none" opacity=".5"'));
  // 1. Fondations : semelles et attentes des poteaux.
  const found = g("found", r(X0 - 14, GROUND - 10, X1 - X0 + 50, 22, 'fill="#BDB5A8"') + r(X0 - 14, GROUND + 12, X1 - X0 + 50, 8, 'fill="#6E4A33" opacity=".5"') +
    COLS.map((c) => `<g stroke="#7A4E06" stroke-width="3">${[3, 11, 19].map((d) => p(`M${c + d} ${GROUND - 10}V${GROUND - 64}`)).join("")}</g>`).join("") +
    `<g fill="#D3CCBF" stroke="#B4AB9B" stroke-width="2">${[[300, 640], [340, 640], [320, 618], [1150, 640], [1190, 640]].map(([x, y]) => r(x, y, 40, 20)).join("")}</g>` +
    `<g fill="#EFE9DD" stroke="#CFC6B6" stroke-width="2">${[[1240, 642], [1290, 642], [1265, 622]].map(([x, y]) => r(x, y, 48, 20, 'rx="6"')).join("")}</g>`);
  const columns = (y0, y1, id) => g(id, COLS.map((c) => r(c, y0, 22, y1 - y0, 'fill="#B3AB9D"')).join(""));
  const rebars = (y, id) => g(id, COLS.map((c) => `<g stroke="#7A4E06" stroke-width="3">${[4, 11, 18].map((d) => p(`M${c + d} ${y}V${y - 46}`)).join("")}</g>`).join(""));
  // 2. Murs du rez-de-chaussée, en agglos.
  const clip = (id, x, y, w, h) => `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`;
  const rdc = clip("c-rdc", -100, RDC[0] - 60, 1800, RDC[1] - RDC[0] + 90) + g("rdc", wall("rdc", RDC[0], RDC[1], OPEN_RDC, "url(#blk)") + columns(RDC[0], RDC[1], "rdc-cols") + rebars(RDC[0], "rdc-rebar"), 'clip-path="url(#c-rdc)"');
  // 3. Dalle, puis murs de l'étage.
  const dalle = g("dalle", r(X0 - 16, 486, X1 - X0 + 32, 16, 'fill="#A9A196"') + r(756, 486, 88, 16, 'fill="#A9A196"') + `<g stroke="#8A5A3A" stroke-width="6">${[600, 812, 990].map((x) => p(`M${x} 502V${GROUND}`)).join("")}</g>`);
  const etage = clip("c-etg", -100, ETG[0] - 60, 1800, ETG[1] - ETG[0] + 62) + g("etage", wall("etg", ETG[0], ETG[1], OPEN_ETG, "url(#blk)") + columns(ETG[0], ETG[1], "etg-cols") + rebars(ETG[0], "etg-rebar"), 'clip-path="url(#c-etg)"');
  // Échafaudage, retiré aux finitions.
  const scaf = g("scaf", `<g stroke="#8A8F96" stroke-width="5" fill="none">${p("M1070 330V660M1140 330V660M1070 420H1140M1070 500H1140M1070 580H1140M1070 420L1140 500M1070 500L1140 580")}</g><g fill="#B98A5A">${[418, 498, 578].map((y) => r(1062, y - 8, 86, 8)).join("")}</g>`);
  // 4. Toiture : charpente, puis tuiles.
  const roofFrame = g("roof-frame", `<g stroke="#8A5A3A" stroke-width="7" fill="none" stroke-linecap="round">${p(ROOF)}${[640, 720, 800, 880, 960].map((x) => p(`M${x} 352L${x + (x < 800 ? -8 : x > 800 ? 8 : 0)} 268`)).join("")}${p("M548 312H1052")}</g>`);
  const roof = clip("c-roof", 490, 250, 620, 120) + g("roof-tiles", p(ROOF, 'fill="url(#tiles)"') + `<g stroke="#8C3D1E" stroke-width="2" opacity=".55">${[286, 306, 326, 346].map((y) => p(`M${596 - (y - 266) * 1.17} ${y}H${1004 + (y - 266) * 1.17}`)).join("")}</g>` + p("M596 266H1004", 'stroke="#7E3418" stroke-width="6"') + r(496, 350, 608, 10, 'fill="#E8DFD0"'), 'clip-path="url(#c-roof)"');
  // 5. Finitions : enduit, menuiseries, balcon, colonnes, jardin.
  const glassWin = ([x, y, w, h], door) => r(x - 6, y - 6, w + 12, h + 12, 'fill="#1E2630"') + r(x, y, w, h, door ? 'fill="#6E4326"' : 'fill="url(#glass)"') +
    (door ? p(`M${x + w / 2} ${y}V${y + h}`, 'stroke="#4E2E18" stroke-width="3"') + `<circle cx="${x + w / 2 - 7}" cy="${y + h * 0.55}" r="3" fill="#D99A2B"/><circle cx="${x + w / 2 + 7}" cy="${y + h * 0.55}" r="3" fill="#D99A2B"/>`
      : p(`M${x + w / 2} ${y}V${y + h}M${x} ${y + h * 0.4}H${x + w}`, 'stroke="#1E2630" stroke-width="4"') + p(`M${x + 8} ${y + h - 10}L${x + w * 0.45} ${y + 8}`, 'stroke="#fff" stroke-width="6" opacity=".12"'));
  const finish = g("finish", [
    wall("fin-rdc", RDC[0], RDC[1], OPEN_RDC, "url(#render)"), wall("fin-etg", ETG[0], ETG[1], OPEN_ETG, "url(#render)"),
    r(X0 - 16, 484, X1 - X0 + 32, 20, 'fill="#E2D8C8"'), r(X0, GROUND - 22, X1 - X0, 22, 'fill="#9C8F7E"'),
    r(720, 500, 160, 160, 'fill="#000" opacity=".06"'),
    OPEN_RDC.map((o, i) => glassWin(o, i === 2)).join(""), OPEN_ETG.map((o, i) => glassWin(o, i === 2)).join(""),
    // balcon et colonnes du porche
    r(740, 470, 120, 16, 'fill="#E2D8C8"'), `<g stroke="#2B333C" stroke-width="4">${p("M744 470V438M856 470V438M744 440H856")}${[760, 776, 792, 808, 824, 840].map((x) => p(`M${x} 440V470`)).join("")}</g>`,
    [726, 862].map((x) => r(x, 502, 16, 158, 'fill="#FBF8F2"') + r(x - 4, 500, 24, 8, 'fill="#E2D8C8"')).join(""),
    r(744, GROUND, 112, 10, 'fill="#D8D2C6"') + r(732, GROUND + 10, 136, 10, 'fill="#CCC5B8"'),
  ].join(""));
  const garden = g("garden", [
    // muret de clôture avec piliers, sur les côtés
    [[250, 520], [1080, 1350]].map(([a, b]) => r(a, GROUND - 46, b - a, 46, 'fill="#EFE8DC"') + r(a, GROUND - 52, b - a, 8, 'fill="#D9CFBF"') +
      [a, b - 24].map((x) => r(x, GROUND - 74, 24, 74, 'fill="#E6DED0"') + r(x - 4, GROUND - 80, 32, 8, 'fill="#D2C7B6"')).join("")).join(""),
    // allée pavée, pelouse, bougainvillier, palmiers au premier plan
    p(`M732 ${GROUND + 20} L868 ${GROUND + 20} L1010 900 L590 900 Z`, 'fill="#D9C3A0"'),
    p(`M-3000 ${GROUND + 26} H600 L470 900 H-3000Z`, 'fill="#5E8C4A" opacity=".75"') + p(`M1000 ${GROUND + 26} H4600 V900 H1130Z`, 'fill="#5E8C4A" opacity=".75"'),
    `<g fill="#D9468A">${Array.from({ length: 22 }, (_, i) => `<circle cx="${1110 + (i * 37) % 230}" cy="${GROUND - 60 + (i * 23) % 40}" r="${9 + (i % 3) * 3}"/>`).join("")}</g><g fill="#3E7A4C">${Array.from({ length: 10 }, (_, i) => `<circle cx="${1120 + (i * 53) % 220}" cy="${GROUND - 40 + (i * 17) % 26}" r="10"/>`).join("")}</g>`,
    palm(300, GROUND + 40, 1.25, "#25553B"), palm(1330, GROUND + 50, 1.35, "#25553B"),
  ].join(""));
  const night = g("night", r(-3000, -2500, 7600, 6000, 'fill="#0B1624"'));
  // Plan d'architecte : les contours de la maison finie, en traits bleus lumineux.
  const L = 'stroke="#7FC1FF" stroke-width="2.4" fill="none"';
  const plan = g("plan", `<g filter="url(#glow)">` + [
    r(X0, RDC[0], X1 - X0, RDC[1] - RDC[0], L), r(X0, ETG[0], X1 - X0, ETG[1] - ETG[0], L), r(X0 - 16, 486, X1 - X0 + 32, 16, L), p(ROOF, L),
    [...OPEN_RDC, ...OPEN_ETG].map(([x, y, w, h]) => r(x, y, w, h, L) + p(`M${x + w / 2} ${y}V${y + h}`, L + ' opacity=".6"')).join(""),
    COLS.map((c) => r(c, ETG[0], 22, GROUND - ETG[0], L + ' opacity=".45"')).join(""),
    r(726, 502, 16, 158, L) + r(862, 502, 16, 158, L) + r(740, 438, 120, 48, L) + r(732, GROUND, 136, 20, L),
    p(`M-3000 ${GROUND}H4600`, L),
  ].join("") + `</g><g stroke="#7FC1FF" stroke-width="1.2" opacity=".55" fill="none">` +
    p(`M${X0} ${GROUND + 40}H${X1}M${X0} ${GROUND + 32}V${GROUND + 48}M${X1} ${GROUND + 32}V${GROUND + 48}M${X1 + 50} ${GROUND}V266M${X1 + 42} ${GROUND}H${X1 + 58}M${X1 + 42} 266H${X1 + 58}`) +
    `</g><g stroke="#7FC1FF" stroke-width="1" opacity=".12">${Array.from({ length: 60 }, (_, i) => p(`M${-1200 + i * 80} -1600V2400`)).join("")}${Array.from({ length: 50 }, (_, i) => p(`M-3000 ${-1600 + i * 80}H4600`)).join("")}</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" class="scene-svg">${defs}<g id="cam">${sky}${back}${ground}${found}${dalle}${rdc}${etage}${scaf}${roofFrame}${roof}${finish}${garden}${night}</g>${plan}</svg>`;
}

/* ------------------------------------------------------------------ Intérieur ------------------------------------------------------------------ */
// Salon en perspective centrale : point de fuite (800, 430), mur du fond 420–1180 × 200–640, grande baie vitrée au fond.
const VP = [800, 430], BW = [420, 200, 1180, 640], WIN = [610, 270, 380, 290];
const lerp = (a, b, t) => a + (b - a) * t;
function interior() {
  const [bx0, by0, bx1, by1] = BW;
  const floor = `M-1200 1500 L2800 1500 L${bx1} ${by1} L${bx0} ${by1} Z`;
  const ceil = `M-1200 -600 L2800 -600 L${bx1} ${by0} L${bx0} ${by0} Z`;
  const lw = `M-1200 -600 L${bx0} ${by0} L${bx0} ${by1} L-1200 1500 Z`;
  const rw = `M2800 -600 L${bx1} ${by0} L${bx1} ${by1} L2800 1500 Z`;
  const [wx, wy, ww, wh] = WIN;
  // Lignes qui fuient vers le point de fuite, et rangées horizontales du sol (carrelage).
  const floorLines = (op) => {
    let s = "";
    for (let i = -14; i <= 14; i++) { const x = bx0 + ((bx1 - bx0) * (i + 14)) / 28; s += p(`M${x} ${by1}L${lerp(VP[0], x, 4.2)} ${lerp(VP[1], by1, 4.2)}`); }
    for (let k = 0; k < 9; k++) { const y = by1 + (Math.pow(1.45, k) - 1) * 26; s += p(`M-1200 ${y}H2800`); }
    return `<g stroke="#B9AE9C" stroke-width="2" opacity="${op}">${s}</g>`;
  };
  const sideBlocks = (side) => {
    // Rangées d'agglos sur les murs de côté : horizontales qui fuient, joints verticaux.
    let s = "";
    const x0 = side < 0 ? bx0 : bx1, far = side < 0 ? -1200 : 2800;
    for (let k = 1; k < 20; k++) { const y = by0 + ((by1 - by0) * k) / 20; s += p(`M${x0} ${y}L${far} ${lerp(VP[1], y, (far - VP[0]) / (x0 - VP[0]))}`); }
    for (let k = 1; k < 12; k++) { const t = 1 + k * 0.35, x = lerp(VP[0], x0, t); s += p(`M${x} ${lerp(VP[1], by0, t)}L${x} ${lerp(VP[1], by1, t)}`); }
    return `<g stroke="#9E9586" stroke-width="2" opacity=".55">${s}</g>`;
  };
  const view = `<clipPath id="win-c">${r(wx, wy, ww, wh)}</clipPath><g clip-path="url(#win-c)">${r(wx, wy, ww, wh, 'fill="#9CC4E4"')}${r(wx, wy + wh * 0.62, ww, wh, 'fill="#6E9E5A"')}` +
    palm(wx + 80, wy + wh + 20, .9, "#2F6B4A") + palm(wx + ww - 60, wy + wh + 40, 1.05, "#2A5E42") + `<ellipse cx="${wx + ww / 2}" cy="${wy + wh * 0.66}" rx="160" ry="26" fill="#4F8A4E"/></g>`;
  const defs = `<defs>
    <pattern id="blk-i" width="48" height="24" patternUnits="userSpaceOnUse"><rect width="48" height="24" fill="#C9C0B1"/><path d="M0 23H48M24 0V12M0 12H48M48 12V24M0 12V24" stroke="#ACA293" stroke-width="2"/></pattern>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE8C2" stop-opacity=".55"/><stop offset="1" stop-color="#FFE8C2" stop-opacity="0"/></linearGradient>
    <linearGradient id="wallw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7F2EA"/><stop offset="1" stop-color="#ECE4D7"/></linearGradient>
    <filter id="glow-i" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <mask id="m-win"><rect x="-2000" y="-2000" width="6000" height="6000" fill="#fff"/>${r(wx, wy, ww, wh, 'fill="#000"')}</mask>
  </defs>`;
  // Gros œuvre : agglos bruts, dalle de béton, ouverture sans menuiserie, gaines électriques, rayon de soleil.
  const raw = g("i-raw", p(floor, 'fill="#A39B8F"') + p(ceil, 'fill="#B5AEA3"') + p(lw, 'fill="#BBB2A3"') + p(rw, 'fill="#B4AB9C"') + sideBlocks(-1) + sideBlocks(1) +
    r(bx0, by0, bx1 - bx0, by1 - by0, 'fill="url(#blk-i)" mask="url(#m-win)"') + view +
    `<g stroke="#6E6A64" stroke-width="5" fill="none">${p(`M${bx0 + 60} ${by0}V${by0 + 220}H${bx0 + 140}`)}${p(`M${bx1 - 80} ${by0}V${by1 - 120}`)}</g>` +
    p(`M${wx} ${wy + wh} L${wx + ww} ${wy + wh} L${wx + ww + 260} 980 L${wx - 260} 980 Z`, 'fill="url(#beam)"') +
    `<g fill="#EFE9DD" stroke="#CFC6B6" stroke-width="2">${r(1240, 780, 120, 48, 'rx="8"') + r(1300, 740, 120, 48, 'rx="8"')}</g>`);
  // Second œuvre : enduit, menuiserie posée, carrelage à moitié posé.
  const plaster = g("i-plaster", p(lw, 'fill="#E7E1D7"') + p(rw, 'fill="#E0D9CE"') + p(ceil, 'fill="#F1EDE6"') + r(bx0, by0, bx1 - bx0, by1 - by0, 'fill="#EDE7DD" mask="url(#m-win)"') + view +
    r(wx - 10, wy - 10, ww + 20, wh + 20, 'fill="none" stroke="#2B333C" stroke-width="12"') + p(`M${wx + ww / 2} ${wy}V${wy + wh}`, 'stroke="#2B333C" stroke-width="8"'));
  const tiles = `<clipPath id="c-tiles"><rect x="-1200" y="${by1}" width="4000" height="900"/></clipPath>` + g("i-tiles", p(floor, 'fill="#E4DDD1"') + floorLines(0.9), 'clip-path="url(#c-tiles)"');
  // Fini : peinture chaude, plinthes, rideaux, canapé, tapis, table basse, plante, suspension, ventilateur, tableau.
  const done = g("i-done", [
    p(lw, 'fill="#EFE6D8"'), p(rw, 'fill="#E8DECF"'), r(bx0, by0, bx1 - bx0, by1 - by0, 'fill="url(#wallw)" mask="url(#m-win)"'),
    r(bx0, by1 - 12, bx1 - bx0, 12, 'fill="#D7CBB8"'),
    // rideaux
    p(`M${wx - 70} ${wy - 30} h60 v${wh + 80} h-70 q10 -${wh / 2} 10 -${wh + 80} Z`, 'fill="#F0A27A" opacity=".9"') + p(`M${wx + ww + 10} ${wy - 30} h60 q-10 ${wh / 2} 10 ${wh + 80} h-70 Z`, 'fill="#F0A27A" opacity=".9"'),
    // tableau au mur de gauche (en perspective)
    p("M150 300 L330 330 L330 470 L150 470 Z", 'fill="#14263D"') + p("M170 330 L310 352 L310 450 L170 450 Z", 'fill="#D99A2B"') + p("M190 420 L240 380 L290 425 Z", 'fill="#C2410C"'),
    // tapis, canapé, coussins wax, table basse
    p("M470 720 L1130 720 L1290 860 L310 860 Z", 'fill="#C9B79C"') + p("M500 735 L1100 735 L1240 845 L360 845 Z", 'fill="none" stroke="#14263D" stroke-width="4" opacity=".35"'),
    r(540, 560, 520, 90, 'rx="22" fill="#D8CBB5"') + r(520, 600, 560, 110, 'rx="26" fill="#E6DAC5"') + r(500, 590, 50, 120, 'rx="20" fill="#D8CBB5"') + r(1050, 590, 50, 120, 'rx="20" fill="#D8CBB5"') +
      r(590, 575, 90, 70, 'rx="14" fill="#C2410C"') + r(920, 575, 90, 70, 'rx="14" fill="#26774B"') + p("M600 600 l20 -14 l20 14 l20 -14 l20 14M930 600 l20 -14 l20 14 l20 -14 l20 14", 'stroke="#F4F2EE" stroke-width="4" fill="none" opacity=".7"'),
    r(660, 760, 280, 22, 'rx="6" fill="#6E4326"') + r(690, 782, 14, 46, 'fill="#5A361F"') + r(896, 782, 14, 46, 'fill="#5A361F"') + `<circle cx="740" cy="752" r="12" fill="#F0A27A"/>`,
    // plante, suspension, ventilateur
    r(1235, 660, 90, 110, 'rx="10" fill="#14263D"') + `<g fill="#2F6B4A">${[[-40, -90], [0, -130], [40, -100], [-60, -40], [60, -50]].map(([dx, dy]) => p(`M1280 660 q${dx} ${dy / 2} ${dx * 1.4} ${dy} q${-dx * 0.2} ${-dy * -0.2} ${-dx * 1.4} ${-dy}Z`)).join("")}</g>`,
    p("M800 120V250", 'stroke="#2B333C" stroke-width="3"') + p("M760 250 h80 l-15 36 h-50 Z", 'fill="#D99A2B"') + `<ellipse cx="800" cy="290" rx="60" ry="14" fill="#FFE8C2" opacity=".45"/>`,
    p("M560 150V176", 'stroke="#2B333C" stroke-width="3"') + `<g fill="#6E4326">${p("M470 182 h90 v8 h-90Z")}${p("M560 182 h90 v8 h-90Z")}</g><circle cx="560" cy="186" r="9" fill="#2B333C"/>`,
  ].join(""));
  const L = 'stroke="#7FC1FF" stroke-width="2.4" fill="none"';
  const plan = g("i-plan", r(-2000, -2000, 6000, 6000, 'fill="#0E1B2C"') + `<g filter="url(#glow-i)">` +
    r(bx0, by0, bx1 - bx0, by1 - by0, L) + p(`M${bx0} ${by0}L-1200 -600M${bx1} ${by0}L2800 -600M${bx0} ${by1}L-1200 1500M${bx1} ${by1}L2800 1500`, L) + r(wx, wy, ww, wh, L) + p(`M${wx + ww / 2} ${wy}V${wy + wh}`, L) +
    `<g stroke-dasharray="10 10">${r(520, 590, 560, 120, L + ' rx="24"')}${p("M470 720 L1130 720 L1290 860 L310 860 Z", L)}${r(660, 760, 280, 22, L)}${p("M150 300 L330 330 L330 470 L150 470 Z", L)}</g></g>` +
    `<g stroke="#7FC1FF" stroke-width="1.2" opacity=".5" fill="none">${p(`M${bx0} ${by0 - 40}H${bx1}M${bx0} ${by0 - 48}V${by0 - 32}M${bx1} ${by0 - 48}V${by0 - 32}M${wx} ${wy + wh + 40}H${wx + ww}`)}</g>` +
    `<g stroke="#7FC1FF" stroke-width="1" opacity=".12">${Array.from({ length: 50 }, (_, i) => p(`M${-1200 + i * 80} -1000V2000`)).join("")}${Array.from({ length: 40 }, (_, i) => p(`M-1200 ${-1000 + i * 80}H2800`)).join("")}</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" class="scene-svg">${defs}<g id="i-cam">${raw}${plaster}${tiles}${done}</g>${plan}</svg>`;
}

fs.writeFileSync(path.join(OUT, "chantier-ext.svg"), exterior());
fs.writeFileSync(path.join(OUT, "chantier-int.svg"), interior());
console.log("Scènes écrites dans public/img/ : chantier-ext.svg, chantier-int.svg");
