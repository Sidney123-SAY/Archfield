// Version verticale (1080 × 1920) pour TikTok, Reels et Shorts, sous-titres incrustés (la plupart des gens regardent
// sans le son), et fichier de sous-titres SRT pour YouTube et Facebook. Usage : npm run video:vertical
// À lancer après npm run voix et npm run video. Il faut ffmpeg (avec libass).
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { timeline } = require("./video/timeline");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "video", "out");
const SRC = path.join(OUT, "archfield-presentation.mp4");
const durees = JSON.parse(fs.readFileSync(path.join(ROOT, "video/voix/durees.json"), "utf8"));
const textes = JSON.parse(fs.readFileSync(path.join(__dirname, "video/voix.json"), "utf8"));
const tl = timeline(durees);
// Titre affiché en haut de la version verticale, scène par scène.
const TITRES = ["Votre chantier, comme si vous y étiez.", "Construire au pays, de loin.", "Ce qui est construit. Ce que devient votre argent.",
  "Le rapport du jour, en parlant.", "Des photos qui prouvent.", "Payer au bon moment.", "Le dirigeant voit tout.", "Un chantier, trois espaces.", "Votre argent mérite des preuves."];

// Découpe une phrase en morceaux courts (7 mots au plus, coupés de préférence à la ponctuation), chacun affiché
// pendant une durée proportionnelle à sa longueur.
function morceaux(texte) {
  // Espace insécable avant « : ? ! ; » (typographie française) : la ponctuation reste collée au mot.
  const mots = texte.replace(/Artchfild/g, "Archfield").replace(/ ([:;?!])/g, "\u00A0$1").split(/[ \t\n]+/);
  // Jamais de coupure juste après un petit mot (« d'y », « le », « de »…) : il reste avec le mot suivant.
  const petit = /^(de|d'y|du|des|le|la|les|l'|au|aux|à|et|ou|en|un|une|que|qui|ce|sa|son|ses|votre|vos|pas|avant|mais|pour|par|sur|dès|est|a)$/i;
  const out = []; let cur = [];
  for (const m of mots) {
    cur.push(m);
    const len = cur.join(" ").length;
    if ((/[.,:;?!]$/.test(m) && len >= 14) || (len >= 30 && !petit.test(m))) { out.push(cur.join(" ")); cur = []; }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}
const lignes = [];
Object.keys(durees).forEach((k, i) => {
  const parts = morceaux(textes[k]), total = parts.reduce((a, p) => a + p.length, 0);
  let t = tl.starts[i] + tl.LEAD;
  for (const p of parts) { const d = (durees[k] * p.length) / total; lignes.push({ a: t, b: t + d - 0.04, texte: p }); t += d; }
});

const srtTime = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
const srt = lignes.map((l, i) => `${i + 1}\n${srtTime(l.a)} --> ${srtTime(l.b)}\n${l.texte}\n`).join("\n");
fs.writeFileSync(path.join(OUT, "archfield-presentation.fr.srt"), srt);

const assTime = (t) => { const cs = Math.round(t * 100); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };
const esc = (s) => s.replace(/[{}]/g, "");
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Marque,Geist,36,&H007AA2F0,&H007AA2F0,&H00000000,&H00000000,-1,0,0,0,100,100,6,0,1,0,0,8,80,80,190,1
Style: Titre,Source Serif 4 Medium,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,80,80,270,1
Style: Sous,Geist,58,&H00FFFFFF,&H00FFFFFF,&H003D2614,&H663D2614,-1,0,0,0,100,100,0,0,3,18,0,2,90,90,420,1
Style: Pied,Geist,36,&H00C9D2DD,&H00C9D2DD,&H00000000,&H00000000,0,0,0,0,100,100,1,0,1,0,0,2,80,80,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${assTime(0)},${assTime(tl.total)},Marque,,0,0,0,,ARCHFIELD
Dialogue: 0,${assTime(0)},${assTime(tl.total)},Pied,,0,0,0,,Bientôt disponible · Deux mois offerts
${TITRES.map((t, i) => `Dialogue: 0,${assTime(tl.starts[i])},${assTime(tl.starts[i] + tl.list[i])},Titre,,0,0,0,,{\\fad(250,200)}${esc(t)}`).join("\n")}
${lignes.map((l) => `Dialogue: 1,${assTime(l.a)},${assTime(l.b)},Sous,,0,0,0,,${esc(l.texte)}`).join("\n")}
`;
const assFile = path.join(OUT, "vertical.ass");
fs.writeFileSync(assFile, ass);

const fonts = path.join(ROOT, "video", "fonts");
const vertical = path.join(OUT, "archfield-presentation-vertical.mp4");
// Fond bleu encre, vidéo 16:9 au milieu, titre au-dessus, sous-titres en dessous.
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", SRC,
  "-f", "lavfi", "-i", `color=c=0x14263D:s=1080x1920:r=30:d=${tl.total.toFixed(3)}`,
  "-filter_complex", `[0:v]scale=1080:-2[v];[1:v][v]overlay=0:700:shortest=1,ass=${assFile}:fontsdir=${fonts}[out]`,
  "-map", "[out]", "-map", "0:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow", "-c:a", "copy", "-movflags", "+faststart", vertical], { stdio: "inherit" });
console.log("Version verticale :", vertical, "\nSous-titres :", path.join(OUT, "archfield-presentation.fr.srt"));
