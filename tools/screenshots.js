// Captures de l'application pour la page d'accueil (public/img), en français et en anglais, thème clair et sombre.
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
        localStorage.setItem("af-lang", l); localStorage.setItem("af-theme", t);
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
    }
  }
  await browser.close();
  console.log("Captures enregistrées dans public/img");
})();
