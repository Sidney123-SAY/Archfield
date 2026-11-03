// Captures de l'application pour la page d'accueil (public/img), en français et en anglais, thème clair et sombre :
// tableau de bord, téléphone de l'entreprise et du client, publication vérifiée et résumé de l'argent.
// Usage : npm run seed, puis npm start dans un terminal, puis : node tools/screenshots.js [http://localhost:3000]
// Nécessite Playwright (npx playwright install chromium).
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = path.join(__dirname, "..", "public", "img");

(async () => {
  const browser = await chromium.launch();
  for (const lang of ["fr", "en"]) {
    for (const theme of ["light", "dark"]) {
      const prep = async (ctx) => ctx.addInitScript(([l, t]) => {
        localStorage.setItem("af-lang", l); localStorage.setItem("af-theme", t); localStorage.setItem("af-install-nudge", "1");
        localStorage.setItem("af-consent", JSON.stringify({ necessary: true, analytics: false, date: new Date().toISOString(), version: 1 }));
      }, [lang, theme]);
      const login = async (page, account) => {
        await page.goto(BASE + "/connexion");
        await page.evaluate((a) => fetch("/api/demo-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: a }) }), account);
      };
      // Tableau de bord, ordinateur
      const desk = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1.5 });
      await prep(desk);
      let p = await desk.newPage();
      await login(p, "eu");
      await p.goto(BASE + "/app#tableau-de-bord"); await p.waitForTimeout(1200);
      await p.screenshot({ path: path.join(OUT, `dashboard-${lang}-${theme}.jpg`), type: "jpeg", quality: 82 });
      await desk.close();
      // Journal de l'artisan et page du client, téléphone
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await prep(phone);
      p = await phone.newPage();
      await login(p, "af");
      await p.goto(BASE + "/app#journal"); await p.waitForTimeout(1200);
      await p.screenshot({ path: path.join(OUT, `phone-artisan-${lang}-${theme}.jpg`), type: "jpeg", quality: 82 });
      await p.goto(BASE + "/c/demo-saly-awa"); await p.waitForTimeout(1200);
      await p.screenshot({ path: path.join(OUT, `phone-client-${lang}-${theme}.jpg`), type: "jpeg", quality: 82 });
      await phone.close();
      // Détails pour la page d'accueil : une publication vérifiée, et le résumé de l'argent (lien privé du client).
      const detail = await browser.newContext({ viewport: { width: 560, height: 1000 }, deviceScaleFactor: 2 });
      await prep(detail);
      p = await detail.newPage();
      await p.goto(BASE + "/c/demo-saly-awa"); await p.waitForTimeout(1200);
      await p.locator(".entry").first().screenshot({ path: path.join(OUT, `entry-${lang}-${theme}.jpg`), type: "jpeg", quality: 85 });
      await p.click('[data-tab="argent"]'); await p.waitForTimeout(500);
      const box = await p.locator(".money").boundingBox();
      const cut = await p.evaluate(() => { const m = document.querySelector(".money"), h = m.querySelector("h3"); return h.getBoundingClientRect().top - m.getBoundingClientRect().top - 4; });
      await p.screenshot({ path: path.join(OUT, `money-${lang}-${theme}.jpg`), type: "jpeg", quality: 85, clip: { x: box.x, y: box.y, width: box.width, height: cut } });
      await detail.close();
    }
  }
  await browser.close();
  console.log("Captures enregistrées dans public/img");
})();
