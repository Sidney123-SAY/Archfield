// Accueil photoréaliste : transforme les vidéos de passage générées dans Higgsfield (marketing/higgsfield/PROMPTS.md)
// en une suite d'images que la page fait défiler au rythme de la molette (public/js/build.js, mode « séquence »).
//
// Usage : node tools/sequence.js video/higgsfield/B1.mp4 … video/higgsfield/B7.mp4
//         (sans argument : tous les .mp4 de video/higgsfield/, dans l'ordre alphabétique)
// Sortie : public/img/sequence/d/0001.webp…  (ordinateur, 1280 px de large)
//          public/img/sequence/m/0001.webp…  (téléphone, 720 px de haut, recadré au centre)
//          public/img/sequence/manifest.json (nombre d'images et image de chaque étape)
// Pour revenir aux dessins : supprimer public/img/sequence/.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "video", "higgsfield");
const OUT = path.join(ROOT, "public", "img", "sequence");
const FPS = Number(process.env.SEQ_FPS) || 8;          // images gardées par seconde de vidéo
const TRIM = Number(process.env.SEQ_TRIM) || 0.12;      // secondes retirées au début de chaque passage (raccord)

let files = process.argv.slice(2);
if (!files.length && fs.existsSync(SRC)) files = fs.readdirSync(SRC).filter((f) => /\.mp4$/i.test(f)).sort().map((f) => path.join(SRC, f));
if (!files.length) { console.error("Aucune vidéo. Mettez B1.mp4 … B7.mp4 dans video/higgsfield/ (voir marketing/higgsfield/PROMPTS.md)."); process.exit(1); }

const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ["d", "m"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

// Un seul fichier continu : chaque passage est remis en 1920 × 1080, 30 images/s, puis les passages sont mis bout à bout.
const tmp = path.join(ROOT, "video", "out", "sequence-tmp");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
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
const keys = n >= 7
  ? [0, at(0, 1), at(1, 1), at(2, 0.6), at(2, 1), at(3, 1), at(4, 0.5), at(4, 1), at(5, 1), count - 1]
  : Array.from({ length: 10 }, (_, k) => Math.round((k * (count - 1)) / 9));
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ count, fps: FPS, keys, desktop: "d", mobile: "m", ext: "webp" }, null, 1));
fs.rmSync(tmp, { recursive: true, force: true });
const size = (d) => fs.readdirSync(path.join(OUT, d)).reduce((s, f) => s + fs.statSync(path.join(OUT, d, f)).size, 0);
console.log(`Séquence prête : ${count} images · ordinateur ${(size("d") / 1e6).toFixed(1)} Mo · téléphone ${(size("m") / 1e6).toFixed(1)} Mo`);
console.log("Étapes (n° d'image) :", keys.join(", "));
