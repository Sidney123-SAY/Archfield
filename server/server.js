// Serveur Archfield : API JSON pour l'artisan (session) et pour le client (lien privé), fichiers statiques et photos.
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { all, get, run, tx, UPLOAD_DIR } = require("./db");
const { siteWithSummary, dashboard, stepStatus, DAY } = require("./analytics");
const { sendReport, startScheduler } = require("./reports");

const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === "production";
const PUBLIC = path.join(__dirname, "..", "public");
const TRIAL_DAYS = 61;
const MARKETS = { eu: { currency: "EUR", price: "19 €" }, af: { currency: "XOF", price: "9 900 FCFA" } };
const TEMPLATES = {
  ext: [["Terrassement", 6], ["Fondations", 14], ["Soubassement", 7], ["Élévation des murs", 18], ["Dalle et chaînage", 12], ["Toiture", 9], ["Menuiseries", 10], ["Enduits et finitions", 20]],
  int: [["Démolition", 3], ["Plomberie", 5], ["Électricité", 4], ["Plâtrerie", 6], ["Carrelage", 4], ["Peinture", 4]]
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));

/* ---------- Outils ---------- */
const nowIso = () => new Date().toISOString();
const token = (n = 24) => crypto.randomBytes(n).toString("base64url");
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function str(v, max, field, required = true) {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (required && !s) fail(400, `Le champ « ${field} » est obligatoire.`);
  if (s.length > max) fail(400, `Le champ « ${field} » dépasse ${max} caractères.`);
  return s;
}
function num(v, field, min = 0, max = 1e12) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `Le champ « ${field} » doit être un nombre entre ${min} et ${max}.`);
  return n;
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
}
function setSession(res, t, maxAge) {
  res.setHeader("Set-Cookie", `af_session=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${PROD ? "; Secure" : ""}`);
}
const publicArtisan = (a) => ({ id: a.id, email: a.email, company: a.company, contact_name: a.contact_name, city: a.city, market: a.market, currency: a.currency, price: MARKETS[a.market].price, trial_ends_at: a.trial_ends_at, created_at: a.created_at });

/* ---------- Authentification ---------- */
function auth(req, res, next) {
  const t = cookies(req).af_session;
  const s = t && get("SELECT * FROM sessions WHERE token = ? AND expires_at > ?", t, nowIso());
  if (!s) return res.status(401).json({ error: "Connectez-vous pour continuer." });
  req.artisan = get("SELECT * FROM artisans WHERE id = ?", s.artisan_id);
  if (!req.artisan) return res.status(401).json({ error: "Compte introuvable." });
  next();
}
function openSession(res, artisanId) {
  const t = token(32);
  run("INSERT INTO sessions (token, artisan_id, expires_at) VALUES (?, ?, ?)", t, artisanId, new Date(Date.now() + 30 * DAY).toISOString());
  setSession(res, t, 30 * 86400);
}
const attempts = new Map();
function throttle(key) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  if (a.until > Date.now()) fail(429, "Trop d'essais. Réessayez dans 10 minutes.");
  return { failed() { a.n += 1; if (a.n >= 8) { a.until = Date.now() + 10 * 60e3; a.n = 0; } attempts.set(key, a); }, ok() { attempts.delete(key); } };
}

