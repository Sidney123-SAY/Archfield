// Icônes de l'application installée (écran d'accueil Android et iPhone), dessinées à partir du logo.
// Usage : node tools/icons.js   (nécessite Playwright)
const path = require("node:path");
const { chromium } = require("playwright");

const OUT = path.join(__dirname, "..", "public", "icons");
// Fond bleu nuit plein (Android et iOS arrondissent eux-mêmes les coins), logo centré.
// « Maskable » : le logo reste dans le cercle central de 80 % que tous les Android affichent.
const svg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#14263D"/>
  <g transform="translate(16 16) scale(${scale}) translate(-16 -17)"><path d="M9 25V15a7 7 0 0 1 14 0v10" fill="none" stroke="#C2410C" stroke-width="3.2"/><rect x="12.2" y="20" width="2" height="5" fill="#fff"/><rect x="15" y="17.5" width="2" height="7.5" fill="#fff"/><rect x="17.8" y="15" width="2" height="10" fill="#fff"/><rect x="6" y="25" width="20" height="2" rx=".8" fill="#fff"/></g></svg>`;
const ICONS = [["icon-192.png", 192, 1], ["icon-512.png", 512, 1], ["maskable-512.png", 512, 0.78], ["apple-touch-icon.png", 180, 0.9]];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [file, size, scale] of ICONS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(scale)}`);
    await page.screenshot({ path: path.join(OUT, file) });
    console.log("public/icons/" + file);
  }
  await browser.close();
})();
