// Données de démo : deux comptes artisans (Lyon et Saly) avec chantiers terminés, chantiers en cours, photos, devis, factures et rapports.
// Usage : npm run seed   (remplace uniquement les deux comptes de démo)
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { all, run, tx, UPLOAD_DIR } = require("./db");
const { scene } = require("./scenes");
const { buildReport } = require("./reports");

const DAY = 864e5, H = 36e5;
const NOW = Date.now();
const PASSWORD = "archfield-demo";
const iso = (t) => new Date(t).toISOString();
const tok = (n) => crypto.randomBytes(n).toString("base64url");
let seed = 7;
const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

const PHRASES = {
  terrassement: ["Implantation faite avec le géomètre, terrassement commencé.", "Fouilles terminées, fond de fouille propre et sec."],
  fondations: ["Ferraillage des semelles en cours.", "Semelles coulées, décoffrage prévu dans 48 h.", "Béton de propreté coulé sur toute l'emprise."],
  soubassement: ["Première rangée de parpaings posée, niveaux vérifiés.", "Soubassement arasé, prêt pour l'élévation."],
  murs: ["Murs montés à mi-hauteur côté rue.", "Ouvertures des fenêtres réservées comme sur le plan.", "Chaînages verticaux coulés."],
  dalle: ["Coffrage de la dalle en place.", "Ferraillage de la dalle vérifié, coulage samedi.", "Dalle coulée, elle sèche sous bâche."],
  toiture: ["Charpente posée sur toute la longueur.", "Tôles posées sur la moitié du toit.", "Faîtage posé, il reste les gouttières."],
  menuiseries: ["Cadres des portes posés.", "Fenêtres livrées et posées côté jardin."],
  finitions: ["Enduit extérieur en cours.", "Première couche de peinture faite.", "Nettoyage de fin de chantier."],
  demolition: ["Benne livrée, dépose commencée.", "Cloisons démolies, gravats évacués."],
  plomberie: ["Arrivées d'eau déplacées pour la douche.", "Évacuations posées, test d'étanchéité fait."],
  electricite: ["Saignées faites dans le séjour.", "Tableau électrique posé.", "Gaines tirées dans les chambres."],
  platrerie: ["Rails et montants posés.", "Plaques posées, bandes en cours."],
  carrelage: ["Chape ragréée, pose demain.", "Faïence murale posée, joints faits."],
  peinture: ["Sous-couche passée partout.", "Deuxième couche faite, il reste les plinthes."],
  default: ["Travaux en cours, ça avance bien.", "Matériel livré et stocké à l'abri."]
};
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function phrasesFor(step) {
  const n = norm(step);
  const key = Object.keys(PHRASES).find((k) => n.includes(k)) || (n.includes("mur") ? "murs" : n.includes("depose") ? "demolition" : n.includes("sol") ? "carrelage" : n.includes("enduit") || n.includes("cuisine") || n.includes("sanitaire") ? "finitions" : n.includes("charpente") || n.includes("couverture") ? "toiture" : "default");
  return PHRASES[key];
}
function photoFile(kind, level) {
  const f = tok(18) + ".svg";
  fs.writeFileSync(path.join(UPLOAD_DIR, f), scene(kind, level, Math.floor(rand() * 900)));
  return f;
}
const level = (kind, i, n) => (kind === "ext" ? Math.min(6, Math.round((i / Math.max(1, n - 1)) * 6)) : Math.min(5, i));

function addPost(siteId, stepId, at, text, kind, lvl, nPhotos, seenAfterH) {
  const r = run("INSERT INTO updates (site_id, step_id, kind, text, created_at, seen_at) VALUES (?, ?, 'post', ?, ?, ?)", siteId, stepId, text, iso(at), seenAfterH == null ? null : iso(Math.min(NOW - 60e3, at + seenAfterH * H)));
  for (let i = 0; i < nPhotos; i++) run("INSERT INTO photos (update_id, file, taken_at) VALUES (?, ?, ?)", Number(r.lastInsertRowid), photoFile(kind, lvl), iso(at));
}

/*
 * Un chantier se décrit par ses étapes : [nom, jours prévus, jours réels, état]
 * état : v validée, a terminée à valider, c en cours (jours réels = jours écoulés), f à venir.
 * Les dates sont calculées à rebours depuis maintenant (ou depuis la livraison pour un chantier terminé).
 */