app.post("/api/signup", wrap(async (req, res) => {
  const b = req.body || {};
  const email = str(b.email, 200, "e-mail").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "Cette adresse e-mail n'est pas valide.");
  const password = str(b.password, 200, "mot de passe");
  if (password.length < 8) fail(400, "Le mot de passe doit faire au moins 8 caractères.");
  const market = b.market === "af" ? "af" : "eu";
  if (get("SELECT 1 FROM artisans WHERE email = ?", email)) fail(409, "Un compte existe déjà avec cet e-mail. Connectez-vous.");
  const r = run(
    `INSERT INTO artisans (email, password_hash, company, contact_name, city, market, currency, trial_ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    email, await bcrypt.hash(password, 10), str(b.company, 120, "entreprise"), str(b.contact_name, 120, "nom"), str(b.city, 120, "ville", false),
    market, MARKETS[market].currency, new Date(Date.now() + TRIAL_DAYS * DAY).toISOString(), nowIso());
  openSession(res, Number(r.lastInsertRowid));
  res.status(201).json({ ok: true });
}));

app.post("/api/login", wrap(async (req, res) => {
  const email = str(req.body?.email, 200, "e-mail").toLowerCase();
  const t = throttle(req.ip + "|" + email);
  const a = get("SELECT * FROM artisans WHERE email = ?", email);
  if (!a || !(await bcrypt.compare(String(req.body?.password || ""), a.password_hash))) { t.failed(); fail(401, "E-mail ou mot de passe incorrect."); }
  t.ok();
  openSession(res, a.id);
  res.json({ ok: true });
}));

app.post("/api/logout", (req, res) => {
  const t = cookies(req).af_session;
  if (t) run("DELETE FROM sessions WHERE token = ?", t);
  setSession(res, "", 0);
  res.json({ ok: true });
});

/* ---------- Artisan ---------- */
const api = express.Router();
api.use(auth);

function ownSite(req, id) {
  const s = get("SELECT * FROM sites WHERE id = ? AND artisan_id = ?", Number(id), req.artisan.id);
  if (!s) fail(404, "Chantier introuvable.");
  return s;
}
function ownStep(req, id) {
  const st = get("SELECT st.* FROM steps st JOIN sites si ON si.id = st.site_id WHERE st.id = ? AND si.artisan_id = ?", Number(id), req.artisan.id);
  if (!st) fail(404, "Étape introuvable.");
  return st;
}
function updatesOf(siteId, limit = 200) {
  const ups = all(`SELECT u.*, st.name AS step_name FROM updates u LEFT JOIN steps st ON st.id = u.step_id WHERE u.site_id = ? ORDER BY u.created_at DESC, u.id DESC LIMIT ?`, siteId, limit);
  const photos = ups.length ? all(`SELECT * FROM photos WHERE update_id IN (${ups.map(() => "?").join(",")}) ORDER BY id`, ...ups.map((u) => u.id)) : [];
  return ups.map((u) => ({ ...u, photos: photos.filter((p) => p.update_id === u.id).map((p) => ({ id: p.id, url: "/media/" + p.file, taken_at: p.taken_at })) }));
}
function startNextIfIdle(siteId, afterPosition) {
  const steps = all("SELECT * FROM steps WHERE site_id = ? ORDER BY position", siteId);
  if (steps.some((s) => stepStatus(s) === "en_cours")) return;
  const next = steps.find((s) => s.position > afterPosition && !s.started_at);
  if (next) run("UPDATE steps SET started_at = ? WHERE id = ?", nowIso(), next.id);
}

api.get("/me", (req, res) => res.json(publicArtisan(req.artisan)));
api.patch("/me", (req, res) => {
  const b = req.body || {}, a = req.artisan;
  run("UPDATE artisans SET company = ?, contact_name = ?, city = ? WHERE id = ?",
    b.company !== undefined ? str(b.company, 120, "entreprise") : a.company,
    b.contact_name !== undefined ? str(b.contact_name, 120, "nom") : a.contact_name,
    b.city !== undefined ? str(b.city, 120, "ville", false) : a.city, a.id);
  res.json(publicArtisan(get("SELECT * FROM artisans WHERE id = ?", a.id)));
});
api.get("/templates", (req, res) => res.json(TEMPLATES));
api.get("/dashboard", (req, res) => res.json(dashboard(req.artisan.id)));

api.get("/export.csv", (req, res) => {
  const d = dashboard(req.artisan.id);
  const rows = [["Chantier", "Lieu", "Client", "Avancement (%)", "Étape en cours", "Jours réels", "Jours prévus", "Retard (j)", "Statut"]].concat(
    d.sites.map((s) => [s.name, s.location, s.client_name, s.progress, s.running?.name || "", s.running?.actual_days ?? "", s.running?.planned_days ?? "", s.delay, s.drift ? "Dérive" : "Dans les temps"]));
  const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="archfield-chantiers-${nowIso().slice(0, 10)}.csv"`);
  res.send(csv);
});

