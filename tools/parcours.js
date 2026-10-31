// Parcours complets dans le navigateur, comme un vrai utilisateur : inscriptions (entreprise, client, proche invité),
// création de chantier, publication avec photo, étapes, devis et factures, validation par le client, numéro de suivi,
// invitation d'un proche, cookies, langue, compte. Chaque formulaire est rempli et chaque action vérifiée.
// Usage : npm run parcours   (démarre son propre serveur sur une base jetable)
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "archfield-parcours-"));
Object.assign(process.env, { DATA_DIR, NODE_ENV: "test", DEMO: "on", REPORTS: "off", LIMIT_FACTOR: "1000" });
const app = require("../server/server");

const errors = [];
let step = "";
const ok = (msg) => console.log("  ✓ " + msg);

(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const photo = path.join(DATA_DIR, "photo.jpg");

  // Réponses d'erreur attendues dans ces parcours (le test les provoque exprès).
  const EXPECTED = [/\/api\/me$/, /\/api\/entreprise\//, /\/deliver$/, /\/api\/signup$/, /\/api\/login$/, /\/api\/client\/claim$/];
  async function context(opts = {}) {
    const ctx = await browser.newContext({ locale: "fr-FR", viewport: { width: 1280, height: 860 }, ...opts });
    await ctx.addInitScript(() => { try { if (!localStorage.getItem("af-lang")) localStorage.setItem("af-lang", "fr"); } catch (e) {} });
    ctx.setDefaultTimeout(8000);
    ctx.on("page", (p) => watch(p));
    return ctx;
  }
  function watch(page) {
    page.on("pageerror", (e) => errors.push(`${step} · erreur JS : ${e.message}`));
    page.on("dialog", (d) => { errors.push(`${step} · boîte de dialogue inattendue : ${d.message()}`); d.dismiss(); });
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.origin === BASE && r.status() >= 400 && !EXPECTED.some((re) => re.test(u.pathname))) errors.push(`${step} · HTTP ${r.status()} ${r.request().method()} ${u.pathname}`);
    });
  }
  const toast = async (page, re) => {
    await page.waitForFunction((src) => { const el = document.getElementById("toast"); return el && !el.hidden && new RegExp(src).test(el.textContent); }, re.source, { timeout: 8000 });
    await page.evaluate(() => { const el = document.getElementById("toast"); if (el) el.hidden = true; });
  };
  const run = async (name, fn) => {
    step = name;
    try { await fn(); ok(name); } catch (e) { errors.push(`${name} · ${e.message.split("\n")[0]}`); console.log("  ✗ " + name + " : " + e.message.split("\n")[0]); }
  };

  /* ---------- Entreprise (France) ---------- */
  const proCtx = await context();
  const pro = await proCtx.newPage();
  await pro.goto(BASE + "/");
  await pro.screenshot({ path: photo, type: "jpeg", quality: 70 }); // une « photo » de chantier à envoyer
  let siteToken = "", tracking = "";

  await run("cookies : paramètres puis enregistrer", async () => {
    await pro.click("[data-cookies-custom]");
    await pro.check("#cb-analytics");
    await pro.click("[data-cookies-save]");
    await pro.waitForSelector("#cookie-banner", { state: "detached" });
    const c = await pro.evaluate(() => JSON.parse(localStorage.getItem("af-consent")));
    if (!c.analytics) throw new Error("choix non enregistré");
  });
  await run("thème sombre puis système", async () => {
    await pro.click('[data-theme-set="dark"]');
    if (await pro.evaluate(() => document.documentElement.dataset.theme) !== "dark") throw new Error("thème non appliqué");
    await pro.click('[data-theme-set="system"]');
  });
  await run("inscription entreprise avec SIRET", async () => {
    await pro.goto(BASE + "/inscription");
    await pro.click('label:has(input[value="pro"])');
    await pro.fill("#su-contact", "Marc Test");
    await pro.click("#su-next");
    await pro.selectOption("#su-country", "FR");
    await pro.fill("#su-company-id", "123"); await pro.fill("#su-company", "Atelier Test"); await pro.fill("#su-city", "Lyon");
    await pro.click("#su-next");
    await pro.fill("#su-email", "marc@test.fr"); await pro.fill("#su-password", "motdepasse1");
    await pro.click("#su-next");
    await pro.waitForSelector("#signup .error-box:not([hidden])"); // SIRET invalide refusé par le serveur
    await pro.click("#su-back");
    await pro.fill("#su-company-id", "900 123 456 00007");
    await pro.click("#su-next"); await pro.click("#su-next");
    await pro.waitForURL(/\/app/);
    await pro.waitForSelector(".pagehead h1");
  });
  await run("créer un chantier", async () => {
    await pro.goto(BASE + "/app#nouveau-chantier");
    await pro.fill("#ns-name", "Cuisine test"); await pro.fill("#ns-location", "Lyon 6e");
    await pro.fill("#ns-client", "Claire Test"); await pro.fill("#ns-email", "claire@test.fr"); await pro.fill("#ns-phone", "+33 6 12 34 56 78");
    await pro.click("#ns-add");
    await pro.locator(".step-row").last().locator("input").first().fill("Nettoyage");
    await pro.locator(".step-row").last().locator("input").nth(1).fill("1");
    await pro.click('#new-site [type="submit"]');
    await toast(pro, /Chantier créé/);
    tracking = (await pro.textContent(".sp-code b")).trim();
    siteToken = (await pro.getAttribute("[data-copy-link]", "data-copy-link"));
    if (!/^ARC-\w{4}-\w{4}$/.test(tracking)) throw new Error("numéro de suivi absent");
  });
  await run("copier le lien et le numéro", async () => {
    await pro.click("[data-copy-link]"); await toast(pro, /Lien copié/);
    await pro.click("[data-copy-text]"); await toast(pro, /Copié/);
  });
  await run("publier une mise à jour avec photo", async () => {
    await pro.click(".bigbtn[data-publish]");
    await pro.setInputFiles("#cmp-photos", photo);
    await pro.waitForSelector("#cmp-thumbs img");
    await pro.fill("#cmp-text", "Meubles bas posés, plan de travail demain.");
    await pro.check("#cmp-done");
    await pro.click("#cmp-send");
    await pro.waitForSelector("#cmp-done-title");
    await pro.click("#cmp-close");
    await pro.waitForSelector(".entry .photos img");
  });
  await run("étapes : rouvrir, terminer, ajouter, changer une durée, supprimer", async () => {
    await pro.click('[data-site-tab="etapes"]');
    await pro.click('[data-step-action="reopen"]'); await toast(pro, /rouverte/);
    await pro.click('[data-step-action="finish"]'); await toast(pro, /terminée/);
    await pro.fill('#add-step [name="name"]', "Joints"); await pro.fill('#add-step [name="days"]', "2");
    await pro.click('#add-step [type="submit"]'); await toast(pro, /ajoutée/);
    await pro.fill("[data-step-days] >> nth=0", "3"); await pro.press("[data-step-days] >> nth=0", "Tab"); await toast(pro, /Durée prévue/);
    await pro.locator("[data-step-del]").last().click(); await toast(pro, /supprimée/);
  });
  await run("devis et factures : ajouter, marquer payée, supprimer", async () => {
    await pro.click('[data-site-tab="documents"]');
    await pro.fill("#doc-ref", "F-1"); await pro.fill("#doc-label", "Acompte"); await pro.fill("#doc-amount", "1500");
    await pro.click('#add-doc [type="submit"]'); await toast(pro, /Document ajouté/);
    await pro.click("[data-doc-paid]"); await toast(pro, /payée/);
    await pro.selectOption("#doc-kind", "devis"); await pro.selectOption("#doc-status", "en_attente");
    await pro.fill("#doc-ref", "D-1"); await pro.fill("#doc-label", "Devis cuisine"); await pro.fill("#doc-amount", "9000");
    await pro.click('#add-doc [type="submit"]'); await toast(pro, /Document ajouté/);
    await pro.click("[data-doc-signed]"); await toast(pro, /signé/);
    await pro.locator("[data-doc-del]").first().click(); await toast(pro, /supprimé/);
  });
  await run("lien et rapports : rapport, client, nouveau lien", async () => {
    await pro.click('[data-site-tab="partage"]');
    await pro.click("[data-send-report]"); await toast(pro, /Rapport envoyé/);
    await pro.fill("#ec-city", "Paris"); await pro.click('#edit-client [type="submit"]'); await toast(pro, /Client enregistré/);
    await pro.click("[data-new-link]"); await pro.click("[data-new-link]"); await toast(pro, /Nouveau lien/);
    siteToken = await pro.getAttribute("[data-copy-link]", "data-copy-link");
    await pro.click("[data-deliver]"); await toast(pro, /non validée/);
  });

  /* ---------- Client sans compte (lien privé) ---------- */
  const anonCtx = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const anon = await anonCtx.newPage();
  await run("le client ouvre son lien et valide l'étape", async () => {
    await anon.goto(BASE + "/c/" + siteToken);
    await anon.click("[data-cookies-refuse]");
    await anon.waitForSelector(".entry .photos img");
    await anon.click('[data-tab="etapes"]');
    await anon.click("[data-validate]"); await toast(anon, /Étape validée/);
    for (const tab of ["documents", "rapports", "journal"]) await anon.click(`[data-tab="${tab}"]`);
    if (!(await anon.textContent(".cl-code")).includes(tracking)) throw new Error("numéro de suivi absent de la page client");
  });
  await run("l'artisan voit « Vu par » et supprime une publication", async () => {
    await pro.goto(BASE + "/app#chantiers"); await pro.locator('a[href^="#chantier-"]').first().click();
    await pro.waitForSelector(".vu:not(.no)");
    await pro.click("[data-del-update]"); await pro.click("[data-del-update]"); await toast(pro, /supprimée/);
  });
  await run("pages chantiers, journal, photos, clients, tableau de bord", async () => {
    for (const h of ["chantiers", "journal", "photos", "clients", "tableau-de-bord"]) { await pro.goto(BASE + "/app#" + h); await pro.waitForSelector(".content-in > :not(.loading)"); }
    await pro.click("[data-publish] >> nth=0").catch(() => {}); // « Prévenir » ou bouton de mise à jour, s'il y en a
    await pro.keyboard.press("Escape");
  });
  await run("compte : profil, mot de passe, export, installer l'app", async () => {
    await pro.goto(BASE + "/app#compte");
    await pro.fill("#pf-city", "Villeurbanne"); await pro.click('#profile [type="submit"]'); await toast(pro, /Profil enregistré/);
    await pro.fill("#pw-current", "motdepasse1"); await pro.fill("#pw-new", "motdepasse2"); await pro.click('#password [type="submit"]'); await toast(pro, /Mot de passe enregistré/);
    const r = await pro.request.get(BASE + "/api/me/export"); if (!r.ok()) throw new Error("export " + r.status());
    await pro.click(".install [data-install]"); await pro.waitForSelector("[data-install-steps]:not([hidden])");
  });

  /* ---------- Client avec un espace ---------- */
  const cliCtx = await context();
  const cli = await cliCtx.newPage();
  let inviteCode = "";
  await run("inscription client", async () => {
    await cli.goto(BASE + "/inscription");
    await cli.click("[data-cookies-accept]");
    await cli.click('label:has(input[value="client"])');
    await cli.fill("#su-contact", "Awa Test"); await cli.click("#su-next");
    await cli.selectOption("#su-home", "CM"); await cli.fill("#su-homecity", "Douala"); await cli.click("#su-next");
    await cli.fill("#su-email", "awa@test.fr"); await cli.fill("#su-password", "motdepasse1"); await cli.click("#su-next");
    await cli.waitForURL(/\/app/); await cli.waitForSelector(".sp-empty");
  });
  await run("ajouter un chantier avec son numéro de suivi", async () => {
    await cli.goto(BASE + "/app#ajouter");
    await cli.fill("#cl-code", "ARC-0000-0000"); await cli.click('#claim [type="submit"]');
    await cli.waitForSelector("#claim .error-box:not([hidden])");
    await cli.fill("#cl-code", tracking.toLowerCase().replace(/-/g, " ")); await cli.click('#claim [type="submit"]');
    await toast(cli, /ajouté à votre espace/);
    await cli.waitForSelector(".sp-card");
  });
  await run("créer son chantier et inviter un proche", async () => {
    await cli.goto(BASE + "/app#nouveau");
    await cli.fill("#ns-name", "Maison de famille"); await cli.fill("#ns-location", "Yaoundé, Cameroun");
    await cli.click('#new-site [type="submit"]'); await toast(cli, /Chantier créé/);
    await cli.fill("#inv-name", "Paul Test");
    await cli.click('[data-invite="proche"]'); await toast(cli, /Invitation créée/);
    inviteCode = (await cli.textContent(".sp-invite .sp-code b")).trim();
    await cli.click(".sp-invite [data-copy]"); await toast(cli, /Copié/);
  });
  await run("offre, compte et lien de suivi du client", async () => {
    await cli.goto(BASE + "/app#offre"); await cli.waitForSelector(".sp-plans");
    await cli.goto(BASE + "/app#compte"); await cli.fill("#pf-city", "Paris"); await cli.click('#profile [type="submit"]'); await toast(cli, /Profil enregistré/);
    await cli.goto(BASE + "/app#mes-chantiers"); await cli.click('.sp-card a.btn.primary >> nth=0'); await cli.waitForSelector(".sitecard");
    await cli.click("a.back"); await cli.waitForURL(/#mes-chantiers/);
  });

  /* ---------- Proche invité (téléphone) ---------- */
  const proCtx2 = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pr = await proCtx2.newPage();
  await run("le proche accepte l'invitation et crée son accès", async () => {
    await pr.goto(BASE + "/invitation/" + inviteCode);
    await pr.click("[data-cookies-refuse]");
    await pr.click("#inv-signup");
    await pr.fill("#su-contact", "Paul Test"); await pr.click("#su-next");
    await pr.fill("#su-email", "paul@test.fr"); await pr.fill("#su-password", "motdepasse1"); await pr.click("#su-next");
    await pr.waitForURL(/\/app/);
  });
  await run("le proche publie depuis son téléphone", async () => {
    await pr.goto(BASE + "/app#chantiers"); await pr.click('[data-publish]');
    await pr.setInputFiles("#cmp-photos", photo); await pr.waitForSelector("#cmp-thumbs img");
    await pr.fill("#cmp-text", "Fondations coulées ce matin."); await pr.click("#cmp-send");
    await pr.waitForSelector("#cmp-done-title"); await pr.click("#cmp-close");
    await pr.goto(BASE + "/app#nouveau-chantier"); await pr.waitForURL(/#chantiers/); // un proche ne crée pas de chantier
    await pr.goto(BASE + "/app#compte"); await pr.waitForSelector("#profile"); if (await pr.$("#pf-company")) throw new Error("champ entreprise affiché au proche");
  });
  await run("le client reprend la main sur son chantier", async () => {
    await cli.goto(BASE + "/app#mes-chantiers"); await cli.waitForSelector(".sp-card");
    await cli.locator(".sp-card", { hasText: "Maison de famille" }).locator('a[href^="#chantier-"]').click();
    await cli.click("[data-take-back]"); await cli.click("[data-take-back]"); await toast(cli, /de nouveau/);
  });

  /* ---------- Connexion, langue, mot de passe oublié, suppression ---------- */
  await run("déconnexion puis connexion par e-mail", async () => {
    await cli.goto(BASE + "/app#compte"); await cli.click(".content-in [data-logout]"); await cli.waitForURL(/\/connexion/);
    await cli.fill("#li-email", "awa@test.fr"); await cli.fill("#li-password", "faux-mot"); await cli.click('#login [type="submit"]');
    await cli.waitForSelector("#login .error-box:not([hidden])");
    await cli.fill("#li-password", "motdepasse1"); await cli.click('#login [type="submit"]'); await cli.waitForURL(/\/app/);
  });
  await run("passer en anglais", async () => {
    await cli.selectOption("[data-lang-select] >> nth=0", "en"); await cli.waitForLoadState("load");
    await cli.waitForSelector("text=My projects");
    await cli.selectOption("[data-lang-select] >> nth=0", "fr"); await cli.waitForLoadState("load");
  });
  await run("mot de passe oublié", async () => {
    const p = await anonCtx.newPage(); await p.goto(BASE + "/mot-de-passe-oublie");
    await p.fill('#forgot [name="email"]', "awa@test.fr"); await p.click('#forgot [type="submit"]'); await p.waitForSelector("#forgot .okbox:not([hidden])");
  });
  await run("supprimer le compte client", async () => {
    await cli.goto(BASE + "/app#compte"); await cli.fill("#del-password", "motdepasse1"); await cli.click('#delete-account [type="submit"]');
    await cli.waitForURL(BASE + "/");
  });
  await run("l'artisan supprime son chantier", async () => {
    await pro.goto(BASE + "/app#chantiers"); await pro.locator('a[href^="#chantier-"]').first().click();
    await pro.click('[data-site-tab="partage"]'); await pro.click("[data-del-site]"); await pro.click("[data-del-site]");
    await toast(pro, /Chantier supprimé/);
  });

  await browser.close();
  server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  if (errors.length) { console.log(`\n${errors.length} problème(s) :\n- ` + errors.join("\n- ")); process.exitCode = 1; }
  else console.log("\nTous les parcours passent.");
  process.exit();
})();