function makeSite(artisanId, d) {
  const anchor = d.deliveredDaysAgo != null ? NOW - d.deliveredDaysAgo * DAY : NOW;
  const steps = d.steps.map(([name, planned, actual, state]) => ({ name, planned, actual, state }));
  const run_ = steps.find((s) => s.state === "c");
  let t = run_ ? anchor - run_.actual * DAY : anchor - (d.deliveredDaysAgo != null ? 0 : 0.6 * DAY);
  if (run_) run_.start = t;
  const runIdx = run_ ? steps.indexOf(run_) : steps.length;
  for (let i = runIdx - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.state === "f") continue;
    s.end = t; s.start = t - s.actual * DAY; t = s.start - (rand() < 0.3 ? DAY : 0);
  }
  const startedAt = Math.min(...steps.filter((s) => s.start).map((s) => s.start));
  const createdAt = startedAt - 6 * DAY;
  const r = run(
    `INSERT INTO sites (artisan_id, name, location, kind, client_name, client_short, client_email, client_city, client_token, budget, status, created_at, delivered_at, last_client_visit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    artisanId, d.name, d.location, d.kind, d.client, d.short, d.email || "", d.city, d.token || tok(16), d.budget,
    d.deliveredDaysAgo != null ? "delivered" : "active", iso(createdAt), d.deliveredDaysAgo != null ? iso(anchor + DAY) : null, iso(NOW - (d.lastVisitH || 2) * H));
  const siteId = Number(r.lastInsertRowid);

  steps.forEach((s, i) => {
    const validated = s.state === "v" ? s.end + (0.2 + rand()) * DAY : null;
    const st = run("INSERT INTO steps (site_id, position, name, planned_days, started_at, finished_at, validated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      siteId, i + 1, s.name, s.planned, s.start ? iso(s.start) : null, s.end ? iso(s.end) : null, validated ? iso(Math.min(validated, NOW - H)) : null);
    s.id = Number(st.lastInsertRowid);
    if (!s.start) return;
    const lvl = level(d.kind, i, steps.length);
    const end = s.end || NOW;
    const custom = s.state === "c" && d.latest ? d.latest : null;
    if (custom) {
      custom.forEach((p) => addPost(siteId, s.id, NOW - p.hAgo * H, p.text, d.kind, lvl, p.photos, p.seenAfterH));
    } else {
      const texts = phrasesFor(s.name);
      const n = Math.max(1, Math.min(texts.length, Math.round((end - s.start) / DAY / 4)));
      for (let k = 0; k < n; k++) {
        const at = s.start + ((k + 0.6) / (n + 0.2)) * (end - s.start) + (rand() - 0.5) * 6 * H;
        const day = new Date(at); day.setHours(8 + Math.floor(rand() * 10), Math.floor(rand() * 60), 0, 0); // heures de chantier
        addPost(siteId, s.id, Math.min(day.getTime(), NOW - 2 * H), texts[k], d.kind, lvl, 1 + Math.floor(rand() * 3), 0.3 + rand() * 7);
      }
    }
    if (s.end) run("INSERT INTO updates (site_id, step_id, kind, created_at, seen_at) VALUES (?, ?, 'step_done', ?, ?)", siteId, s.id, iso(s.end), iso(Math.min(NOW - H, s.end + 3 * H)));
    if (validated) run("INSERT INTO updates (site_id, step_id, kind, created_at, seen_at) VALUES (?, ?, 'step_validated', ?, ?)", siteId, s.id, iso(Math.min(validated, NOW - H)), iso(Math.min(validated, NOW - H)));
  });

  // Devis, acompte, situations par paires d'étapes validées.
  const day = (t) => iso(t).slice(0, 10);
  const pfx = d.currency === "XOF" ? ["DV", "FA"] : ["D", "F"];
  const year = new Date(createdAt).getFullYear();
  run("INSERT INTO documents (site_id, kind, ref, label, amount, status, doc_date) VALUES (?, 'devis', ?, ?, ?, 'signe', ?)", siteId, `${pfx[0]}-${year}-${100 + siteId}`, d.quoteLabel || "Travaux " + d.name.toLowerCase(), d.budget, day(createdAt));
  run("INSERT INTO documents (site_id, kind, ref, label, amount, status, doc_date) VALUES (?, 'facture', ?, 'Acompte de démarrage (30 %)', ?, 'payee', ?)", siteId, `${pfx[1]}-${year}-${200 + siteId * 3}`, Math.round(d.budget * 0.3), day(createdAt + 3 * DAY));
  const done = steps.filter((s) => s.end);
  const total = steps.reduce((a, s) => a + s.planned, 0);
  for (let i = 1; i < done.length; i += 2) {
    const share = (done[i].planned + done[i - 1].planned) / total;
    const last = i >= done.length - 2 && d.deliveredDaysAgo == null;
    run("INSERT INTO documents (site_id, kind, ref, label, amount, status, doc_date) VALUES (?, 'facture', ?, ?, ?, ?, ?)",
      siteId, `${pfx[1]}-${year}-${201 + siteId * 3 + i}`, `Situation : ${done[i - 1].name.toLowerCase()} et ${done[i].name.toLowerCase()}`, Math.round(d.budget * 0.7 * share), last ? "a_regler" : "payee", day(done[i].end + DAY));
  }

  // Rapports des lundis passés (8 dernières semaines au plus).
  if (d.deliveredDaysAgo == null) {
    const site = all("SELECT * FROM sites WHERE id = ?", siteId)[0];
    const monday = new Date(NOW); monday.setUTCHours(7, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    if (monday.getTime() > NOW) monday.setUTCDate(monday.getUTCDate() - 7);
    for (let w = 0; w < 8; w++) {
      const end = monday.getTime() - w * 7 * DAY;
      if (end < createdAt) break;
      const data = buildReport(site, new Date(end - 7 * DAY), new Date(end), NOW);
      const opened = rand() < (d.readRate ?? 0.9) ? iso(Math.min(NOW - H, end + (1 + rand() * 30) * H)) : null;
      run("INSERT INTO reports (site_id, period_start, period_end, data, sent_at, emailed, opened_at) VALUES (?, ?, ?, ?, ?, 1, ?)", siteId, iso(end - 7 * DAY), iso(end), JSON.stringify(data), iso(end), opened);
    }
  }
  return siteId;
}

// Chantier terminé : durées réelles tirées autour des durées prévues, avec un biais par type d'étape.
function delivered(template, bias, opts) {
  return { ...opts, steps: template.map(([n, p]) => [n, p, Math.max(0.5, Math.round(p * (bias[n] ?? 1) * (0.9 + rand() * 0.16) * 2) / 2), "v"]) };
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const accounts = [
    { email: "demo@archfield.app", company: "Atelier Rhône Rénovation", contact: "Marc Soler", city: "Lyon", market: "eu", currency: "EUR" },
    { email: "demo-afrique@archfield.app", company: "Sarr Construction", contact: "Moussa Sarr", city: "Saly, Sénégal", market: "af", currency: "XOF" }
  ];
  const ids = tx(() => {
    for (const a of accounts) {
      for (const s of all("SELECT p.file FROM photos p JOIN updates u ON u.id = p.update_id JOIN sites si ON si.id = u.site_id JOIN artisans ar ON ar.id = si.artisan_id WHERE ar.email = ?", a.email))
        fs.rmSync(path.join(UPLOAD_DIR, s.file), { force: true });
      run("DELETE FROM artisans WHERE email = ?", a.email);
    }
    return accounts.map((a) => Number(run(
      "INSERT INTO artisans (email, password_hash, company, contact_name, city, market, currency, trial_ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      a.email, hash, a.company, a.contact, a.city, a.market, a.currency, iso(NOW + 41 * DAY), iso(NOW - 400 * DAY)).lastInsertRowid));
  });
  const [eu, af] = ids;

  tx(() => {
    /* ---- Lyon : rénovation intérieure ---- */
    const INT = [["Démolition", 3], ["Plomberie", 5], ["Électricité", 4], ["Plâtrerie", 6], ["Carrelage", 4], ["Peinture", 4]];
    const euBias = { "Démolition": 0.95, "Plomberie": 1.25, "Électricité": 1, "Plâtrerie": 1.3, "Carrelage": 0.95, "Peinture": 0.9 };
    const euDone = [
      ["Appartement", "Lyon 6e", "M. Garcia", "M. Garcia", 31000, 320], ["Salle de bain", "Villeurbanne", "Mme Diallo", "Mme Diallo", 9200, 280],
      ["Studio", "Lyon 8e", "SCI Monplaisir", "SCI Monplaisir", 18500, 230], ["Cuisine", "Caluire", "Mme Martin", "Mme Martin", 12600, 170],
      ["Duplex", "Lyon 4e", "Thomas Bernard", "Thomas", 46000, 110], ["Salle de bain", "Tassin", "Mme Rousseau", "Mme Rousseau", 8700, 45]
    ];
    euDone.forEach(([name, location, client, short, budget, ago]) => makeSite(eu, delivered(INT, euBias, { name, location, kind: "int", client, short, city: location, budget, deliveredDaysAgo: ago, currency: "EUR" })));
    const euActive = [
      { name: "Cuisine", location: "Villeurbanne", kind: "int", client: "Mme Benali", short: "Mme Benali", city: "Villeurbanne", budget: 14800, readRate: 1,
        steps: [["Démolition", 2, 2, "v"], ["Plomberie", 3, 3, "v"], ["Électricité", 2, 2, "v"], ["Plâtrerie", 6, 8, "c"], ["Carrelage", 3, 0, "f"], ["Pose cuisine", 3, 0, "f"]],
        latest: [{ hAgo: 20, text: "Bandes du placo faites côté fenêtre. Il reste le mur de l'évier, l'enduit sèche mal avec l'humidité.", photos: 2, seenAfterH: 2 }, { hAgo: 90, text: "Cloison entre cuisine et séjour montée.", photos: 1, seenAfterH: 1 }] },
      { name: "Studio", location: "Lyon 7e", kind: "int", client: "SCI Gerland", short: "SCI Gerland", city: "Lyon", budget: 22500, readRate: 0.75,
        steps: [["Démolition", 3, 3, "v"], ["Plomberie", 5, 6.5, "c"], ["Électricité", 4, 0, "f"], ["Plâtrerie", 5, 0, "f"], ["Sols", 3, 0, "f"], ["Peinture", 4, 0, "f"]],
        latest: [{ hAgo: 30, text: "Nouvelle colonne d'évacuation posée, raccord avec la copropriété vendredi.", photos: 2, seenAfterH: 5 }] },
      { name: "Appartement", location: "Lyon 3e", kind: "int", client: "Claire Moreau", short: "Claire", city: "Paris", budget: 38400, token: "demo-lyon-claire",
        steps: [["Démolition", 4, 4, "v"], ["Plomberie", 6, 6, "v"], ["Électricité", 4, 4.5, "c"], ["Plâtrerie", 8, 0, "f"], ["Carrelage", 5, 0, "f"], ["Peinture", 6, 0, "f"], ["Pose cuisine", 3, 0, "f"]],
        latest: [{ hAgo: 1, text: "Tableau électrique posé. Il reste deux circuits dans la cuisine.", photos: 3, seenAfterH: 0.5 }, { hAgo: 52, text: "Saignées faites dans le séjour et la chambre 1.", photos: 2, seenAfterH: 3 }] },
      { name: "Salle de bain", location: "Croix-Rousse", kind: "int", client: "M. Lefèvre", short: "M. Lefèvre", city: "Lyon", budget: 8900,
        steps: [["Dépose", 2, 2, "v"], ["Plomberie", 3, 3, "v"], ["Carrelage", 4, 4, "v"], ["Peinture", 2, 1, "c"]],
        latest: [{ hAgo: 26, text: "Première couche au plafond, finition demain.", photos: 1, seenAfterH: 1 }] },
      { name: "Toiture", location: "Caluire", kind: "ext", client: "M. Petit", short: "M. Petit", city: "Caluire", budget: 17600,
        steps: [["Dépose tuiles", 3, 3, "v"], ["Charpente", 5, 5, "v"], ["Couverture", 6, 6, "v"], ["Finitions", 2, 1, "c"]],
        latest: [{ hAgo: 20, text: "Faîtage posé, il reste les gouttières.", photos: 2, seenAfterH: 2 }] },
      { name: "Maison", location: "Écully", kind: "ext", client: "Famille Roux", short: "la famille Roux", city: "Écully", budget: 64000,
        steps: [["Démolition", 5, 3, "c"], ["Gros œuvre", 20, 0, "f"], ["Plomberie", 8, 0, "f"], ["Électricité", 8, 0, "f"], ["Plâtrerie", 10, 0, "f"], ["Peinture", 8, 0, "f"]],
        latest: [{ hAgo: 8, text: "Benne livrée, dépose de l'ancienne véranda commencée.", photos: 1, seenAfterH: null }] }
    ];
    euActive.forEach((s) => makeSite(eu, { ...s, currency: "EUR" }));

    /* ---- Saly : gros œuvre pour la diaspora ---- */
    const EXT = [["Terrassement", 6], ["Fondations", 14], ["Élévation des murs", 18], ["Dalle et chaînage", 12], ["Toiture", 9], ["Menuiseries", 10], ["Enduits et finitions", 20]];
    const afBias = { "Terrassement": 0.92, "Fondations": 1, "Élévation des murs": 1.22, "Dalle et chaînage": 0.95, "Toiture": 0.92, "Menuiseries": 1.3, "Enduits et finitions": 0.95 };
    const afDone = [
      ["Villa Fall", "Saly, Sénégal", "Mamadou Fall", "Mamadou", "Lyon", 24000000, 300], ["Maison Ba", "Mbour, Sénégal", "Aïssatou Ba", "Aïssatou", "Paris", 19500000, 210],
      ["Villa Cissé", "Somone, Sénégal", "Ousmane Cissé", "Ousmane", "Madrid", 31000000, 120], ["Maison Gueye", "Saly, Sénégal", "Khady Gueye", "Khady", "Turin", 17800000, 60]
    ];
    afDone.forEach(([name, location, client, short, city, budget, ago]) => makeSite(af, delivered(EXT, afBias, { name, location, kind: "ext", client, short, city, budget, deliveredDaysAgo: ago, currency: "XOF", quoteLabel: "Gros œuvre et finitions" })));
    const afActive = [
      { name: "Villa Ndiaye", location: "Saly, Sénégal", kind: "ext", client: "Awa Ndiaye", short: "Awa", city: "Paris", budget: 21700000, token: "demo-saly-awa", quoteLabel: "Gros œuvre complet", readRate: 1,
        steps: [["Terrassement", 6, 6, "v"], ["Fondations", 14, 15, "v"], ["Soubassement", 7, 7, "a"], ["Élévation des murs", 14, 17, "c"], ["Dalle et chaînage", 12, 0, "f"], ["Toiture", 9, 0, "f"], ["Finitions", 20, 0, "f"]],
        latest: [{ hAgo: 0.8, text: "Murs du salon montés à 2,10 m. On attaque la chambre principale demain.", photos: 3, seenAfterH: 0.5 }, { hAgo: 20, text: "Livraison de 400 parpaings, stockés à l'abri.", photos: 0, seenAfterH: 1.5 }, { hAgo: 70, text: "Premières rangées montées sur tout le périmètre.", photos: 2, seenAfterH: 3 }] },
      { name: "Immeuble R+1", location: "Thiès, Sénégal", kind: "ext", client: "Ibrahima Kane", short: "Ibrahima", city: "Montréal", budget: 41000000, readRate: 0.8,
        steps: [["Terrassement", 6, 6, "v"], ["Fondations", 16, 21, "c"], ["Élévation des murs", 28, 0, "f"], ["Dalle et chaînage", 18, 0, "f"], ["Toiture-terrasse", 12, 0, "f"], ["Finitions", 30, 0, "f"]],
        latest: [{ hAgo: 170, text: "Semelles coulées côté rue. Il reste le côté cour, retard dû aux pluies.", photos: 2, seenAfterH: 9 }] },
      { name: "Maison Diop", location: "Mbour, Sénégal", kind: "ext", client: "Cheikh Diop", short: "Cheikh", city: "Milan", budget: 26500000,
        steps: [["Terrassement", 6, 5, "v"], ["Fondations", 14, 14, "v"], ["Élévation des murs", 18, 18, "v"], ["Dalle et chaînage", 12, 12, "v"], ["Toiture", 9, 4, "c"], ["Menuiseries", 10, 0, "f"], ["Finitions", 20, 0, "f"]],
        latest: [{ hAgo: 28, text: "Charpente posée sur toute la longueur. Les tôles arrivent lundi.", photos: 3, seenAfterH: 3 }] },
      { name: "Villa Sow", location: "Somone, Sénégal", kind: "ext", client: "Fatou Sow", short: "Fatou", city: "Bruxelles", budget: 19800000,
        steps: [["Terrassement", 6, 3, "c"], ["Fondations", 14, 0, "f"], ["Élévation des murs", 18, 0, "f"], ["Dalle et chaînage", 12, 0, "f"], ["Toiture", 9, 0, "f"], ["Finitions", 20, 0, "f"]],
        latest: [{ hAgo: 50, text: "Implantation faite avec le géomètre, terrassement commencé.", photos: 2, seenAfterH: 1 }] }
    ];
    afActive.forEach((s) => makeSite(af, { ...s, currency: "XOF" }));
  });

  console.log(`Données de démo prêtes.
  Lyon (€)      : demo@archfield.app / ${PASSWORD}   · lien client : /c/demo-lyon-claire
  Saly (FCFA)   : demo-afrique@archfield.app / ${PASSWORD}   · lien client : /c/demo-saly-awa`);
}

main().catch((e) => { console.error(e); process.exit(1); });
