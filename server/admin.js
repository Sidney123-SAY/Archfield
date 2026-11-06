// Espace d'administration (équipe Archfield) : comptes, offres activées à la main, demandes de visite, paiements,
// et images de la page d'accueil (vraies photos de chantier, captures de l'application).
// Accès : comptes marqués administrateurs (npm run admin -- <e-mail ou téléphone>) ou listés dans ADMIN_EMAILS.
const path = require("node:path");
const fs = require("node:fs");
const multer = require("multer");
const { all, get, run, DATA_DIR } = require("./db");
const { PLANS } = require("./plans");
const { DAY } = require("./analytics");

const IMG_DIR = path.join(DATA_DIR, "site-images");
const PUBLIC_IMG = path.join(__dirname, "..", "public", "img");
// Emplacements de la galerie « Sur de vrais chantiers » de la page d'accueil (masquée tant qu'elle est vide).
const GALLERY = ["chantier-1", "chantier-2", "chantier-3", "chantier-4", "chantier-5", "chantier-6"];
// Captures remplaçables : les images JPEG de public/img (le plan de façade, en SVG, reste dessiné).
const replaceable = () => fs.readdirSync(PUBLIC_IMG).filter((f) => /\.jpg$/.test(f)).sort();
const slotOk = (slot) => GALLERY.includes(slot) || replaceable().includes(slot);
const kindOf = (buf) => (buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf.subarray(0, 4).toString("latin1") === "\x89PNG" ? "image/png"
  : buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP" ? "image/webp" : null);

function mount(app, api, h) {
  const { fail, str, isAdmin, nowIso, grant } = h;
  const only = (req) => { if (!isAdmin(req.artisan)) fail(404, "Page introuvable."); };
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  api.get("/admin/overview", (req, res) => {
    only(req);
    const q = String(req.query.q || "").trim().toLowerCase();
    const like = `%${q}%`;
    const accounts = all(`SELECT id, email, phone, phone_verified_at, account_type, company, contact_name, country, plan, paid_until, trial_ends_at, sub_status, sub_currency, is_admin, created_at,
      (SELECT COUNT(*) FROM sites s WHERE s.artisan_id = artisans.id OR s.owner_id = artisans.id) AS sites
      FROM artisans ${q ? "WHERE lower(COALESCE(email, '')) LIKE ? OR COALESCE(phone, '') LIKE ? OR lower(contact_name) LIKE ? OR lower(company) LIKE ?" : ""} ORDER BY created_at DESC LIMIT 200`, ...(q ? [like, like, like, like] : []));
    const now = new Date().toISOString();
    res.json({
      counts: {
        accounts: get("SELECT COUNT(*) AS n FROM artisans").n,
        by_type: Object.fromEntries(all("SELECT account_type AS k, COUNT(*) AS n FROM artisans GROUP BY account_type").map((r) => [r.k, r.n])),
        sites: get("SELECT COUNT(*) AS n FROM sites WHERE status = 'active'").n,
        paying: get("SELECT COUNT(*) AS n FROM artisans WHERE paid_until > ?", now).n,
        updates_7d: get("SELECT COUNT(*) AS n FROM updates WHERE kind = 'post' AND created_at > ?", new Date(Date.now() - 7 * DAY).toISOString()).n
      },
      accounts, plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { name: v.name, audience: v.audience }])),
      visits: all(`SELECT v.*, s.name AS site, s.location, s.tracking_code, a.contact_name, a.email, a.phone AS account_phone FROM visit_requests v JOIN sites s ON s.id = v.site_id
        LEFT JOIN artisans a ON a.id = v.requested_by ORDER BY v.created_at DESC LIMIT 100`),
      payments: all("SELECT e.*, a.contact_name FROM billing_events e LEFT JOIN artisans a ON a.id = e.artisan_id ORDER BY e.created_at DESC LIMIT 50")
    });
  });

  // Offrir ou activer une offre pour N mois (paiement reçu par Wave, Orange Money, virement…).
  api.post("/admin/accounts/:id/grant", (req, res) => {
    only(req);
    const a = get("SELECT * FROM artisans WHERE id = ?", Number(req.params.id));
    if (!a) fail(404, "Compte introuvable.");
    const plan = String(req.body?.plan || "");
    if (!PLANS[plan]) fail(400, "Offre inconnue.");
    const months = Math.round(Number(req.body?.months));
    if (!(months >= 0 && months <= 36)) fail(400, "Nombre de mois entre 0 et 36.");
    const from = a.paid_until && Date.parse(a.paid_until) > Date.now() ? Date.parse(a.paid_until) : Date.now();
    const until = months === 0 ? new Date().toISOString() : new Date(from + months * 30 * DAY).toISOString();
    grant(a.id, plan, until, { status: months ? "manual" : "canceled" });
    run("INSERT INTO billing_events (id, type, artisan_id, summary, created_at) VALUES (?, ?, ?, ?, ?)", `manual_${a.id}_${Date.now()}`, "admin.grant", a.id,
      months ? `${PLANS[plan].name} offert ou payé hors carte, ${months} mois, par ${req.artisan.contact_name}` : `offre arrêtée par ${req.artisan.contact_name}`, nowIso());
    res.json({ ok: true, until });
  });

  api.patch("/admin/visits/:id", (req, res) => {
    only(req);
    const status = ["demandee", "planifiee", "faite", "annulee"].includes(req.body?.status) ? req.body.status : fail(400, "Statut inconnu.");
    run("UPDATE visit_requests SET status = ? WHERE id = ?", status, Number(req.params.id));
    res.json({ ok: true });
  });

  /* ---------- Images du site ---------- */
  api.get("/admin/images", (req, res) => {
    only(req);
    const set = Object.fromEntries(all("SELECT * FROM site_images").map((r) => [r.slot, r]));
    const item = (slot) => ({ slot, replaced: !!set[slot], caption: set[slot]?.caption || "", updated_at: set[slot]?.updated_at || null, url: `/img/${slot}?v=${set[slot]?.updated_at ? Date.parse(set[slot].updated_at) : 0}` });
    res.json({ gallery: GALLERY.map(item), screens: replaceable().map(item) });
  });
  api.post("/admin/images/:slot", upload.single("image"), (req, res) => {
    only(req);
    const slot = String(req.params.slot);
    if (!slotOk(slot)) fail(404, "Emplacement inconnu.");
    const caption = str(req.body?.caption, 160, "légende", false);
    if (!req.file) {
      if (!get("SELECT 1 FROM site_images WHERE slot = ?", slot)) fail(400, "Choisissez une image.");
      run("UPDATE site_images SET caption = ? WHERE slot = ?", caption, slot);
      return res.json({ ok: true });
    }
    const type = kindOf(req.file.buffer);
    if (!type) fail(400, "Image refusée : JPEG, PNG ou WebP seulement.");
    const file = `${slot.replace(/\.\w+$/, "")}-${Date.now()}`;
    fs.writeFileSync(path.join(IMG_DIR, file), req.file.buffer);
    const old = get("SELECT file FROM site_images WHERE slot = ?", slot);
    run("INSERT INTO site_images (slot, file, caption, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(slot) DO UPDATE SET file = excluded.file, caption = excluded.caption, updated_at = excluded.updated_at", slot, file, caption, nowIso());
    if (old) fs.rm(path.join(IMG_DIR, old.file), { force: true }, () => {});
    res.status(201).json({ ok: true });
  });
  api.delete("/admin/images/:slot", (req, res) => {
    only(req);
    const old = get("SELECT file FROM site_images WHERE slot = ?", String(req.params.slot));
    if (old) { run("DELETE FROM site_images WHERE slot = ?", String(req.params.slot)); fs.rm(path.join(IMG_DIR, old.file), { force: true }, () => {}); }
    res.json({ ok: true });
  });

  // Galerie de la page d'accueil (public) et images remplacées, servies à la place de celles de public/img.
  app.get("/api/site-images", (req, res) => {
    res.json(all("SELECT slot, caption, updated_at FROM site_images WHERE slot LIKE 'chantier-%' ORDER BY slot").map((r) => ({ ...r, url: `/img/${r.slot}?v=${Date.parse(r.updated_at)}` })));
  });
  app.get("/img/:file", (req, res, next) => {
    const r = get("SELECT file FROM site_images WHERE slot = ?", String(req.params.file));
    if (!r) return GALLERY.includes(req.params.file) ? res.status(404).end() : next();
    const p = path.join(IMG_DIR, path.basename(r.file));
    if (!fs.existsSync(p)) return next();
    const fd = fs.openSync(p, "r"), head = Buffer.alloc(64);
    fs.readSync(fd, head, 0, 64, 0); fs.closeSync(fd);
    res.type(kindOf(head) || "application/octet-stream").setHeader("Cache-Control", "public, max-age=300");
    res.sendFile(p);
  });
}

module.exports = { mount, GALLERY };
