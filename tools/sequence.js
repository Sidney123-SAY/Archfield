// Accueil photoréaliste : transforme les vidéos de passage générées dans Higgsfield (marketing/higgsfield/PROMPTS.md)
// en une suite d'images que la page fait défiler au rythme de la molette (public/js/build.js, mode « séquence »).
//
// Usage : node tools/sequence.js marketing/accueil/B1.mp4 … marketing/accueil/B7.mp4
//         (sans argument : tous les .mp4 de marketing/accueil/, dans l'ordre alphabétique)
//
// Sans vidéos, avec des images fixes (aucun abonnement nécessaire) : mettez dans marketing/accueil/
//   ext-fini.jpg (obligatoire), ext-fondations.jpg, ext-murs.jpg, ext-gros-oeuvre.jpg,
//   int-brut.jpg, int-enduit.jpg, int-fini.jpg (facultatifs)
// Le plan lumineux est tiré automatiquement de ext-fini.jpg (et de int-fini.jpg pour le salon, tools/blueprint.py).
// Les passages sont fabriqués ici : fondu pour le plan, la maison qui monte du sol pour la construction.
// Sortie : public/img/sequence/d/0001.webp…  (ordinateur, 1280 px de large)
//          public/img/sequence/m/0001.webp…  (téléphone, 720 px de haut, recadré au centre)
//          public/img/sequence/manifest.json (nombre d'images et image de chaque étape)
// Pour revenir aux dessins : supprimer public/img/sequence/.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
// Photos et vidéos sources : marketing/accueil/ (gardées dans le projet), ou un autre dossier avec SEQ_SRC=…
const SRC = process.env.SEQ_SRC ? path.resolve(process.env.SEQ_SRC) : path.join(ROOT, "marketing", "accueil");
const OUT = path.join(ROOT, "public", "img", "sequence");
const FPS = Number(process.env.SEQ_FPS) || (fs.existsSync(path.join(ROOT, "marketing", "accueil", "ext-fini.jpg")) ? 15 : 8);          // images gardées par seconde de vidéo
const TRIM = Number(process.env.SEQ_TRIM) || 0.12;      // secondes retirées au début de chaque passage (raccord)

let files = process.argv.slice(2);
if (!files.length && fs.existsSync(SRC)) files = fs.readdirSync(SRC).filter((f) => /\.mp4$/i.test(f)).sort().map((f) => path.join(SRC, f));
const STILL = (n) => path.join(SRC, n + ".jpg");
const stillsMode = !files.length && fs.existsSync(STILL("ext-fini"));
if (!files.length && !stillsMode) { console.error("Aucune vidéo ni image. Mettez B1.mp4 … B7.mp4, ou ext-fini.jpg et ses étapes, dans marketing/accueil/ (voir marketing/higgsfield/PROMPTS.md)."); process.exit(1); }

