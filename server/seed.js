// Données de démo : deux comptes artisans (Lyon et Saly) avec chantiers terminés, chantiers en cours, photos, devis, factures et rapports.
// Usage : npm run seed   (remplace uniquement les deux comptes de démo)
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { all, run, tx, UPLOAD_DIR, newTrackingCode } = require("./db");
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
// Vraies photos de démo si le dossier demo/photos en contient (voir demo/photos/LISEZMOI.md), sinon scènes dessinées.
// Nom des fichiers : <type>-<niveau>-<n>.jpg, type « ext » (construction) ou « int » (rénovation),
// niveau = avancement de 0 (terrain) à 6 (finitions), ex. ext-0-1.jpg, ext-3-2.jpg, int-2-1.jpg.
const DEMO_PHOTOS = path.join(__dirname, "..", "demo", "photos");
const realPhotos = fs.existsSync(DEMO_PHOTOS) ? fs.readdirSync(DEMO_PHOTOS).filter((f) => /\.jpe?g$/i.test(f)) : [];
function photoFile(kind, level) {
  const pool = realPhotos.filter((f) => f.startsWith(`${kind}-${level}-`));
  const near = pool.length ? pool : realPhotos.filter((f) => f.startsWith(`${kind}-`)).sort((a, b) => Math.abs(Number(a.split("-")[1]) - level) - Math.abs(Number(b.split("-")[1]) - level));
  if (near.length) {
    const pick = pool.length ? pool[Math.floor(rand() * pool.length)] : near[0];
    const f = tok(18) + ".jpg";
    fs.copyFileSync(path.join(DEMO_PHOTOS, pick), path.join(UPLOAD_DIR, f));
    return f;
  }
  const f = tok(18) + ".svg";
  fs.writeFileSync(path.join(UPLOAD_DIR, f), scene(kind, level, Math.floor(rand() * 900)));
  return f;
}
const level = (kind, i, n) => (kind === "ext" ? Math.min(6, Math.round((i / Math.max(1, n - 1)) * 6)) : Math.min(5, i));

