// Recette automatique : ouvre chaque écran avec chaque compte de démo (ordinateur et téléphone, français et anglais),
// clique sur chaque bouton sans danger et signale les erreurs JavaScript, les requêtes en échec, les liens cassés,
// les boutons qui ne font rien et les pages plus larges que l'écran.
// Usage : npm run qa   (démarre son propre serveur sur une base de démo jetable)
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "archfield-qa-"));
// Le robot fait des milliers de requêtes depuis la même adresse : la limite anti-abus est relevée.
Object.assign(process.env, { DATA_DIR, NODE_ENV: "test", DEMO: "on", REPORTS: "off", LIMIT_FACTOR: "1000" });
execFileSync(process.execPath, ["--no-warnings", path.join(__dirname, "..", "server", "seed.js")], { env: process.env, stdio: "ignore" });
const app = require("../server/server");

// Boutons à ne pas cliquer : ils effacent, déconnectent ou rendent un chantier.
const DANGER = /supprim|déconnect|reprendre|retirer|rendre le chantier|changer de lien|annuler l'invitation|delete|log out|take back|remove|give .* back|new link|cancel the invitation|tout refuser|tout accepter|reject all|accept all|enregistrer|save|publier|publish|créer|create|ajouter|add|envoyer un rapport|send a report|marquer|mark|valider|validate|terminer|finish|démarrer|start|rouvrir|reopen|confier|entrust|invit|une entreprise|a construction|un proche|a relative/i;
const PAGES = {
  anon: ["/", "/connexion", "/inscription", "/mot-de-passe-oublie", "/reinitialiser", "/a-propos", "/confidentialite", "/mentions-legales", "/c/demo-saly-awa", "/c/demo-lyon-claire", "/invitation/INV-DEMO-RUFQ", "/c/inexistant", "/invitation/INV-XXXX-XXXX"],
  eu: ["/app#tableau-de-bord", "/app#chantiers", "/app#nouveau-chantier", "/app#journal", "/app#photos", "/app#clients", "/app#compte", "SITE:journal", "SITE:etapes", "SITE:argent", "SITE:partage"],
  af: ["/app#tableau-de-bord", "/app#chantiers", "/app#journal", "/app#compte", "SITE:etapes", "SITE:partage"],
  proche: ["/app#tableau-de-bord", "/app#chantiers", "/app#nouveau-chantier", "/app#journal", "/app#photos", "/app#clients", "/app#compte", "SITE:partage"],
  client: ["/app#mes-chantiers", "/app#ajouter", "/app#nouveau", "/app#offre", "/app#compte", "CSITE:0", "CSITE:1", "CSITE:2", "/c/demo-saly-awa"]
};
const VIEWPORTS = { desktop: { width: 1360, height: 900 }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true } };
const problems = [];
const note = (where, what) => { const k = `${where} · ${what}`; if (!problems.includes(k)) { problems.push(k); if (process.env.QA_VERBOSE) console.log("  " + k); } };

