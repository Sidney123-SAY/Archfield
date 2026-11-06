// Guide offert « Premier chantier au pays » : marketing/guide/guide.html imprimé en PDF A4.
// Usage : BASE_URL=https://votre-domaine npm run guide   →   public/guide/premier-chantier-au-pays.pdf
// Le PDF est servi par le site : c'est ce lien qu'envoie la réponse automatique au commentaire « CHANTIER ».
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "guide");
const base = (process.env.BASE_URL || "").replace(/\/$/, "");
const url = base && !base.includes("example.com") ? base.replace(/^https?:\/\//, "") + "/auth.html" : "Le lien d'inscription est dans votre message";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const facade = fs.readFileSync(path.join(ROOT, "public/img/facade.svg"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "marketing/guide/guide.html"), "utf8").split("{{FACADE}}").join(facade).split("{{URL}}").join(url);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(OUT, "premier-chantier-au-pays.pdf");
  await page.pdf({ path: file, format: "A4", printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log("Guide prêt :", file, base ? "" : "(sans BASE_URL : pas d'adresse du site dans le PDF)");
})().catch((e) => { console.error(e); process.exit(1); });