// Publication de démo : vérifiée (photos prises quelques minutes avant, sur le chantier), sauf si warn.
function addPost(siteId, stepId, at, text, kind, lvl, nPhotos, seenAfterH, warn) {
  const note = warn ? { position: "far", distance: 8400, accuracy: 15, photos: "old", old_shot_at: iso(at - 12 * DAY) }
    : { position: "near", distance: 20 + Math.round(rand() * 120), accuracy: 6 + Math.round(rand() * 20), photos: nPhotos ? "fresh" : "none" };
  const r = run("INSERT INTO updates (site_id, step_id, kind, text, created_at, seen_at, verify, verify_note) VALUES (?, ?, 'post', ?, ?, ?, ?, ?)", siteId, stepId, text, iso(at), seenAfterH == null ? null : iso(Math.min(NOW - 60e3, at + seenAfterH * H)), warn ? "warning" : "verified", JSON.stringify(note));
  for (let i = 0; i < nPhotos; i++) run("INSERT INTO photos (update_id, file, taken_at, shot_at) VALUES (?, ?, ?, ?)", Number(r.lastInsertRowid), photoFile(kind, lvl), iso(at), iso(warn ? at - 12 * DAY : at - (4 + rand() * 30) * 60e3));
}
// Reçu d'achat dessiné (pour les dépenses de démo).
function receiptFile(label, amount, cur) {
  const f = tok(18) + ".svg";
  const txt = (x) => String(x).replace(/[<&]/g, "");
  fs.writeFileSync(path.join(UPLOAD_DIR, f), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320"><rect width="240" height="320" fill="#EDE6D6"/><rect x="20" y="16" width="200" height="290" fill="#FFFDF7"/><text x="120" y="48" font-family="monospace" font-size="13" text-anchor="middle" fill="#333">QUINCAILLERIE</text><text x="120" y="64" font-family="monospace" font-size="9" text-anchor="middle" fill="#666">REÇU N° ${100 + Math.floor(rand() * 899)}</text>${[90, 110, 130, 150].map((y) => `<rect x="36" y="${y}" width="${90 + Math.floor(rand() * 70)}" height="5" fill="#C9C2B2"/>`).join("")}<text x="36" y="200" font-family="monospace" font-size="10" fill="#333">${txt(label).slice(0, 26)}</text><line x1="36" y1="220" x2="204" y2="220" stroke="#999" stroke-dasharray="3 3"/><text x="204" y="245" font-family="monospace" font-size="13" text-anchor="end" fill="#111">TOTAL ${amount.toLocaleString("fr-FR")} ${cur}</text><text x="120" y="285" font-family="monospace" font-size="9" text-anchor="middle" fill="#888">MERCI DE VOTRE VISITE</text></svg>`);
  return f;
}
// Lignes d'argent de démo : [type, montant, jours passés, libellé, catégorie ou moyen, auteur, reçu ?, annulée ?]
function addLedger(siteId, rows, cur) {
  for (const [kind, amount, daysAgo, label, category, by, receipt, cancel] of rows) {
    const a = all("SELECT id, contact_name FROM artisans WHERE id = ?", by)[0];
    const at = NOW - daysAgo * DAY;
    run(`INSERT INTO ledger (site_id, kind, amount, label, category, entry_date, receipt_file, created_by, created_by_name, created_at, cancelled_at, cancelled_by_name, cancel_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      siteId, kind, amount, label, category, iso(at).slice(0, 10), receipt ? receiptFile(label, amount, cur) : null, a.id, a.contact_name, iso(at + 2 * H),
      cancel ? iso(at + 26 * H) : null, cancel ? a.contact_name : null, cancel || "");
  }
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
  const started = steps.filter((s) => s.start).map((s) => s.start);
  const createdAt = started.length ? Math.min(...started) - 6 * DAY : NOW - 2 * DAY;
  const r = run(
    `INSERT INTO sites (artisan_id, owner_id, currency, lat, lng, position_set_at, position_set_by, name, location, kind, client_name, client_short, client_email, client_city, client_token, tracking_code, budget, status, created_at, delivered_at, last_client_visit_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    artisanId, d.ownerId || null, d.currency || "EUR", d.lat ?? null, d.lng ?? null, d.lat != null ? iso(NOW - 40 * DAY) : null, d.lat != null ? all("SELECT contact_name FROM artisans WHERE id = ?", artisanId)[0].contact_name : null, d.name, d.location, d.kind, d.client, d.short, d.email || "", d.city, d.token || tok(16), d.tracking || newTrackingCode(), d.budget,
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
      custom.forEach((p) => addPost(siteId, s.id, NOW - p.hAgo * H, p.text, d.kind, lvl, p.photos, p.seenAfterH, p.warn));
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

  // Devis, acompte, situations par paires d'étapes validées (pas de devis pour un chantier sans montant).
  if (d.budget) addDocuments(siteId, d, steps, createdAt);
  addReports(siteId, d, createdAt);
  return siteId;
}

function addDocuments(siteId, d, steps, createdAt) {
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

}

// Rapports des lundis passés (8 dernières semaines au plus).
function addReports(siteId, d, createdAt) {
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
    // SIRET fictif, mais à la clé valide : il n'appartient à aucune entreprise réelle.
    { email: "demo@archfield.app", company: "Atelier Rhône Rénovation", contact: "Marc Soler", city: "Lyon", country: "FR", companyId: "90012345600007", market: "eu", currency: "EUR" },
    { email: "demo-afrique@archfield.app", company: "Sarr Construction", contact: "Moussa Sarr", city: "Saly, Sénégal", country: "SN", companyId: "", market: "af", currency: "XOF" },
    // Espace client : Awa, à Paris, suit sa villa (Sarr Construction) et la maison familiale confiée à son frère.
    { email: "demo-client@archfield.app", type: "client", company: "Awa Ndiaye", contact: "Awa Ndiaye", city: "Paris", country: "FR", companyId: "", market: "eu", currency: "EUR" },
    { email: "demo-proche@archfield.app", type: "proche", company: "Ousmane Ndiaye", contact: "Ousmane Ndiaye", city: "Thiès, Sénégal", country: "SN", companyId: "", market: "eu", currency: "EUR" }
  ];
  const ids = tx(() => {
    for (const a of accounts) {
      for (const s of all("SELECT p.file FROM photos p JOIN updates u ON u.id = p.update_id JOIN sites si ON si.id = u.site_id JOIN artisans ar ON ar.id = si.artisan_id WHERE ar.email = ?", a.email))
        fs.rmSync(path.join(UPLOAD_DIR, s.file), { force: true });
      run("DELETE FROM artisans WHERE email = ?", a.email);
    }
    return accounts.map((a) => Number(run(
      "INSERT INTO artisans (email, password_hash, account_type, company, contact_name, city, country, company_id, market, currency, trial_ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      a.email, hash, a.type || "pro", a.company, a.contact, a.city, a.country, a.companyId, a.market, a.currency, iso(NOW + 41 * DAY), iso(NOW - 400 * DAY)).lastInsertRowid));
  });
  const [eu, af, client, proche] = ids;

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
    const lyon = euActive.map((s) => makeSite(eu, { ...s, currency: "EUR", lat: 45.7578, lng: 4.8320 }));
    addLedger(lyon[2], [["versement", 11520, 30, "Acompte 30 %", "virement", eu], ["versement", 6000, 8, "Situation plomberie", "virement", eu], ["depense", 2380, 25, "Tableau électrique et disjoncteurs", "materiaux", eu, true]], "€");

    /* ---- Saly : gros œuvre pour la diaspora ---- */
    const EXT = [["Terrassement", 6], ["Fondations", 14], ["Élévation des murs", 18], ["Dalle et chaînage", 12], ["Toiture", 9], ["Menuiseries", 10], ["Enduits et finitions", 20]];
    const afBias = { "Terrassement": 0.92, "Fondations": 1, "Élévation des murs": 1.22, "Dalle et chaînage": 0.95, "Toiture": 0.92, "Menuiseries": 1.3, "Enduits et finitions": 0.95 };
    const afDone = [
      ["Villa Fall", "Saly, Sénégal", "Mamadou Fall", "Mamadou", "Lyon", 24000000, 300], ["Maison Ba", "Mbour, Sénégal", "Aïssatou Ba", "Aïssatou", "Paris", 19500000, 210],
      ["Villa Cissé", "Somone, Sénégal", "Ousmane Cissé", "Ousmane", "Madrid", 31000000, 120], ["Maison Gueye", "Saly, Sénégal", "Khady Gueye", "Khady", "Turin", 17800000, 60]
    ];
    afDone.forEach(([name, location, client, short, city, budget, ago]) => makeSite(af, delivered(EXT, afBias, { name, location, kind: "ext", client, short, city, budget, deliveredDaysAgo: ago, currency: "XOF", quoteLabel: "Gros œuvre et finitions" })));
    const afActive = [
      { name: "Villa Ndiaye", location: "Saly, Sénégal", kind: "ext", client: "Awa Ndiaye", short: "Awa", city: "Paris", budget: 21700000, token: "demo-saly-awa", tracking: "ARC-SALY-2026", ownerId: client, quoteLabel: "Gros œuvre complet", readRate: 1, lat: 14.4472, lng: -17.0089,
        steps: [["Terrassement", 6, 6, "v"], ["Fondations", 14, 15, "v"], ["Soubassement", 7, 7, "a"], ["Élévation des murs", 14, 17, "c"], ["Dalle et chaînage", 12, 0, "f"], ["Toiture", 9, 0, "f"], ["Finitions", 20, 0, "f"]],
        latest: [{ hAgo: 0.8, text: "Murs du salon montés à 2,10 m. On attaque la chambre principale demain.", photos: 3, seenAfterH: 0.5 }, { hAgo: 20, text: "Livraison de 400 parpaings, stockés à l'abri.", photos: 0, seenAfterH: 1.5 }, { hAgo: 70, text: "Premières rangées montées sur tout le périmètre.", photos: 2, seenAfterH: 3 }] },
      { name: "Immeuble R+1", location: "Thiès, Sénégal", kind: "ext", client: "Ibrahima Kane", short: "Ibrahima", city: "Montréal", budget: 41000000, readRate: 0.8,
        steps: [["Terrassement", 6, 6, "v"], ["Fondations", 16, 21, "c"], ["Élévation des murs", 28, 0, "f"], ["Dalle et chaînage", 18, 0, "f"], ["Toiture-terrasse", 12, 0, "f"], ["Finitions", 30, 0, "f"]],
        latest: [{ hAgo: 170, text: "Semelles coulées côté rue. Il reste le côté cour, retard dû aux pluies.", photos: 2, seenAfterH: 9, warn: true }] },
      { name: "Maison Diop", location: "Mbour, Sénégal", kind: "ext", client: "Cheikh Diop", short: "Cheikh", city: "Milan", budget: 26500000,
        steps: [["Terrassement", 6, 5, "v"], ["Fondations", 14, 14, "v"], ["Élévation des murs", 18, 18, "v"], ["Dalle et chaînage", 12, 12, "v"], ["Toiture", 9, 4, "c"], ["Menuiseries", 10, 0, "f"], ["Finitions", 20, 0, "f"]],
        latest: [{ hAgo: 28, text: "Charpente posée sur toute la longueur. Les tôles arrivent lundi.", photos: 3, seenAfterH: 3 }] },
      { name: "Villa Sow", location: "Somone, Sénégal", kind: "ext", client: "Fatou Sow", short: "Fatou", city: "Bruxelles", budget: 19800000,
        steps: [["Terrassement", 6, 3, "c"], ["Fondations", 14, 0, "f"], ["Élévation des murs", 18, 0, "f"], ["Dalle et chaînage", 12, 0, "f"], ["Toiture", 9, 0, "f"], ["Finitions", 20, 0, "f"]],
        latest: [{ hAgo: 50, text: "Implantation faite avec le géomètre, terrassement commencé.", photos: 2, seenAfterH: 1 }] }
    ];
    const [villa] = afActive.map((s) => makeSite(af, { ...s, currency: "XOF" }));
    // Villa Ndiaye : échéancier par étape, versements d'Awa et dépenses de Sarr Construction avec reçus.
    // Awa a versé 60 % du budget pour un peu moins de la moitié des travaux : l'alerte apparaît.
    [3640000, 4340000, 2170000, 4340000, 3255000, 2170000, 1785000].forEach((amount, i) => run("UPDATE steps SET amount = ? WHERE site_id = ? AND position = ?", amount, villa, i + 1));
    addLedger(villa, [
      ["versement", 6510000, 62, "Acompte de démarrage", "virement", client], ["versement", 4340000, 30, "Fondations", "wave", client], ["versement", 3270000, 6, "Soubassement et murs", "orange_money", client],
      ["depense", 1980000, 58, "Ciment, 360 sacs", "materiaux", af, true], ["depense", 1250000, 40, "Fer à béton", "materiaux", af, true], ["depense", 420000, 39, "Sable, 2 camions", "transport", af, true, "Noté deux fois par erreur"],
      ["depense", 420000, 39, "Sable, 2 camions", "transport", af, true], ["depense", 1650000, 21, "Paie des maçons, 3 semaines", "main_oeuvre", af], ["depense", 1600000, 4, "Parpaings, 400 pièces", "materiaux", af, true]
    ], "FCFA");

    /* ---- Espace client d'Awa ---- */
    // Maison familiale confiée à Ousmane, son frère sur place : il publie, Awa paie l'offre (ici, l'essai Premium).
    const famille = makeSite(proche, { name: "Maison familiale", location: "Thiès, Sénégal", kind: "ext", client: "Awa Ndiaye", short: "Awa", email: "demo-client@archfield.app", city: "Paris", budget: 12500000, ownerId: client, tracking: "ARC-THES-FAM2", currency: "XOF", lat: 14.7910, lng: -16.9359,
      steps: [["Terrassement", 5, 5, "v"], ["Fondations", 12, 14, "c"], ["Élévation des murs", 16, 0, "f"], ["Dalle et chaînage", 10, 0, "f"], ["Toiture", 8, 0, "f"]],
      latest: [{ hAgo: 3, text: "Le ferrailleur a fini côté cour. Coulage des semelles demain si le camion arrive.", photos: 2, seenAfterH: 0.4 }, { hAgo: 50, text: "Fouilles terminées, j'ai vérifié les niveaux avec le maçon.", photos: 2, seenAfterH: 2 }] });
    // Ousmane gère l'argent envoyé par Awa : chaque achat est noté avec son reçu.
    addLedger(famille, [
      ["versement", 2500000, 40, "Pour le terrassement et les fondations", "wave", client], ["versement", 1500000, 9, "Fer et ciment", "wave", client],
      ["depense", 650000, 38, "Terrassement, location de pelleteuse", "main_oeuvre", proche, true], ["depense", 1340000, 20, "Ciment, 240 sacs", "materiaux", proche, true],
      ["depense", 980000, 8, "Fer à béton", "materiaux", proche, true], ["depense", 120000, 2, "Transport du fer", "transport", proche]
    ], "FCFA");
    run("UPDATE steps SET amount = ? WHERE site_id = ? AND position = 1", 2500000, famille);

    // Extension pas encore confiée : Awa a invité une entreprise, en attente de réponse.
    const ext = makeSite(client, { name: "Extension", location: "Rufisque, Sénégal", kind: "ext", client: "Awa Ndiaye", short: "Awa", email: "demo-client@archfield.app", city: "Paris", budget: 0, ownerId: client, tracking: "ARC-RUFQ-EXT3", currency: "XOF",
      steps: [["Terrassement", 4, 0, "f"], ["Fondations", 10, 0, "f"], ["Élévation des murs", 12, 0, "f"], ["Toiture", 7, 0, "f"]] });
    run("INSERT INTO invitations (code, site_id, kind, invitee_name, created_by, created_at) VALUES ('INV-DEMO-RUFQ', ?, 'pro', 'Entreprise Diallo BTP', ?, ?)", ext, client, iso(NOW - 26 * H));
  });

  console.log(`Données de démo prêtes.
  Lyon (€)      : demo@archfield.app / ${PASSWORD}   · lien client : /c/demo-lyon-claire
  Saly (FCFA)   : demo-afrique@archfield.app / ${PASSWORD}   · lien client : /c/demo-saly-awa
  Client        : demo-client@archfield.app / ${PASSWORD}   · Awa, 3 chantiers dans son espace
  Proche        : demo-proche@archfield.app / ${PASSWORD}   · Ousmane, gère la maison familiale d'Awa`);
}

main().catch((e) => { console.error(e); process.exit(1); });
