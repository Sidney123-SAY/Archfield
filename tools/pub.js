// Publicité Meta 9:16 : tools/video/pub.html rendu image par image (30 images/s), puis assemblé en MP4 (H.264) avec la voix et les bruitages.
// Usage : npm run pub                      → video/out/archfield-pub-9x16-c.mp4   (accroche C, la principale)
//         HOOK=a npm run pub               → accroche A (HOOK=b : accroche B), pour les tests A/B
//         STORYBOARD=1 npm run pub         → images clés seulement (marketing/pub/storyboard/)
// Voix : tools/video/pub-voix/*.wav (Speko · ElevenLabs). Lancez d'abord npm run pub:son (bande son). Il faut ffmpeg et Playwright.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const VOIX = path.join(__dirname, "video", "pub-voix");
const OUT = path.join(ROOT, "video", "out");
const FRAMES = path.join(OUT, "frames-pub");
const FPS = Number(process.env.FPS) || 30;
const HOOK = (process.env.HOOK || "c").toLowerCase(); // C : accroche principale
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
// Le plan 1 dure le temps de la phrase d'accroche : les accroches B et C décalent la suite de la vidéo.
const SHIFT = dur(path.join(__dirname, "video", "pub-voix", `hook-${HOOK}.wav`)) - dur(path.join(__dirname, "video", "pub-voix", "hook-a.wav"));

async function page() {
  const facade = fs.readFileSync(path.join(ROOT, "public/img/facade.svg"), "utf8");
  const env = fs.readFileSync(path.join(VOIX, "chef-env.json"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "video/pub.html"), "utf8").split("{{FACADE}}").join(facade)
    .replace("<script>", `<script>window.CHEF_ENV = ${env};</script>\n<script>`);
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  pg.on("pageerror", (e) => console.error("Erreur dans la page :", e.message));
  await pg.setContent(html, { waitUntil: "networkidle" });
  await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(([h, sh]) => window.setHook(h, sh), [HOOK, SHIFT]);
  return { browser, pg };
}

(async () => {
  const { browser, pg } = await page();
  if (process.env.STORYBOARD) {
    const dir = path.join(ROOT, "marketing", "pub", "storyboard" + (HOOK === "c" ? "" : "-" + HOOK));
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const sc = await pg.evaluate(() => window.SCENES());
    const end = (i, d = 0.25) => sc[i][2] - d;
    const KEYS = [["1-accroche", end(0)], ["2a-carte", sc[1][1] + 2.4], ["2b-photo-floue", end(1)], ["3a-dechirure", sc[2][1] + 0.6], ["3b-preuve", end(2)], ["4-rapport", end(3)], ["5-valider-payer", end(4)], ["6-fin", end(5, 0.3)]];
    for (const [name, t] of KEYS) {
      await pg.evaluate((x) => window.seek(x), t);
      await pg.screenshot({ path: path.join(dir, name + ".jpg"), type: "jpeg", quality: 90 });
      console.log(name);
    }
    await browser.close();
    return;
  }
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const duration = await pg.evaluate(() => window.DURATION);
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await pg.evaluate((t) => window.seek(t), i / FPS);
    await pg.screenshot({ path: path.join(FRAMES, String(i).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 93 });
    if (i % 150 === 0) process.stdout.write(`image ${i}/${total}\n`);
  }
  await browser.close();
  const mp4 = path.join(OUT, `archfield-pub-9x16-${HOOK}.mp4`);
  const mix = path.join(OUT, `pub-mix-${HOOK}.wav`);
  if (!fs.existsSync(mix)) throw new Error("Bande son absente : lancez d'abord npm run pub:son");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FRAMES, "%05d.jpg"), "-i", mix,
    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", mp4], { stdio: "inherit" });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log("Vidéo prête :", mp4);
})().catch((e) => { console.error(e); process.exit(1); });
