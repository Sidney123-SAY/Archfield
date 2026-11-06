// Exporte les visuels des réseaux sociaux (marketing/kit/visuels.html) en PNG, un fichier par visuel,
// dans marketing/kit/images/. Usage : npm run kit
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const KIT = path.join(ROOT, "marketing", "kit");
const OUT = path.join(KIT, "images");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const facade = fs.readFileSync(path.join(ROOT, "public/img/facade.svg"), "utf8");
  const wave = Array.from({ length: 30 }, (_, i) => `<i style="height:${10 + Math.round(30 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)))}px"></i>`).join("");
  const html = fs.readFileSync(path.join(KIT, "visuels.html"), "utf8").split("{{FACADE}}").join(facade).split("{{WAVE}}").join(wave);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const ids = await page.$$eval(".ab", (els) => els.map((e) => e.id));
  for (const id of ids) {
    await page.locator("#" + id).screenshot({ path: path.join(OUT, id + ".png") });
    console.log(id);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
