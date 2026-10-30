// Serveur Archfield : API JSON pour l'artisan (session) et pour le client (lien privé), fichiers statiques et photos.
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const heicConvert = require("heic-convert");
const { all, get, run, tx, UPLOAD_DIR } = require("./db");
const { siteWithSummary, dashboard, stepStatus, DAY } = require("./analytics");
const { sendReport, startScheduler } = require("./reports");
const { sendMail, BASE_URL } = require("./mail");
const { checkCompany, publicCountries, siret: checkSiret } = require("./company");

const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === "production";
const PUBLIC = path.join(__dirname, "..", "public");
const TRIAL_DAYS = 61;
const NOTIFY_EVERY_H = 3; // au plus un e-mail « nouvelle mise à jour » toutes les 3 heures par chantier
const MARKETS = { eu: { currency: "EUR", price: "19 €" }, af: { currency: "XOF", price: "9 900 FCFA" } };
const TEMPLATES = {
  ext: [["Terrassement", 6], ["Fondations", 14], ["Soubassement", 7], ["Élévation des murs", 18], ["Dalle et chaînage", 12], ["Toiture", 9], ["Menuiseries", 10], ["Enduits et finitions", 20]],
  int: [["Démolition", 3], ["Plomberie", 5], ["Électricité", 4], ["Plâtrerie", 6], ["Carrelage", 4], ["Peinture", 4]]
};

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

/* ---------- Sécurité : en-têtes, origine des requêtes, limites ---------- */
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"
  ].join("; "));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), payment=()");
  if (PROD) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// Les requêtes qui modifient des données doivent venir du site lui-même.
app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.headers.origin;
  let host = null;
  try { host = origin ? new URL(origin).host : req.headers.host; } catch (e) {}
  if (host !== req.headers.host) return res.status(403).json({ error: "Requête refusée." });
  next();
});

const buckets = new Map();
function limit(name, max, windowMs, key = (req) => req.ip) {
  return (req, res, next) => {
    const k = name + "|" + key(req), now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(k, b); }
    if (++b.n > max) {
      res.setHeader("Retry-After", Math.ceil((b.reset - now) / 1000));
      return res.status(429).json({ error: "Trop de demandes. Patientez quelques minutes puis réessayez." });
    }
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 10 * 60e3).unref();

app.use("/api", limit("api", 900, 5 * 60e3));
app.use(express.json({ limit: "200kb" }));

/* ---------- Outils ---------- */
const nowIso = () => new Date().toISOString();
const token = (n = 24) => crypto.randomBytes(n).toString("base64url");
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
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
const phone = (v) => { const raw = str(v, 30, "téléphone du client", false), p = raw.replace(/[\s.()-]/g, ""); if (raw && !/^\+?\d{8,15}$/.test(p)) fail(400, "Le téléphone du client doit contenir 8 à 15 chiffres, indicatif compris (ex. +221771234567)."); return p; };
const email = (v, field, required) => { const e = str(v, 200, field, required).toLowerCase(); if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) fail(400, `L'adresse « ${field} » n'est pas valide.`); return e; };
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
}
function setSession(res, t, maxAge) {
  res.append("Set-Cookie", `af_session=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${PROD ? "; Secure" : ""}`);
}
function access(a) {
  const now = Date.now(), trial = Date.parse(a.trial_ends_at), paid = a.paid_until ? Date.parse(a.paid_until) : 0;
  if (paid > now) return { status: "paid", active: true, until: a.paid_until, days_left: Math.ceil((paid - now) / DAY) };
  if (trial > now) return { status: "trial", active: true, until: a.trial_ends_at, days_left: Math.ceil((trial - now) / DAY) };
  return { status: "expired", active: false, until: a.paid_until || a.trial_ends_at, days_left: 0 };
}
const hasPassword = (a) => !a.password_hash.startsWith("!");
const publicArtisan = (a) => ({ id: a.id, email: a.email, company: a.company, contact_name: a.contact_name, city: a.city, country: a.country, company_id: a.company_id, market: a.market, currency: a.currency, price: MARKETS[a.market].price, trial_ends_at: a.trial_ends_at, access: access(a), google: !!a.google_sub, has_password: hasPassword(a), created_at: a.created_at });
function removeFiles(files) { files.forEach((f) => fs.rm(path.join(UPLOAD_DIR, path.basename(f)), { force: true }, () => {})); }

