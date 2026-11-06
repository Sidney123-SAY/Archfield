// Vidéo de présentation en motion design : tools/video/video.html rendu image par image (30 images/s), puis
// assemblé en MP4 (H.264) avec ffmpeg. Usage : npm run video   →   video/out/archfield-presentation.mp4
// Il faut ffmpeg (https://ffmpeg.org) et Playwright (déjà dans les dépendances de développement).
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "video", "out");
const FRAMES = path.join(OUT, "frames");
const FPS = Number(process.env.FPS) || 30;

(async () => {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const facade = fs.readFileSync(path.join(ROOT, "public/img/facade.svg"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "video/video.html"), "utf8").split("{{FACADE}}").join(facade);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("Erreur dans la page :", e.message));
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Voix off (npm run voix) : chaque scène dure le temps de sa phrase, plus une respiration.
  const VOIX = path.join(ROOT, "video", "voix");
  const durees = fs.existsSync(path.join(VOIX, "durees.json")) ? JSON.parse(fs.readFileSync(path.join(VOIX, "durees.json"), "utf8")) : null;
  const { timeline, LEAD } = require("./video/timeline");
  let starts = null;
  if (durees) {
    const tl = timeline(durees);
    await page.evaluate((l) => window.setTimeline(l), tl.list);
    starts = tl.starts;
  }
  const duration = await page.evaluate(() => window.DURATION);
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    await page.screenshot({ path: path.join(FRAMES, String(i).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 94 });
    if (i % 150 === 0) process.stdout.write(`image ${i}/${total}\n`);
  }
  // Une image fixe par scène, pour vérifier ou publier en photo.
  const sceneEnd = await page.evaluate(() => [...document.querySelectorAll(".scene")].map((el, i) => i));
  const names = ["ouverture", "probleme", "promesse", "chantier", "photos", "argent", "dirigeant", "trois-espaces", "fin"];
  for (const i of sceneEnd) {
    const t = starts ? (i < 8 ? starts[i + 1] - 0.6 : duration - 0.5) : [3.6, 10.4, 16.4, 22.6, 31, 37.8, 44.6, 49.8, 54.5][i];
    const name = names[i];
    await page.evaluate((x) => window.seek(x), t);
    await page.screenshot({ path: path.join(OUT, `image-${name}.jpg`), type: "jpeg", quality: 92 });
  }
  await browser.close();
  const mp4 = path.join(OUT, "archfield-presentation.mp4");
  const video = ["-framerate", String(FPS), "-i", path.join(FRAMES, "%05d.jpg")];
  const enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "slow", "-movflags", "+faststart"];
  if (durees) {
    // Chaque phrase est placée au début de sa scène (après le fondu), puis le tout est mis au niveau des réseaux sociaux (-16 LUFS).
    const inputs = [], filters = [];
    Object.keys(durees).forEach((k, i) => {
      inputs.push("-i", path.join(VOIX, k + ".wav"));
      const ms = Math.round((starts[i] + LEAD) * 1000);
      filters.push(`[${i + 1}:a]aresample=48000,adelay=${ms}|${ms}[v${i}]`);
    });
    const n = Object.keys(durees).length;
    const graph = filters.join(";") + ";" + Array.from({ length: n }, (_, i) => `[v${i}]`).join("") + `amix=inputs=${n}:normalize=0,apad,atrim=0:${duration.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=${(duration - 0.6).toFixed(3)}:d=0.6[a]`;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...video, ...inputs, "-filter_complex", graph, "-map", "0:v", "-map", "[a]", ...enc, "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-shortest", mp4], { stdio: "inherit" });
  } else {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...video, ...enc, mp4], { stdio: "inherit" });
  }
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log("Vidéo prête :", mp4);
})().catch((e) => { console.error(e); process.exit(1); });