api.get("/sites", (req, res) => {
  const status = req.query.status === "delivered" ? "delivered" : req.query.status === "all" ? null : "active";
  const sites = status ? all("SELECT * FROM sites WHERE artisan_id = ? AND status = ? ORDER BY created_at DESC", req.artisan.id, status) : all("SELECT * FROM sites WHERE artisan_id = ? ORDER BY created_at DESC", req.artisan.id);
  res.json(sites.map((s) => {
    const x = siteWithSummary(s);
    const last = get("SELECT MAX(created_at) AS d FROM updates WHERE site_id = ? AND kind = 'post'", s.id).d;
    const reps = get("SELECT COUNT(*) AS sent, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened FROM reports WHERE site_id = ?", s.id);
    return { ...x, last_update_at: last, reports_sent: reps.sent, reports_opened: reps.opened || 0 };
  }));
});

api.post("/sites", (req, res) => {
  const b = req.body || {};
  const steps = Array.isArray(b.steps) ? b.steps : [];
  if (!steps.length) fail(400, "Ajoutez au moins une étape.");
  if (steps.length > 30) fail(400, "30 étapes au maximum.");
  const clientName = str(b.client_name, 120, "client");
  const id = tx(() => {
    const r = run(
      `INSERT INTO sites (artisan_id, name, location, kind, client_name, client_short, client_email, client_city, client_token, budget, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.artisan.id, str(b.name, 120, "nom du chantier"), str(b.location, 120, "lieu", false), b.kind === "ext" ? "ext" : "int",
      clientName, str(b.client_short, 60, "prénom du client", false) || clientName.split(" ")[0], str(b.client_email, 200, "e-mail du client", false).toLowerCase(),
      str(b.client_city, 120, "ville du client", false), token(16), Math.round(num(b.budget || 0, "budget")), nowIso());
    const siteId = Number(r.lastInsertRowid);
    steps.forEach((s, i) => run("INSERT INTO steps (site_id, position, name, planned_days, started_at) VALUES (?, ?, ?, ?, ?)",
      siteId, i + 1, str(s.name, 80, "étape"), num(s.planned_days, "durée prévue", 0.5, 365), i === 0 && b.start_now ? nowIso() : null));
    return siteId;
  });
  res.status(201).json(siteWithSummary(get("SELECT * FROM sites WHERE id = ?", id)));
});

api.get("/sites/:id", (req, res) => {
  const s = ownSite(req, req.params.id);
  res.json({
    ...siteWithSummary(s),
    updates: updatesOf(s.id),
    documents: all("SELECT * FROM documents WHERE site_id = ? ORDER BY doc_date, id", s.id),
    reports: all("SELECT id, period_start, period_end, sent_at, emailed, opened_at FROM reports WHERE site_id = ? ORDER BY period_end DESC", s.id)
  });
});

api.patch("/sites/:id", (req, res) => {
  const s = ownSite(req, req.params.id), b = req.body || {};
  const v = (k, max, label, req2 = false) => (b[k] !== undefined ? str(b[k], max, label, req2) : s[k]);
  run(`UPDATE sites SET name = ?, location = ?, client_name = ?, client_short = ?, client_email = ?, client_city = ?, budget = ? WHERE id = ?`,
    v("name", 120, "nom du chantier", true), v("location", 120, "lieu"), v("client_name", 120, "client", true), v("client_short", 60, "prénom du client", true),
    v("client_email", 200, "e-mail du client").toLowerCase(), v("client_city", 120, "ville du client"), b.budget !== undefined ? Math.round(num(b.budget, "budget")) : s.budget, s.id);
  res.json(siteWithSummary(get("SELECT * FROM sites WHERE id = ?", s.id)));
});

api.post("/sites/:id/deliver", (req, res) => {
  const s = ownSite(req, req.params.id);
  const open = all("SELECT * FROM steps WHERE site_id = ?", s.id).filter((x) => stepStatus(x) !== "validee");
  if (open.length) fail(409, `Il reste ${open.length} étape(s) non validée(s) par le client.`);
  run("UPDATE sites SET status = 'delivered', delivered_at = ? WHERE id = ?", nowIso(), s.id);
  res.json({ ok: true });
});

api.post("/sites/:id/new-link", (req, res) => {
  const s = ownSite(req, req.params.id);
  const t = token(16);
  run("UPDATE sites SET client_token = ? WHERE id = ?", t, s.id);
  res.json({ client_token: t });
});

api.post("/sites/:id/report", wrap(async (req, res) => {
  const s = ownSite(req, req.params.id);
  const id = await sendReport(s, true);
  res.status(201).json({ id, emailed: !!get("SELECT emailed FROM reports WHERE id = ?", id)?.emailed });
}));

/* Étapes */
api.post("/sites/:id/steps", (req, res) => {
  const s = ownSite(req, req.params.id);
  const pos = (get("SELECT MAX(position) AS p FROM steps WHERE site_id = ?", s.id).p || 0) + 1;
  run("INSERT INTO steps (site_id, position, name, planned_days) VALUES (?, ?, ?, ?)", s.id, pos, str(req.body?.name, 80, "étape"), num(req.body?.planned_days, "durée prévue", 0.5, 365));
  res.status(201).json(siteWithSummary(s));
});

api.patch("/steps/:id", (req, res) => {
  const st = ownStep(req, req.params.id), b = req.body || {};
  if (b.name !== undefined || b.planned_days !== undefined)
    run("UPDATE steps SET name = ?, planned_days = ? WHERE id = ?", b.name !== undefined ? str(b.name, 80, "étape") : st.name, b.planned_days !== undefined ? num(b.planned_days, "durée prévue", 0.5, 365) : st.planned_days, st.id);
  const status = stepStatus(st);
  if (b.action === "start") {
    if (status !== "a_venir") fail(409, "Cette étape a déjà commencé.");
    run("UPDATE steps SET started_at = ? WHERE id = ?", nowIso(), st.id);
  } else if (b.action === "finish") {
    if (status !== "en_cours") fail(409, "Seule une étape en cours peut être terminée.");
    tx(() => {
      run("UPDATE steps SET finished_at = ? WHERE id = ?", nowIso(), st.id);
      run("INSERT INTO updates (site_id, step_id, kind, created_at) VALUES (?, ?, 'step_done', ?)", st.site_id, st.id, nowIso());
    });
  } else if (b.action === "reopen") {
    if (status !== "a_valider") fail(409, "Seule une étape en attente de validation peut être rouverte.");
    run("UPDATE steps SET finished_at = NULL WHERE id = ?", st.id);
  }
  res.json(siteWithSummary(get("SELECT * FROM sites WHERE id = ?", st.site_id)));
});

api.delete("/steps/:id", (req, res) => {
  const st = ownStep(req, req.params.id);
  if (st.started_at) fail(409, "Une étape commencée ne peut plus être supprimée.");
  run("DELETE FROM steps WHERE id = ?", st.id);
  res.json({ ok: true });
});

/* Mises à jour avec photos */
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic" };
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, f, cb) => cb(null, token(18) + EXT[f.mimetype]) }),
  limits: { fileSize: 12 * 1024 * 1024, files: 10 },
  fileFilter: (req, f, cb) => cb(EXT[f.mimetype] ? null : new HttpError(400, "Seules les photos JPEG, PNG, WebP ou HEIC sont acceptées."), !!EXT[f.mimetype])
});

api.post("/sites/:id/updates", upload.array("photos", 10), (req, res) => {
  const files = req.files || [];
  try {
    const s = ownSite(req, req.params.id);
    const text = str(req.body.text, 500, "message");
    const st = req.body.step_id ? get("SELECT * FROM steps WHERE id = ? AND site_id = ?", Number(req.body.step_id), s.id) : null;
    if (req.body.step_id && !st) fail(400, "Étape inconnue pour ce chantier.");
    const done = req.body.done === "1" || req.body.done === "true";
    const now = nowIso();
    const id = tx(() => {
      if (st && !st.started_at) run("UPDATE steps SET started_at = ? WHERE id = ?", now, st.id);
      const r = run("INSERT INTO updates (site_id, step_id, kind, text, created_at) VALUES (?, ?, 'post', ?, ?)", s.id, st ? st.id : null, text, now);
      const uid = Number(r.lastInsertRowid);
      files.forEach((f) => run("INSERT INTO photos (update_id, file, taken_at) VALUES (?, ?, ?)", uid, f.filename, now));
      if (done && st && !st.finished_at) {
        run("UPDATE steps SET finished_at = ? WHERE id = ?", now, st.id);
        run("INSERT INTO updates (site_id, step_id, kind, created_at) VALUES (?, ?, 'step_done', ?)", s.id, st.id, new Date(Date.now() + 1000).toISOString());
      }
      return uid;
    });
    res.status(201).json({ id, photos: files.length });
  } catch (e) {
    files.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    throw e;
  }
});

api.delete("/updates/:id", (req, res) => {
  const u = get("SELECT u.* FROM updates u JOIN sites si ON si.id = u.site_id WHERE u.id = ? AND si.artisan_id = ?", Number(req.params.id), req.artisan.id);
  if (!u) fail(404, "Mise à jour introuvable.");
  if (u.kind !== "post") fail(409, "Seules vos publications peuvent être supprimées.");
  const files = all("SELECT file FROM photos WHERE update_id = ?", u.id);
  run("DELETE FROM updates WHERE id = ?", u.id);
  files.forEach((f) => fs.rm(path.join(UPLOAD_DIR, f.file), { force: true }, () => {}));
  res.json({ ok: true });
});

/* Devis et factures */
const DOC_STATUS = { devis: ["en_attente", "signe"], facture: ["a_regler", "payee"] };
function docFields(b, cur = {}) {
  const kind = b.kind !== undefined ? b.kind : cur.kind;
  if (!DOC_STATUS[kind]) fail(400, "Type de document inconnu.");
  const status = b.status !== undefined ? b.status : cur.status;
  if (!DOC_STATUS[kind].includes(status)) fail(400, "Statut incompatible avec ce type de document.");
  const date = b.doc_date !== undefined ? str(b.doc_date, 10, "date") : cur.doc_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, "La date doit être au format AAAA-MM-JJ.");
  return [kind, b.ref !== undefined ? str(b.ref, 40, "référence") : cur.ref, b.label !== undefined ? str(b.label, 160, "objet") : cur.label,
    b.amount !== undefined ? Math.round(num(b.amount, "montant")) : cur.amount, status, date];
}
api.post("/sites/:id/documents", (req, res) => {
  const s = ownSite(req, req.params.id);
  const r = run("INSERT INTO documents (site_id, kind, ref, label, amount, status, doc_date) VALUES (?, ?, ?, ?, ?, ?, ?)", s.id, ...docFields(req.body || {}));
  res.status(201).json(get("SELECT * FROM documents WHERE id = ?", Number(r.lastInsertRowid)));
});
function ownDoc(req) {
  const d = get("SELECT d.* FROM documents d JOIN sites si ON si.id = d.site_id WHERE d.id = ? AND si.artisan_id = ?", Number(req.params.id), req.artisan.id);
  if (!d) fail(404, "Document introuvable.");
  return d;
}
api.patch("/documents/:id", (req, res) => {
  const d = ownDoc(req);
  run("UPDATE documents SET kind = ?, ref = ?, label = ?, amount = ?, status = ?, doc_date = ? WHERE id = ?", ...docFields(req.body || {}, d), d.id);
  res.json(get("SELECT * FROM documents WHERE id = ?", d.id));
});
api.delete("/documents/:id", (req, res) => { run("DELETE FROM documents WHERE id = ?", ownDoc(req).id); res.json({ ok: true }); });

api.get("/photos", (req, res) => {
  const s = ownSite(req, req.query.site_id);
  res.json(all(`SELECT p.id, p.file, p.taken_at, st.name AS step_name FROM photos p JOIN updates u ON u.id = p.update_id LEFT JOIN steps st ON st.id = u.step_id
    WHERE u.site_id = ? ORDER BY p.taken_at DESC, p.id DESC`, s.id).map((p) => ({ ...p, url: "/media/" + p.file })));
});

app.use("/api", (req, res, next) => (req.path.startsWith("/c/") ? next() : api(req, res, next)));

/* ---------- Client (lien privé, sans compte) ---------- */
function bySiteToken(t) {
  const s = get("SELECT * FROM sites WHERE client_token = ?", String(t));
  if (!s) fail(404, "Ce lien n'est plus valide. Demandez un nouveau lien à votre artisan.");
  return s;
}
app.get("/api/c/:token", (req, res) => {
  const s = bySiteToken(req.params.token);
  const a = get("SELECT * FROM artisans WHERE id = ?", s.artisan_id);
  const now = nowIso();
  const out = {
    ...siteWithSummary(s),
    client_token: undefined, client_email: undefined,
    artisan: { company: a.company, contact_name: a.contact_name, city: a.city, currency: a.currency, reliability: dashboard(a.id).reliability },
    updates: updatesOf(s.id).map((u) => ({ ...u, seen_at: undefined })),
    documents: all("SELECT kind, ref, label, amount, status, doc_date FROM documents WHERE site_id = ? ORDER BY doc_date, id", s.id),
    reports: all("SELECT id, period_start, period_end, sent_at, data FROM reports WHERE site_id = ? ORDER BY period_end DESC LIMIT 12", s.id).map((r) => ({ ...r, data: JSON.parse(r.data) }))
  };
  // Le client a ouvert son lien : publications vues, rapports lus.
  run("UPDATE updates SET seen_at = ? WHERE site_id = ? AND seen_at IS NULL", now, s.id);
  run("UPDATE reports SET opened_at = ? WHERE site_id = ? AND opened_at IS NULL", now, s.id);
  run("UPDATE sites SET last_client_visit_at = ? WHERE id = ?", now, s.id);
  res.json(out);
});
app.post("/api/c/:token/steps/:id/validate", (req, res) => {
  const s = bySiteToken(req.params.token);
  const st = get("SELECT * FROM steps WHERE id = ? AND site_id = ?", Number(req.params.id), s.id);
  if (!st) fail(404, "Étape introuvable.");
  if (stepStatus(st) !== "a_valider") fail(409, "Cette étape n'attend pas de validation.");
  tx(() => {
    run("UPDATE steps SET validated_at = ? WHERE id = ?", nowIso(), st.id);
    run("INSERT INTO updates (site_id, step_id, kind, created_at, seen_at) VALUES (?, ?, 'step_validated', ?, ?)", s.id, st.id, nowIso(), nowIso());
    startNextIfIdle(s.id, st.position);
  });
  res.json({ ok: true });
});

/* ---------- Photos et pages ---------- */
app.get("/media/:file", (req, res) => {
  const f = path.basename(req.params.file);
  const p = path.join(UPLOAD_DIR, f);
  if (!/^[\w-]+\.(jpg|png|webp|heic|svg)$/.test(f) || !fs.existsSync(p)) return res.status(404).end();
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.sendFile(p);
});
const page = (f) => (req, res) => res.sendFile(path.join(PUBLIC, f));
app.get("/", page("index.html"));
app.get(["/connexion", "/inscription"], page("auth.html"));
app.get("/app", page("app.html"));
app.get("/c/:token", page("client.html"));
app.use(express.static(PUBLIC, { index: false, maxAge: PROD ? "1h" : 0 }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Une photo dépasse 12 Mo." : "Envoi des photos refusé : " + err.message });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Requête illisible." });
  console.error(err);
  res.status(500).json({ error: "Erreur du serveur. Réessayez dans un instant." });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Archfield écoute sur http://localhost:${PORT}`));
  if (process.env.REPORTS !== "off") startScheduler();
}

module.exports = app;
