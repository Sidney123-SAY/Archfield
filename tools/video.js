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
  const duration = await page.evaluate(() => window.DURATION);
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    await page.screenshot({ path: path.join(FRAMES, String(i).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 94 });
    if (i % 150 === 0) process.stdout.write(`image ${i}/${total}\n`);
  }
  // Une image fixe par scène, pour vérifier ou publier en photo.
  for (const [name, t] of [["ouverture", 3.6], ["probleme", 10.4], ["promesse", 16.4], ["chantier", 22.6], ["photos", 31], ["argent", 37.8], ["dirigeant", 44.6], ["trois-espaces", 49.8], ["fin", 54.5]]) {
    await page.evaluate((x) => window.seek(x), t);
    await page.screenshot({ path: path.join(OUT, `image-${name}.jpg`), type: "jpeg", quality: 92 });
  }
  await browser.close();
  const mp4 = path.join(OUT, "archfield-presentation.mp4");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FRAMES, "%05d.jpg"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "slow", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log("Vidéo prête :", mp4);
})().catch((e) => { console.error(e); process.exit(1); });
