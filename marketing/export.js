// Exporte chaque visuel de marketing/visuels.html en PNG à sa taille réelle (1080 px de large).
// Usage : node marketing/export.js   (nécessite Playwright : npx playwright install chromium)
const path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 2100 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "visuels.html"));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  for (const id of ["post-apercu", "story-apercu", "post-diaspora"]) {
    // Garde-fou : aucun bloc de texte ne doit en chevaucher un autre ni sortir du visuel.
    const problems = await page.evaluate((id) => {
      const art = document.getElementById(id), A = art.getBoundingClientRect(), out = [];
      const els = [...art.querySelectorAll(".text h1, .text .lead, .note, .code, .foot, .chips, .brand, .tag")];
      const r = els.map((e) => e.getBoundingClientRect());
      els.forEach((e, i) => {
        if (r[i].left < A.left || r[i].right > A.right || r[i].bottom > A.bottom || e.scrollWidth > e.clientWidth + 1) out.push(`${e.className} déborde`);
        for (let j = i + 1; j < els.length; j++)
          if (r[i].left < r[j].right && r[j].left < r[i].right && r[i].top < r[j].bottom && r[j].top < r[i].bottom) out.push(`${e.className} / ${els[j].className}`);
      });
      return out;
    }, id);
    if (problems.length) console.warn(`  ⚠ ${id} : ${problems.join(", ")}`);
    await page.locator("#" + id).screenshot({ path: path.join(__dirname, `archfield-${id}.png`) });
    console.log(`marketing/archfield-${id}.png`);
  }
  await browser.close();
})();