/* ---------- Authentification ---------- */
function sessionArtisan(req) {
  const t = cookies(req).af_session;
  const s = t && get("SELECT * FROM sessions WHERE token = ? AND expires_at > ?", t, nowIso());
  return s ? get("SELECT * FROM artisans WHERE id = ?", s.artisan_id) : null;
}
function auth(req, res, next) {
  req.artisan = sessionArtisan(req);
  if (!req.artisan) return res.status(401).json({ error: "Connectez-vous pour continuer." });
  next();
}
// Essai terminé et abonnement non payé : lecture possible, mais plus de nouveau chantier ni de publication.
function requireActive(req, res, next) {
  if (access(req.artisan).active) return next();
  res.status(402).json({ error: "Votre essai gratuit est terminé. Activez votre abonnement pour publier à nouveau. Vos clients gardent l'accès à leurs chantiers." });
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
const passwordOk = (p) => { const s = str(p, 200, "mot de passe"); if (s.length < 8) fail(400, "Le mot de passe doit faire au moins 8 caractères."); return s; };

// Inscription : par e-mail et mot de passe, ou après « Continuer avec Google » (google_token).
app.post("/api/signup", limit("signup", 10, 60 * 60e3), wrap(async (req, res) => {
  const b = req.body || {};
  const co = checkCompany(b.country, b.company_id);
  if (co.error) fail(400, co.error);
  let mail, hash, googleSub = null;
  if (b.google_token) {
    const p = get("SELECT * FROM oauth_pending WHERE token_hash = ? AND expires_at > ?", sha256(String(b.google_token)), nowIso());
    if (!p) fail(400, "La connexion Google a expiré. Cliquez à nouveau sur « Continuer avec Google ».");
    mail = p.email; googleSub = p.subject; hash = "!google";
  } else {
    mail = email(b.email, "e-mail", true);
    hash = await bcrypt.hash(passwordOk(b.password), 10);
  }
  if (get("SELECT 1 FROM artisans WHERE email = ?", mail)) fail(409, "Un compte existe déjà avec cet e-mail. Connectez-vous.");
  const id = tx(() => {
    const r = run(
      `INSERT INTO artisans (email, password_hash, company, contact_name, city, country, company_id, market, currency, google_sub, trial_ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mail, hash, str(b.company, 120, "entreprise"), str(b.contact_name, 120, "nom"), str(b.city, 120, "ville", false), co.country, co.company_id,
      co.market, MARKETS[co.market].currency, googleSub, new Date(Date.now() + TRIAL_DAYS * DAY).toISOString(), nowIso());
    if (b.google_token) run("DELETE FROM oauth_pending WHERE token_hash = ?", sha256(String(b.google_token)));
    return Number(r.lastInsertRowid);
  });
  openSession(res, id);
  res.status(201).json({ ok: true });
}));

app.post("/api/login", wrap(async (req, res) => {
  const mail = str(req.body?.email, 200, "e-mail").toLowerCase();
  const t = throttle(req.ip + "|" + mail);
  const a = get("SELECT * FROM artisans WHERE email = ?", mail);
  if (a && !hasPassword(a)) fail(400, "Ce compte se connecte avec Google. Cliquez sur « Continuer avec Google ».");
  if (!a || !(await bcrypt.compare(String(req.body?.password || ""), a.password_hash))) { t.failed(); fail(401, "E-mail ou mot de passe incorrect."); }
  t.ok();
  openSession(res, a.id);
  res.json({ ok: true });
}));

// Comptes de démo en un clic (seulement si DEMO=on, ou hors production).
const DEMO_ON = process.env.DEMO === "on" || (!PROD && process.env.DEMO !== "off");
const DEMO_ACCOUNTS = { eu: "demo@archfield.app", af: "demo-afrique@archfield.app" };
app.post("/api/demo-login", (req, res) => {
  if (!DEMO_ON) fail(404, "La démo n'est pas disponible.");
  const a = get("SELECT * FROM artisans WHERE email = ?", DEMO_ACCOUNTS[req.body?.account] || "");
  if (!a) fail(404, "Les données de démo ne sont pas chargées. Lancez « npm run seed » puis réessayez.");
  openSession(res, a.id);
  res.json({ ok: true });
});

// Vérification d'un SIRET auprès de l'annuaire public des entreprises (recherche-entreprises.api.gouv.fr).
app.get("/api/entreprise/:siret", limit("siret", 30, 10 * 60e3), wrap(async (req, res) => {
  const n = checkSiret(req.params.siret);
  if (!n) fail(400, "SIRET invalide : vérifiez les chiffres (14 chiffres, sur votre extrait Kbis ou avis de situation Insee).");
  let data;
  try {
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${n}&per_page=1`, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    data = await r.json();
  } catch (e) {
    return res.status(503).json({ error: "Vérification du SIRET indisponible pour le moment. Vous pouvez continuer l'inscription." });
  }
  const e = data.results?.[0];
  const etab = e && [e.siege, ...(e.matching_etablissements || [])].find((x) => x && x.siret === n);
  if (!e || !etab) return res.status(404).json({ error: "Ce SIRET n'existe pas dans l'annuaire des entreprises. Vérifiez-le." });
  res.json({ siret: n, name: e.nom_complet, city: etab.libelle_commune || "", active: etab.etat_administratif !== "F" });
}));

app.post("/api/logout", (req, res) => {
  const t = cookies(req).af_session;
  if (t) run("DELETE FROM sessions WHERE token = ?", t);
  setSession(res, "", 0);
  res.json({ ok: true });
});

// Mot de passe oublié : même réponse que le compte existe ou non.
app.post("/api/password/forgot", limit("forgot", 5, 60 * 60e3), wrap(async (req, res) => {
  const mail = email(req.body?.email, "e-mail", true);
  const a = get("SELECT * FROM artisans WHERE email = ?", mail);
  if (a) {
    const t = token(32);
    run("INSERT INTO password_resets (token_hash, artisan_id, expires_at) VALUES (?, ?, ?)", sha256(t), a.id, new Date(Date.now() + 60 * 60e3).toISOString());
    await sendMail({
      to: a.email, subject: "Archfield : choisir un nouveau mot de passe",
      text: `Bonjour ${a.contact_name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien dans l'heure :\n${BASE_URL}/reinitialiser?jeton=${t}\n\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.`
    });
  }
  res.json({ ok: true });
}));

app.post("/api/password/reset", limit("reset", 20, 60 * 60e3), wrap(async (req, res) => {
  const t = str(req.body?.token, 100, "jeton");
  const password = passwordOk(req.body?.password);
  const r = get("SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?", sha256(t), nowIso());
  if (!r) fail(400, "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.");
  const hash = await bcrypt.hash(password, 10);
  tx(() => {
    run("UPDATE artisans SET password_hash = ? WHERE id = ?", hash, r.artisan_id);
    run("UPDATE password_resets SET used_at = ? WHERE artisan_id = ? AND used_at IS NULL", nowIso(), r.artisan_id);
    run("DELETE FROM sessions WHERE artisan_id = ?", r.artisan_id);
  });
  openSession(res, r.artisan_id);
  res.json({ ok: true });
}));

// Les comptes de démo ne sont affichés sur la page de connexion que si DEMO=on.
app.get("/api/config", (req, res) => res.json({ demo: DEMO_ON, google: GOOGLE.enabled, countries: publicCountries() }));

/* ---------- Connexion avec Google (OpenID Connect) ---------- */
const GOOGLE = {
  id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET,
  authUrl: process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  userUrl: process.env.GOOGLE_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo"
};
GOOGLE.enabled = !!(GOOGLE.id && GOOGLE.secret);
const googleRedirect = () => `${BASE_URL}/auth/google/callback`;
const oauthCookie = (res, v, maxAge) => res.append("Set-Cookie", `af_oauth=${v}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${PROD ? "; Secure" : ""}`);

app.get("/auth/google", limit("oauth", 30, 10 * 60e3), (req, res) => {
  if (!GOOGLE.enabled) return res.redirect("/connexion?erreur=google-indisponible");
  const state = token(24);
  oauthCookie(res, state, 600);
  const q = new URLSearchParams({ client_id: GOOGLE.id, redirect_uri: googleRedirect(), response_type: "code", scope: "openid email profile", state, prompt: "select_account" });
  res.redirect(`${GOOGLE.authUrl}?${q}`);
});

app.get("/auth/google/callback", limit("oauth", 30, 10 * 60e3), wrap(async (req, res) => {
  const back = (code) => res.redirect("/connexion?erreur=" + code);
  const state = cookies(req).af_oauth;
  oauthCookie(res, "", 0);
  if (!GOOGLE.enabled || !state || req.query.state !== state || !req.query.code) return back("google");
  let user;
  try {
    const tr = await fetch(GOOGLE.tokenUrl, {
      method: "POST", signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: String(req.query.code), client_id: GOOGLE.id, client_secret: GOOGLE.secret, redirect_uri: googleRedirect(), grant_type: "authorization_code" })
    });
    const tok = await tr.json();
    if (!tr.ok || !tok.access_token) throw new Error("jeton refusé");
    const ur = await fetch(GOOGLE.userUrl, { signal: AbortSignal.timeout(8000), headers: { Authorization: "Bearer " + tok.access_token } });
    user = await ur.json();
    if (!ur.ok || !user.sub || !user.email) throw new Error("profil illisible");
  } catch (e) {
    console.error("Connexion Google échouée :", e.message);
    return back("google");
  }
  if (!user.email_verified) return back("google-email");
  const mail = String(user.email).toLowerCase();
  const a = get("SELECT * FROM artisans WHERE google_sub = ?", user.sub) || get("SELECT * FROM artisans WHERE email = ?", mail);
  if (a) {
    if (!a.google_sub) run("UPDATE artisans SET google_sub = ? WHERE id = ?", user.sub, a.id);
    openSession(res, a.id);
    return res.redirect("/app");
  }
  // Nouveau compte : on garde l'identité Google 30 minutes, le temps de remplir l'entreprise et le pays.
  const t = token(24);
  run("INSERT INTO oauth_pending (token_hash, provider, subject, email, name, expires_at) VALUES (?, 'google', ?, ?, ?, ?)", sha256(t), user.sub, mail, String(user.name || ""), new Date(Date.now() + 30 * 60e3).toISOString());
  res.redirect(`/inscription?google=${t}`);
}));

app.get("/api/oauth-pending/:token", (req, res) => {
  const p = get("SELECT email, name FROM oauth_pending WHERE token_hash = ? AND expires_at > ?", sha256(req.params.token), nowIso());
  if (!p) fail(404, "La connexion Google a expiré. Cliquez à nouveau sur « Continuer avec Google ».");
  res.json(p);
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
// mediaBase : « /media/ » pour l'artisan connecté, « /c/<lien>/media/ » pour le client.
function updatesOf(siteId, mediaBase, limitN = 300) {
  const ups = all(`SELECT u.*, st.name AS step_name FROM updates u LEFT JOIN steps st ON st.id = u.step_id WHERE u.site_id = ? ORDER BY u.created_at DESC, u.id DESC LIMIT ?`, siteId, limitN);
  const photos = ups.length ? all(`SELECT * FROM photos WHERE update_id IN (${ups.map(() => "?").join(",")}) ORDER BY id`, ...ups.map((u) => u.id)) : [];
  return ups.map((u) => ({ ...u, photos: photos.filter((p) => p.update_id === u.id).map((p) => ({ id: p.id, url: mediaBase + p.file, taken_at: p.taken_at })) }));
}
const siteFiles = (siteId) => all("SELECT p.file FROM photos p JOIN updates u ON u.id = p.update_id WHERE u.site_id = ?", siteId).map((p) => p.file);
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
api.post("/me/password", wrap(async (req, res) => {
  if (hasPassword(req.artisan) && !(await bcrypt.compare(String(req.body?.current || ""), req.artisan.password_hash))) fail(400, "Le mot de passe actuel est incorrect.");
  const hash = await bcrypt.hash(passwordOk(req.body?.password), 10);
  const current = cookies(req).af_session;
  tx(() => {
    run("UPDATE artisans SET password_hash = ? WHERE id = ?", hash, req.artisan.id);
    run("DELETE FROM sessions WHERE artisan_id = ? AND token <> ?", req.artisan.id, current);
  });
  res.json({ ok: true });
}));

// RGPD : export de toutes les données du compte, puis suppression définitive.
api.get("/me/export", (req, res) => {
  const a = req.artisan;
  const sites = all("SELECT * FROM sites WHERE artisan_id = ? ORDER BY created_at", a.id).map((s) => ({
    ...s,
    client_link: `${BASE_URL}/c/${s.client_token}`,
    steps: all("SELECT * FROM steps WHERE site_id = ? ORDER BY position", s.id),
    updates: updatesOf(s.id, BASE_URL + "/media/", 100000),
    documents: all("SELECT * FROM documents WHERE site_id = ? ORDER BY doc_date", s.id),
    reports: all("SELECT * FROM reports WHERE site_id = ? ORDER BY period_end", s.id).map((r) => ({ ...r, data: JSON.parse(r.data) }))
  }));
  res.setHeader("Content-Disposition", `attachment; filename="archfield-export-${nowIso().slice(0, 10)}.json"`);
  res.json({ exported_at: nowIso(), account: publicArtisan(a), sites });
});
api.delete("/me", wrap(async (req, res) => {
  const ok = hasPassword(req.artisan) ? await bcrypt.compare(String(req.body?.password || ""), req.artisan.password_hash) : String(req.body?.password || "").trim().toLowerCase() === req.artisan.email;
  if (!ok) fail(400, hasPassword(req.artisan) ? "Mot de passe incorrect : le compte n'a pas été supprimé." : "Tapez l'adresse e-mail du compte pour confirmer la suppression.");
  const files = all("SELECT p.file FROM photos p JOIN updates u ON u.id = p.update_id JOIN sites si ON si.id = u.site_id WHERE si.artisan_id = ?", req.artisan.id).map((p) => p.file);
  run("DELETE FROM artisans WHERE id = ?", req.artisan.id);
  removeFiles(files);
  setSession(res, "", 0);
  res.json({ ok: true });
}));

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

api.post("/sites", requireActive, (req, res) => {
  const b = req.body || {};
  const steps = Array.isArray(b.steps) ? b.steps : [];
  if (!steps.length) fail(400, "Ajoutez au moins une étape.");
  if (steps.length > 30) fail(400, "30 étapes au maximum.");
  const clientName = str(b.client_name, 120, "client");
  const id = tx(() => {
    const r = run(
      `INSERT INTO sites (artisan_id, name, location, kind, client_name, client_short, client_email, client_phone, client_city, client_token, budget, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.artisan.id, str(b.name, 120, "nom du chantier"), str(b.location, 120, "lieu", false), b.kind === "ext" ? "ext" : "int",
      clientName, str(b.client_short, 60, "prénom du client", false) || clientName.split(" ")[0], email(b.client_email, "e-mail du client", false), phone(b.client_phone),
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
    updates: updatesOf(s.id, "/media/"),
    documents: all("SELECT * FROM documents WHERE site_id = ? ORDER BY doc_date, id", s.id),
    reports: all("SELECT id, period_start, period_end, sent_at, emailed, opened_at FROM reports WHERE site_id = ? ORDER BY period_end DESC", s.id)
  });
});

api.patch("/sites/:id", (req, res) => {
  const s = ownSite(req, req.params.id), b = req.body || {};
  const v = (k, max, label, req2 = false) => (b[k] !== undefined ? str(b[k], max, label, req2) : s[k]);
  run(`UPDATE sites SET name = ?, location = ?, client_name = ?, client_short = ?, client_email = ?, client_phone = ?, client_city = ?, budget = ? WHERE id = ?`,
    v("name", 120, "nom du chantier", true), v("location", 120, "lieu"), v("client_name", 120, "client", true), v("client_short", 60, "prénom du client", true),
    b.client_email !== undefined ? email(b.client_email, "e-mail du client", false) : s.client_email,
    b.client_phone !== undefined ? phone(b.client_phone) : s.client_phone,
    v("client_city", 120, "ville du client"), b.budget !== undefined ? Math.round(num(b.budget, "budget")) : s.budget, s.id);
  res.json(siteWithSummary(get("SELECT * FROM sites WHERE id = ?", s.id)));
});

api.delete("/sites/:id", (req, res) => {
  const s = ownSite(req, req.params.id);
  const files = siteFiles(s.id);
  run("DELETE FROM sites WHERE id = ?", s.id);
  removeFiles(files);
  res.json({ ok: true });
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

api.post("/sites/:id/report", limit("report", 20, 60 * 60e3, (req) => "a" + req.artisan.id), wrap(async (req, res) => {
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
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heic" };
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, f, cb) => cb(null, token(18) + (EXT[f.mimetype] || "")) }),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (req, f, cb) => cb(EXT[f.mimetype] ? null : new HttpError(400, "Seules les photos JPEG, PNG, WebP ou HEIC (iPhone) sont acceptées."), !!EXT[f.mimetype])
});
// Les photos HEIC des iPhone ne s'affichent pas dans la plupart des navigateurs : on les convertit en JPEG.
async function normalizePhotos(files) {
  for (const f of files) {
    if (!f.filename.endsWith(".heic")) continue;
    const out = f.filename.replace(/\.heic$/, ".jpg");
    try {
      const jpg = await heicConvert({ buffer: await fs.promises.readFile(f.path), format: "JPEG", quality: 0.82 });
      await fs.promises.writeFile(path.join(UPLOAD_DIR, out), Buffer.from(jpg));
    } catch (e) {
      throw new HttpError(400, `La photo « ${f.originalname} » n'a pas pu être lue. Réessayez en JPEG.`);
    } finally {
      await fs.promises.rm(f.path, { force: true });
    }
    f.filename = out; f.path = path.join(UPLOAD_DIR, out);
  }
}

async function notifyClient(site, artisan, text) {
  if (!site.client_email) return false;
  if (site.last_notified_at && Date.now() - Date.parse(site.last_notified_at) < NOTIFY_EVERY_H * 36e5) return false;
  run("UPDATE sites SET last_notified_at = ? WHERE id = ?", nowIso(), site.id);
  return sendMail({
    to: site.client_email, subject: `${site.name} : nouvelle mise à jour de ${artisan.company}`,
    text: `Bonjour ${site.client_short},\n\n${artisan.company} a publié une mise à jour sur votre chantier « ${site.name} » :\n\n« ${text} »\n\nVoir les photos : ${BASE_URL}/c/${site.client_token}\n\nVous recevez au plus un e-mail toutes les ${NOTIFY_EVERY_H} heures, et le résumé de la semaine chaque lundi.`
  });
}

api.post("/sites/:id/updates", requireActive, limit("upload", 60, 60 * 60e3, (req) => "a" + req.artisan.id), upload.array("photos", 10), wrap(async (req, res) => {
  const files = req.files || [];
  try {
    const s = ownSite(req, req.params.id);
    const text = str(req.body.text, 500, "message");
    const st = req.body.step_id ? get("SELECT * FROM steps WHERE id = ? AND site_id = ?", Number(req.body.step_id), s.id) : null;
    if (req.body.step_id && !st) fail(400, "Étape inconnue pour ce chantier.");
    await normalizePhotos(files);
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
    const notified = await notifyClient(s, req.artisan, text);
    res.status(201).json({ id, photos: files.length, notified });
  } catch (e) {
    removeFiles(files.map((f) => f.filename));
    throw e;
  }
}));

api.delete("/updates/:id", (req, res) => {
  const u = get("SELECT u.* FROM updates u JOIN sites si ON si.id = u.site_id WHERE u.id = ? AND si.artisan_id = ?", Number(req.params.id), req.artisan.id);
  if (!u) fail(404, "Mise à jour introuvable.");
  if (u.kind !== "post") fail(409, "Seules vos publications peuvent être supprimées.");
  const files = all("SELECT file FROM photos WHERE update_id = ?", u.id).map((p) => p.file);
  run("DELETE FROM updates WHERE id = ?", u.id);
  removeFiles(files);
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
app.get("/api/c/:token", limit("client", 120, 60e3), (req, res) => {
  const s = bySiteToken(req.params.token);
  const a = get("SELECT * FROM artisans WHERE id = ?", s.artisan_id);
  const now = nowIso();
  const out = {
    ...siteWithSummary(s),
    client_token: undefined, client_email: undefined, client_phone: undefined, last_notified_at: undefined,
    artisan: { company: a.company, contact_name: a.contact_name, city: a.city, currency: a.currency, reliability: dashboard(a.id).reliability },
    updates: updatesOf(s.id, `/c/${s.client_token}/media/`).map((u) => ({ ...u, seen_at: undefined })),
    documents: all("SELECT kind, ref, label, amount, status, doc_date FROM documents WHERE site_id = ? ORDER BY doc_date, id", s.id),
    reports: all("SELECT id, period_start, period_end, sent_at, data FROM reports WHERE site_id = ? ORDER BY period_end DESC LIMIT 12", s.id).map((r) => ({ ...r, data: JSON.parse(r.data) }))
  };
  // Le client a ouvert son lien : publications vues, rapports lus.
  run("UPDATE updates SET seen_at = ? WHERE site_id = ? AND seen_at IS NULL", now, s.id);
  run("UPDATE reports SET opened_at = ? WHERE site_id = ? AND opened_at IS NULL", now, s.id);
  run("UPDATE sites SET last_client_visit_at = ? WHERE id = ?", now, s.id);
  res.json(out);
});
app.post("/api/c/:token/steps/:id/validate", limit("client-write", 30, 60e3), (req, res) => {
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

/* ---------- Photos : réservées à l'artisan du chantier et au lien du client ---------- */
function sendPhoto(res, file) {
  const p = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(p);
}
const photoSite = (file) => get("SELECT u.site_id FROM photos p JOIN updates u ON u.id = p.update_id WHERE p.file = ?", path.basename(String(file)));
app.get("/media/:file", (req, res) => {
  const a = sessionArtisan(req), ph = photoSite(req.params.file);
  if (!a || !ph || !get("SELECT 1 FROM sites WHERE id = ? AND artisan_id = ?", ph.site_id, a.id)) return res.status(404).end();
  sendPhoto(res, path.basename(req.params.file));
});
app.get("/c/:token/media/:file", limit("client-media", 600, 60e3), (req, res) => {
  const s = get("SELECT id FROM sites WHERE client_token = ?", req.params.token), ph = photoSite(req.params.file);
  if (!s || !ph || ph.site_id !== s.id) return res.status(404).end();
  sendPhoto(res, path.basename(req.params.file));
});

/* ---------- Pages ---------- */
const page = (f) => (req, res) => res.sendFile(path.join(PUBLIC, f));
app.get("/", page("index.html"));
app.get(["/connexion", "/inscription", "/mot-de-passe-oublie", "/reinitialiser"], page("auth.html"));
app.get("/confidentialite", page("confidentialite.html"));
app.get("/a-propos", page("a-propos.html"));
app.get("/mentions-legales", page("mentions-legales.html"));
app.get("/app", page("app.html"));
app.get("/c/:token", page("client.html"));
app.use(express.static(PUBLIC, { index: false, maxAge: PROD ? "1h" : 0 }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Une photo dépasse 15 Mo." : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE" ? "10 photos au maximum par mise à jour." : "Envoi des photos refusé : " + err.message });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Requête illisible." });
  console.error(err);
  res.status(500).json({ error: "Erreur du serveur. Réessayez dans un instant." });
});

// Ménage : sessions et liens de réinitialisation expirés.
function cleanup() {
  const now = nowIso();
  run("DELETE FROM sessions WHERE expires_at < ?", now);
  run("DELETE FROM password_resets WHERE expires_at < ?", now);
  run("DELETE FROM oauth_pending WHERE expires_at < ?", now);
}

if (require.main === module) {
  app.listen(PORT, () => console.log(`Archfield écoute sur http://localhost:${PORT}`));
  cleanup();
  setInterval(cleanup, 60 * 60e3);
  if (process.env.REPORTS !== "off") startScheduler();
}

module.exports = app;