const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ["d", "m"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

// Un seul fichier continu : chaque passage est remis en 1920 × 1080, 30 images/s, puis les passages sont mis bout à bout.
const tmp = path.join(ROOT, "video", "out", "sequence-tmp");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

// Images fixes : chaque image est une étape (n° de l'étiquette de l'accueil) ; on fabrique les passages entre elles.
let stills = null;
if (stillsMode) {
  const want = [["ext-plan", 0], ["ext-fondations", 1], ["ext-murs", 2], ["ext-gros-oeuvre", 3], ["ext-fini", 5], ["int-plan", 6], ["int-brut", 7], ["int-enduit", 8], ["int-fini", 9]];
  const bp = (from, to) => { if (!fs.existsSync(STILL(to)) && fs.existsSync(STILL(from))) execFileSync("python3", [path.join(__dirname, "blueprint.py"), STILL(from), STILL(to)], { stdio: "inherit" }); };
  bp("ext-fini", "ext-plan");
  if (fs.existsSync(STILL("int-brut"))) bp("int-fini", "int-plan");
  stills = want.filter(([n]) => fs.existsSync(STILL(n))).map(([n, label]) => ({ n, label, file: STILL(n) }));
  files = stills.slice(1).map((b, i) => {
    const a = stills[i], out = path.join(tmp, `t${i}.mp4`);
    // Plan → chantier, et passage dans le salon : fondu. Chantier qui avance : la maison monte depuis le sol.
    const rise = a.label >= 1 && b.label <= 5 && a.label < b.label;
    const inside = a.label <= 5 && b.label >= 6;
    const L = rise ? 2 + 1.2 * (b.label - a.label) : inside ? 3.2 : 3;
    const img = (f) => ["-loop", "1", "-t", String(L), "-i", f];
    const vf = (k) => `[${k}]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p[v${k}]`;
    const zoomIn = inside ? `;[x]zoompan=z='1+1.4*on/${Math.round(L * 30)}':x='iw/2-(iw/zoom/2)':y='ih*0.58-(ih/zoom/2)':d=1:s=1920x1080:fps=30[y]` : "";
    const graph = `${vf(0)};${vf(1)};[v0][v1]xfade=transition=${rise ? "smoothup" : "fade"}:duration=${(L - 0.4).toFixed(2)}:offset=0.2${inside ? "[x]" + zoomIn : ""}`;
    execFileSync("ffmpeg", ["-v", "error", "-y", ...img(a.file), ...img(b.file), "-filter_complex", graph, ...(inside ? ["-map", "[y]"] : []), "-t", String(L), "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", out]);
    return out;
  });
}
const parts = files.map((f, i) => {
  const out = path.join(tmp, `p${i}.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", i ? String(TRIM) : "0", "-i", f, "-an",
    "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "14", out]);
  return { file: out, len: dur(out) };
});
const list = path.join(tmp, "list.txt");
fs.writeFileSync(list, parts.map((p) => `file '${p.file}'`).join("\n"));
const all = path.join(tmp, "all.mp4");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", all]);

// Images : ordinateur (16:9) et téléphone (portrait, recadré au centre de la maison).
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", all, "-vf", `fps=${FPS},scale=1280:-2`, "-c:v", "libwebp", "-quality", "62", path.join(OUT, "d", "%04d.webp")]);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", all, "-vf", `fps=${FPS},crop=ih*0.62:ih,scale=-2:1100`, "-c:v", "libwebp", "-quality", "60", path.join(OUT, "m", "%04d.webp")]);
const count = fs.readdirSync(path.join(OUT, "d")).length;

// Image de chaque étape (10 étapes, comme les textes de l'accueil). Passages : B1 plan → fondations, B2 → murs,
// B3 → gros œuvre, B4 → maison finie, B5 entrée dans le salon, B6 → enduits, B7 → salon fini.
const starts = []; let t = 0;
parts.forEach((p) => { starts.push(t); t += p.len; });
const at = (i, frac) => Math.min(count - 1, Math.round((starts[i] + parts[i].len * frac) * FPS));
const n = parts.length;
let keys;
if (stills) {
  // Chaque image fixe tombe sur son étape ; les étapes sans image se placent dans le passage qui les couvre.
  const last = stills[stills.length - 1].label;
  keys = Array.from({ length: last + 1 }, (_, lab) => {
    const j = stills.findIndex((x) => x.label >= lab);
    if (stills[j].label === lab) return j === 0 ? 0 : at(j - 1, 1);
    const a = stills[j - 1].label, b = stills[j].label;
    return at(j - 1, (lab - a) / (b - a));
  });
} else keys = n >= 7
  ? [0, at(0, 1), at(1, 1), at(2, 0.6), at(2, 1), at(3, 1), at(4, 0.5), at(4, 1), at(5, 1), count - 1]
  : Array.from({ length: 10 }, (_, k) => Math.round((k * (count - 1)) / 9));
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ count, fps: FPS, keys, desktop: "d", mobile: "m", ext: "webp" }, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
const size = (d) => fs.readdirSync(path.join(OUT, d)).reduce((s, f) => s + fs.statSync(path.join(OUT, d, f)).size, 0);
console.log(`Séquence prête : ${count} images · ordinateur ${(size("d") / 1e6).toFixed(1)} Mo · téléphone ${(size("m") / 1e6).toFixed(1)} Mo`);
console.log("Étapes (n° d'image) :", keys.join(", "));