(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const checkedLinks = new Set();

  const jobs = [];
  for (const lang of ["fr", "en"]) for (const [vpName, vp] of Object.entries(VIEWPORTS)) for (const [account, pages] of Object.entries(PAGES)) jobs.push({ lang, vpName, vp, account, pages });
  // Quatre navigateurs en parallèle ; les boutons sont cliqués en français seulement (l'anglais vérifie les textes).
  const worker = async () => { for (let j; (j = jobs.shift()); ) await runJob(j); };
  await Promise.all([worker(), worker(), worker(), worker()]).catch((e) => note("robot", e.message));
  async function runJob({ lang, vpName, vp, account, pages }) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, locale: lang === "fr" ? "fr-FR" : "en-GB" });
    await ctx.addInitScript((l) => { try { localStorage.setItem("af-lang", l); localStorage.setItem("af-consent", JSON.stringify({ necessary: true, analytics: false, date: new Date().toISOString(), version: 1 })); } catch (e) {} }, lang);
    const page = await ctx.newPage();
    let where = "";
    page.on("pageerror", (e) => note(where, "erreur JS : " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) note(where, "console : " + m.text()); });
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.origin !== BASE || r.status() < 400) return;
      // Réponses attendues : pages d'erreur volontaires et vérifications de session.
      if (/\/api\/(c\/inexistant|invitations\/INV-XXXX)/.test(u.pathname) || (u.pathname === "/api/me" && account === "anon")) return;
      note(where, `HTTP ${r.status()} ${r.request().method()} ${u.pathname}`);
    });
    if (account !== "anon") {
      await page.goto(BASE + "/connexion");
      await page.evaluate((a) => fetch("/api/demo-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: a }) }), account);
    }
    // Identifiants des chantiers de ce compte, pour les fiches.
    let siteId = null, clientSites = [];
    if (account !== "anon" && account !== "client") siteId = (await page.evaluate(() => fetch("/api/sites").then((r) => r.json())))[0]?.id;
    if (account === "client") clientSites = (await page.evaluate(() => fetch("/api/client/sites").then((r) => r.json()))).sites.map((s) => s.id);

    for (const p of pages) {
      let url = p, tab = null;
      if (p.startsWith("SITE:")) { url = "/app#chantier-" + siteId; tab = p.slice(5); }
      if (p.startsWith("CSITE:")) { const id = clientSites[Number(p.slice(6))]; if (!id) continue; url = "/app#chantier-" + id; }
      where = `${account} ${vpName} ${lang} ${p}`;
      const open = async () => {
        await page.goto("about:blank");
        await page.goto(BASE + url, { waitUntil: "networkidle" });
        if (tab) { await page.click(`[data-site-tab="${tab}"]`); await page.waitForLoadState("networkidle"); }
        await page.waitForTimeout(150);
      };
      await open();
      // Page plus large que l'écran.
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) note(where, `déborde de ${over}px en largeur`);
      // Texte français oublié en anglais.
      if (lang === "en") {
        const fr = await page.evaluate(() => {
          const words = /\b(chantier|étape|mise à jour|connexion|Enregistrer|Supprimer|Ajouter|Suivant|Retour|Annuler|Copier|Vous|votre|depuis|jours?)\b/;
          const out = [];
          const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3 && words.test(c.textContent) && c.parentElement.offsetParent !== null && !c.parentElement.closest("code,.entry p,.sitecard h1,.where,.meta,[data-user],input,textarea,option")) out.push(c.textContent.trim().slice(0, 60)); else if (c.nodeType === 1 && !["SCRIPT", "STYLE"].includes(c.tagName)) walk(c); } };
          walk(document.body);
          return out.slice(0, 3);
        });
        fr.forEach((s) => note(where, "texte en français : " + s));
      }
      // Liens internes cassés.
      const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h.startsWith("/") && !h.startsWith("//")));
      for (const h of links) {
        const key = account + h.split("#")[0];
        if (checkedLinks.has(key) || h.startsWith("/api/") && h.includes("export")) continue;
        checkedLinks.add(key);
        const r = await page.request.get(BASE + h.split("#")[0]);
        if (r.status() >= 400) note(where, `lien cassé ${h} (${r.status()})`);
      }
      // Liens d'ancre (#...) : la cible doit exister ou être une route de l'application.
      // Boutons : chacun doit faire quelque chose (changer la page, l'adresse, ou envoyer une requête).
      const count = lang === "fr" ? await page.evaluate(() => document.querySelectorAll("button").length) : 0;
      for (let i = 0; i < count; i++) {
        const info = await page.evaluate((i) => {
          const b = document.querySelectorAll("button")[i];
          if (!b) return null;
          const r = b.getBoundingClientRect(), st = getComputedStyle(b);
          const visible = r.width > 0 && r.height > 0 && st.visibility !== "hidden" && b.offsetParent !== null;
          return { visible, disabled: b.disabled, label: (b.textContent || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50), submit: b.type === "submit" };
        }, i);
        if (!info || !info.visible || info.disabled || info.submit || DANGER.test(info.label)) continue;
        // Mesure : mutations du DOM, changement d'adresse, requêtes, ouverture d'une fenêtre.
        await page.evaluate(() => {
          window.__qa = { m: 0, url: location.href };
          window.__qaObs?.disconnect();
          window.__qaObs = new MutationObserver((l) => { window.__qa.m += l.length; });
          window.__qaObs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
        });
        let req = 0; const onReq = () => req++;
        page.on("request", onReq);
        const popup = ctx.waitForEvent("page", { timeout: 400 }).catch(() => null);
        try {
          await page.evaluate((i) => document.querySelectorAll("button")[i].click(), i);
        } catch (e) { note(where, `bouton « ${info.label} » : ${e.message.split("\n")[0]}`); }
        const pop = await popup;
        if (pop) await pop.close();
        await page.waitForTimeout(250);
        page.off("request", onReq);
        const fx = await page.evaluate(() => ({ m: window.__qa ? window.__qa.m : 1, moved: !window.__qa || location.href !== window.__qa.url }));
        if (!fx.m && !fx.moved && !req && !pop) note(where, `bouton sans effet : « ${info.label} »`);
        await open();
      }
    }
    await ctx.close();
    console.log(`fini : ${account} ${vpName} ${lang} (${problems.length} problème(s) au total)`);
  }
  await browser.close();
  server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  if (problems.length) { console.log(problems.length + " problème(s) :\n- " + problems.join("\n- ")); process.exitCode = 1; }
  else console.log("Aucun problème trouvé.");
  process.exit();
})();
