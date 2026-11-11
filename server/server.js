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
const { checkCompany, publicCountries, siret: checkSiret, COUNTRIES } = require("./company");
const space = require("./space");
const money = require("./money");
const { verify, cleanMeta } = require("./verify");
const { newTrackingCode } = require("./db");
const phoneLib = require("./phone");
const billing = require("./billing");
const team = require("./team");
const { publicPlans } = require("./plans");

const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === "production";
const PUBLIC = path.join(__dirname, "..", "public");
const TRIAL_DAYS = 61; // durée d'essai enregistrée à l'inscription (l'offre Plus pour un client)
const NOTIFY_EVERY_H = 3; // au plus un e-mail « nouvelle mise à jour » toutes les 3 heures par chantier
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
    "img-src 'self' data: blob:", "media-src 'self' blob:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "worker-src 'self'", "manifest-src 'self'"
  ].join("; "));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // La position sert à vérifier qu'une photo est prise sur le chantier ; micro et paiement restent bloqués.
  // Micro : messages vocaux du chantier. Le paiement passe par la page de Stripe, pas par cette page.
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(self), microphone=(self), payment=(), usb=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
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
const LIMIT_FACTOR = Number(process.env.LIMIT_FACTOR) || 1; // relevé par la recette automatique (tools/qa.js)
function limit(name, max, windowMs, key = (req) => req.ip) {
  max *= LIMIT_FACTOR;
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
billing.mountWebhook(app, express); // corps brut, avant express.json()
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
// maxAge null : cookie de session (effacé à la fermeture du navigateur), quand « Rester connecté » est décoché.
function setSession(res, t, maxAge) {
  res.append("Set-Cookie", `af_session=${t}; Path=/; HttpOnly; SameSite=Lax${maxAge == null ? "" : `; Max-Age=${maxAge}`}${PROD ? "; Secure" : ""}`);
}
const hasPassword = (a) => !a.password_hash.startsWith("!");
// Propriétaires qui confient un chantier à ce proche (ils paient pour lui).
const sponsorsOf = (a) => all("SELECT DISTINCT o.contact_name FROM sites s JOIN artisans o ON o.id = s.owner_id WHERE s.artisan_id = ? AND s.owner_id <> ?", a.id, a.id).map((x) => x.contact_name);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const isAdmin = (a) => !!a && (a.is_admin === 1 || (a.email && ADMIN_EMAILS.includes(a.email)));
const publicArtisan = (a) => ({
  id: a.id, email: a.email, phone: a.phone, phone_pretty: phoneLib.pretty(a.phone), phone_verified: !!a.phone_verified_at, account_type: a.account_type, company: a.company, contact_name: a.contact_name, city: a.city, country: a.country, company_id: a.company_id,
  market: a.market, currency: a.currency, trial_ends_at: a.trial_ends_at, google: !!a.google_sub, apple: !!a.apple_sub, has_password: hasPassword(a), created_at: a.created_at, admin: isAdmin(a),
  // Entreprise : offre en cours (essai, Démarrage, PME, Pro ou gratuite). Les proches et l'équipe ne paient pas.
  access: a.account_type === "pro" ? billing.proPlan(a) : { status: "free", active: true, until: null, days_left: 0 },
  team_sites: a.account_type === "membre" || team.memberSiteIds(a).length ? team.memberSiteIds(a).length : 0,
  client: a.account_type === "client" ? space.clientInfo(a) : undefined,
  sponsors: a.account_type === "proche" ? sponsorsOf(a) : undefined
});
function removeFiles(files) { files.forEach((f) => fs.rm(path.join(UPLOAD_DIR, path.basename(f)), { force: true }, () => {})); }

/* ---------- Authentification ---------- */
function sessionArtisan(req) {
  const t = cookies(req).af_session;
  const s = t && get("SELECT * FROM sessions WHERE token = ? AND expires_at > ?", t, nowIso());
  return s ? get("SELECT * FROM artisans WHERE id = ?", s.artisan_id) : null;
}
// Compte ouvert avec un numéro seulement, pas encore confirmé par un code : il peut lire, changer son numéro ou
// supprimer son compte, rien d'autre. Sinon n'importe qui pourrait s'inscrire, sans mot de passe, au numéro d'un autre.
const phonePending = (a) => !!(a.phone && !a.phone_verified_at && !a.email);
function auth(req, res, next) {
  req.artisan = sessionArtisan(req);
  if (!req.artisan) return res.status(401).json({ error: "Connectez-vous pour continuer." });
  if (phonePending(req.artisan) && req.method !== "GET" && req.path !== "/me/phone" && !(req.method === "DELETE" && req.path === "/me"))
    return res.status(403).json({ error: "Confirmez d'abord votre numéro de téléphone avec le code reçu.", confirm_phone: true });
  next();
}
// « Rester connecté » (coché par défaut) : 30 jours. Sinon, la session s'arrête à la fermeture du navigateur (12 h au plus).
function openSession(res, artisanId, remember = true) {
  const t = token(32);
  run("INSERT INTO sessions (token, artisan_id, expires_at) VALUES (?, ?, ?)", t, artisanId, new Date(Date.now() + (remember ? 30 * DAY : 12 * 36e5)).toISOString());
  setSession(res, t, remember ? 30 * 86400 : null);
}
// Identifiant de connexion : adresse e-mail, ou numéro de téléphone (avec l'indicatif choisi à côté du champ).
function identOf(v, dial) {
  const raw = str(v, 200, "téléphone ou e-mail");
  if (raw.includes("@")) return { email: email(raw, "e-mail", true) };
  const p = phoneLib.normalize(raw, dial);
  if (!p) fail(400, "Numéro de téléphone illisible. Choisissez le pays à côté du champ, ou écrivez le numéro avec l'indicatif (+229…).");
  return { phone: p };
}
const byIdent = (id) => (id.email ? get("SELECT * FROM artisans WHERE email = ?", id.email) : get("SELECT * FROM artisans WHERE phone = ?", id.phone));
const attempts = new Map();
function throttle(key) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  if (a.until > Date.now()) fail(429, "Trop d'essais. Réessayez dans 10 minutes.");
  return { failed() { a.n += 1; if (a.n >= 8) { a.until = Date.now() + 10 * 60e3; a.n = 0; } attempts.set(key, a); }, ok() { attempts.delete(key); } };
}
// Mots de passe les plus essayés par les pirates : refusés même s'ils font 8 caractères.
const COMMON = new Set(["12345678", "123456789", "1234567890", "password", "password1", "motdepasse", "azertyui", "azertyuiop", "qwertyui", "qwertyuiop", "11111111", "00000000", "iloveyou", "sunshine", "princess", "football", "baseball", "welcome1", "abcd1234", "abc12345", "archfield", "senegal1", "bonjour1", "soleil123", "doudou123", "loulou123", "chouchou", "12341234", "87654321", "aaaaaaaa", "q1w2e3r4", "1q2w3e4r", "passw0rd", "admin123", "letmein1"]);
const passwordOk = (p) => {
  const s = str(p, 200, "mot de passe");
  if (s.length < 8) fail(400, "Le mot de passe doit faire au moins 8 caractères.");
  if (COMMON.has(s.toLowerCase()) || /^(.)\1+$/.test(s)) fail(400, "Ce mot de passe est trop courant : choisissez-en un autre, par exemple trois mots séparés par des tirets.");
  return s;
};

// Inscription : par e-mail et mot de passe, ou après « Continuer avec Google / Apple » (google_token : jeton de l'identité en attente).
app.post("/api/signup", limit("signup", 10, 60 * 60e3), wrap(async (req, res) => {
  const b = req.body || {};
  const teamInvite = b.invite_code && /^EQP-/i.test(String(b.invite_code)) ? teamApi.findTeamInvite(b.invite_code) : null;
  const invite = b.invite_code && !teamInvite ? spaceApi.findInvitation(b.invite_code) : null;
  const type = teamInvite ? "membre" : invite ? (invite.kind === "pro" ? "pro" : "proche") : b.account_type === "client" ? "client" : "pro";
  if ((b.account_type === "proche" || b.account_type === "membre") && !invite && !teamInvite) fail(400, "Ce type de compte se crée avec le lien d'invitation reçu.");
  let co;
  if (type === "pro") co = checkCompany(b.country, b.company_id);
  else {
    // Client ou proche : pas de numéro d'entreprise ; la zone (euros ou FCFA) suit le pays, ou l'inviteur pour un proche.
    const owner = invite || teamInvite ? get("SELECT market, currency FROM artisans WHERE id = ?", (invite || teamInvite).created_by) : null;
    const country = COUNTRIES[b.country] ? b.country : "";
    co = owner ? { country, company_id: "", market: owner.market, currency: owner.currency }
      : { country, company_id: "", market: COUNTRIES[country]?.market || "eu", currency: COUNTRIES[country]?.currency || "EUR" };
  }
  if (co.error) fail(400, co.error);
  let mail = null, tel = null, hash, googleSub = null, appleSub = null;
  if (b.google_token) {
    const p = get("SELECT * FROM oauth_pending WHERE token_hash = ? AND expires_at > ?", sha256(String(b.google_token)), nowIso());
    if (!p) fail(400, "La connexion a expiré. Recommencez avec « Continuer avec Google » ou « Continuer avec Apple ».");
    mail = p.email; hash = "!" + p.provider;
    if (p.provider === "apple") appleSub = p.subject; else googleSub = p.subject;
  } else {
    // Téléphone ou e-mail dans le même champ (« ident ») ; « email » reste accepté seul.
    const id = identOf(b.ident ?? b.email, b.dial || b.country);
    mail = id.email || null; tel = id.phone || null;
    // Avec un numéro, le mot de passe est facultatif : on se connecte alors avec un code reçu par WhatsApp ou SMS.
    hash = tel && !b.password ? "!code" : await bcrypt.hash(passwordOk(b.password), 10);
  }
  if (mail && get("SELECT 1 FROM artisans WHERE email = ?", mail)) fail(409, "Un compte existe déjà avec cet e-mail. Connectez-vous.");
  if (tel && get("SELECT 1 FROM artisans WHERE phone = ?", tel)) fail(409, "Un compte existe déjà avec ce numéro. Connectez-vous.");
  const contact = str(b.contact_name, 120, "nom");
  const id = tx(() => {
    const r = run(
      `INSERT INTO artisans (email, phone, password_hash, account_type, company, contact_name, city, country, company_id, market, currency, google_sub, apple_sub, email_verified_at, trial_ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mail, tel, hash, type, type === "pro" ? str(b.company, 120, "entreprise") : contact, contact, str(b.city, 120, "ville", false), co.country, co.company_id,
      co.market, co.currency, googleSub, appleSub, b.google_token ? nowIso() : null, new Date(Date.now() + (type === "client" ? space.CLIENT_TRIAL_DAYS : TRIAL_DAYS) * DAY).toISOString(), nowIso());
    if (b.google_token) run("DELETE FROM oauth_pending WHERE token_hash = ?", sha256(String(b.google_token)));
    return Number(r.lastInsertRowid);
  });
  if (invite) spaceApi.acceptInvitation(invite.code, get("SELECT * FROM artisans WHERE id = ?", id));
  if (teamInvite) teamApi.acceptTeamInvite(teamInvite.code, get("SELECT * FROM artisans WHERE id = ?", id));
  openSession(res, id, b.remember !== false);
  // Inscription par téléphone : le numéro est confirmé ensuite par un code (WhatsApp ou SMS).
  res.status(201).json({ ok: true, confirm_phone: !!tel });
}));

app.post("/api/login", wrap(async (req, res) => {
  const b = req.body || {};
  const id = identOf(b.ident ?? b.email, b.dial);
  const t = throttle(req.ip + "|" + (id.email || id.phone));
  const a = byIdent(id);
  if (a && a.password_hash === "!code") fail(400, "Ce compte n'a pas de mot de passe : connectez-vous avec un code reçu par WhatsApp ou SMS.");
  if (a && !hasPassword(a)) fail(400, a.apple_sub && !a.google_sub ? "Ce compte se connecte avec Apple. Cliquez sur « Continuer avec Apple »." : "Ce compte se connecte avec Google. Cliquez sur « Continuer avec Google ».");
  if (!a || !(await bcrypt.compare(String(b.password || ""), a.password_hash))) { t.failed(); fail(401, id.phone ? "Numéro ou mot de passe incorrect." : "E-mail ou mot de passe incorrect."); }
  t.ok();
  openSession(res, a.id, b.remember !== false && b.remember !== "off");
  res.json({ ok: true, confirm_phone: phonePending(a) });
}));

// Connexion sans mot de passe : un code à 6 chiffres par WhatsApp ou SMS au numéro du compte.
// Dire qu'aucun compte n'a ce numéro n'apprend rien de plus que l'inscription (« Un compte existe déjà avec ce numéro »).
app.post("/api/login/code/send", limit("login-code", 12, 60 * 60e3), wrap(async (req, res) => {
  const id = identOf(req.body?.ident, req.body?.dial);
  if (!id.phone) fail(400, "La connexion par code se fait avec un numéro de téléphone.");
  if (!get("SELECT 1 FROM artisans WHERE phone = ?", id.phone)) fail(404, "Aucun compte avec ce numéro. Vérifiez-le, ou créez un compte.");
  const r = await phoneLib.sendCode(id.phone, "login", req.body?.channel);
  res.json({ ok: true, phone: id.phone, phone_pretty: phoneLib.pretty(id.phone), ...r });
}));
app.post("/api/login/code", limit("phone-check", 30, 60 * 60e3), wrap(async (req, res) => {
  const tel = phoneLib.normalize(req.body?.phone, null);
  const a = tel && get("SELECT * FROM artisans WHERE phone = ?", tel);
  if (!a) fail(400, "Ce code a expiré. Demandez-en un nouveau.");
  await phoneLib.checkCode(tel, "login", req.body?.code);
  // Le code est arrivé sur ce téléphone : le numéro est prouvé.
  run("UPDATE artisans SET phone_verified_at = COALESCE(phone_verified_at, ?) WHERE id = ?", nowIso(), a.id);
  openSession(res, a.id, req.body?.remember !== false);
  res.json({ ok: true });
}));

/* ---------- Numéro de téléphone : code à 6 chiffres par WhatsApp ou SMS ---------- */
app.post("/api/phone/send", limit("phone-send", 12, 60 * 60e3), wrap(async (req, res) => {
  const a = sessionArtisan(req);
  if (!a) fail(401, "Connectez-vous pour continuer.");
  if (!a.phone) fail(400, "Aucun numéro de téléphone sur ce compte.");
  if (a.phone_verified_at) return res.json({ ok: true, verified: true });
  const r = await phoneLib.sendCode(a.phone, "verify", req.body?.channel);
  res.json({ ok: true, phone: phoneLib.pretty(a.phone), ...r });
}));
app.post("/api/phone/verify", limit("phone-check", 30, 60 * 60e3), wrap(async (req, res) => {
  const a = sessionArtisan(req);
  if (!a) fail(401, "Connectez-vous pour continuer.");
  await phoneLib.checkCode(a.phone, "verify", req.body?.code);
  run("UPDATE artisans SET phone_verified_at = ? WHERE id = ?", nowIso(), a.id);
  res.json({ ok: true });
}));

// Comptes de démo en un clic : seulement si DEMO=on (tests automatiques, captures). Désactivés par défaut :
// les vrais tests se font avec de vrais comptes (npm run purge-demo retire les comptes de démo d'une base).
const DEMO_ON = process.env.DEMO === "on";
const DEMO_ACCOUNTS = { eu: "demo@archfield.app", af: "demo-afrique@archfield.app", client: "demo-client@archfield.app", proche: "demo-proche@archfield.app" };
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
// Par téléphone : un code est envoyé par WhatsApp ou SMS, puis /api/password/reset-code.
app.post("/api/password/forgot", limit("forgot", 5, 60 * 60e3), wrap(async (req, res) => {
  const id = identOf(req.body?.ident ?? req.body?.email, req.body?.dial);
  if (id.phone) {
    const a = get("SELECT id FROM artisans WHERE phone = ?", id.phone);
    let r = {};
    if (a) r = await phoneLib.sendCode(id.phone, "reset", req.body?.channel);
    return res.json({ ok: true, method: "code", phone: id.phone, phone_pretty: phoneLib.pretty(id.phone), wait: phoneLib.RESEND_S, ...(r.test_code ? { test_code: r.test_code } : {}) });
  }
  const mail = id.email;
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
    // Le lien est arrivé dans la boîte mail : l'adresse est prouvée.
    run("UPDATE artisans SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", hash, nowIso(), r.artisan_id);
    run("UPDATE password_resets SET used_at = ? WHERE artisan_id = ? AND used_at IS NULL", nowIso(), r.artisan_id);
    run("DELETE FROM sessions WHERE artisan_id = ?", r.artisan_id);
  });
  openSession(res, r.artisan_id);
  res.json({ ok: true });
}));
app.post("/api/password/reset-code", limit("reset", 20, 60 * 60e3), wrap(async (req, res) => {
  const tel = phoneLib.normalize(req.body?.phone, null);
  if (!tel) fail(400, "Numéro de téléphone illisible.");
  const password = passwordOk(req.body?.password);
  const a = get("SELECT * FROM artisans WHERE phone = ?", tel);
  if (!a) fail(400, "Ce code a expiré. Demandez-en un nouveau.");
  await phoneLib.checkCode(tel, "reset", req.body?.code);
  const hash = await bcrypt.hash(password, 10);
  tx(() => {
    run("UPDATE artisans SET password_hash = ?, phone_verified_at = COALESCE(phone_verified_at, ?) WHERE id = ?", hash, nowIso(), a.id);
    run("DELETE FROM sessions WHERE artisan_id = ?", a.id);
  });
  openSession(res, a.id);
  res.json({ ok: true });
}));

// Les comptes de démo ne sont affichés sur la page de connexion que si DEMO=on.
app.get("/api/config", (req, res) => res.json({
  demo: DEMO_ON, google: GOOGLE.enabled, apple: APPLE.enabled, countries: publicCountries(), dial: phoneLib.publicDial(),
  plans: publicPlans(), billing: billing.live() ? "stripe" : billing.testMode() ? "test" : "off", sms: phoneLib.PROVIDER || "test"
}));

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
  oauthDone(res, "google", user.sub, user.email, user.name);
}));

// Fin commune à Google et Apple : compte connu (par identifiant ou par e-mail) → connexion ;
// sinon, l'identité est gardée 30 minutes, le temps de répondre aux questions de l'inscription.
// Un compte trouvé par l'e-mail seulement n'est rattaché que si son adresse est prouvée : sinon, quelqu'un aurait pu
// s'inscrire avec l'e-mail d'un autre et un mot de passe à lui, puis récupérer le compte une fois la victime arrivée par Google.
function oauthDone(res, provider, sub, email, name) {
  const col = provider === "apple" ? "apple_sub" : "google_sub";
  const mail = String(email).toLowerCase();
  const a = get(`SELECT * FROM artisans WHERE ${col} = ?`, String(sub)) || get("SELECT * FROM artisans WHERE email = ?", mail);
  if (a && !a[col] && !a.email_verified_at) return res.redirect(303, "/connexion?erreur=compte-existant");
  if (a) {
    if (!a[col]) run(`UPDATE artisans SET ${col} = ? WHERE id = ?`, String(sub), a.id);
    openSession(res, a.id);
    return res.redirect(303, "/app");
  }
  const t = token(24);
  run("INSERT INTO oauth_pending (token_hash, provider, subject, email, name, expires_at) VALUES (?, ?, ?, ?, ?, ?)", sha256(t), provider, String(sub), mail, String(name || ""), new Date(Date.now() + 30 * 60e3).toISOString());
  res.redirect(303, `/inscription?google=${t}`);
}

/* ---------- Connexion avec Apple (Sign in with Apple, OpenID Connect) ---------- */
// Il faut un compte Apple Developer : un « Services ID » (APPLE_CLIENT_ID), l'identifiant d'équipe (APPLE_TEAM_ID)
// et une clé « Sign in with Apple » (APPLE_KEY_ID, APPLE_PRIVATE_KEY : contenu du fichier .p8).
// Apple renvoie l'utilisateur par un formulaire POST venu de son site : le cookie de session (SameSite=Lax) n'y est
// pas joint, donc l'état de la demande est gardé côté serveur, 10 minutes.
const APPLE = {
  id: process.env.APPLE_CLIENT_ID, team: process.env.APPLE_TEAM_ID, keyId: process.env.APPLE_KEY_ID,
  key: (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  authUrl: process.env.APPLE_AUTH_URL || "https://appleid.apple.com/auth/authorize",
  tokenUrl: process.env.APPLE_TOKEN_URL || "https://appleid.apple.com/auth/token",
  issuer: "https://appleid.apple.com"
};
APPLE.enabled = !!(APPLE.id && APPLE.team && APPLE.keyId && APPLE.key);
const appleRedirect = () => `${BASE_URL}/auth/apple/callback`;
const appleStates = new Map(); // état → { nonce, expire }
const b64url = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
// Le « mot de passe » de l'application auprès d'Apple : un jeton signé avec la clé privée (ES256), valable 5 minutes.
function appleClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url({ alg: "ES256", kid: APPLE.keyId })}.${b64url({ iss: APPLE.team, iat: now, exp: now + 300, aud: APPLE.issuer, sub: APPLE.id })}`;
  return `${data}.${crypto.sign("sha256", Buffer.from(data), { key: APPLE.key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

app.get("/auth/apple", limit("oauth", 30, 10 * 60e3), (req, res) => {
  if (!APPLE.enabled) return res.redirect("/connexion?erreur=apple-indisponible");
  const state = token(24), nonce = token(16), now = Date.now();
  for (const [k, v] of appleStates) if (v.expire < now) appleStates.delete(k);
  appleStates.set(state, { nonce, expire: now + 10 * 60e3 });
  const q = new URLSearchParams({ client_id: APPLE.id, redirect_uri: appleRedirect(), response_type: "code", response_mode: "form_post", scope: "name email", state, nonce });
  res.redirect(`${APPLE.authUrl}?${q}`);
});

app.post("/auth/apple/callback", limit("oauth", 30, 10 * 60e3), express.urlencoded({ extended: false, limit: "20kb" }), wrap(async (req, res) => {
  const back = (code) => res.redirect(303, "/connexion?erreur=" + code);
  const b = req.body || {};
  const st = appleStates.get(String(b.state || ""));
  appleStates.delete(String(b.state || ""));
  if (!APPLE.enabled || !st || st.expire < Date.now() || !b.code) return back("apple");
  let claims;
  try {
    const tr = await fetch(APPLE.tokenUrl, {
      method: "POST", signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: APPLE.id, client_secret: appleClientSecret(), code: String(b.code), grant_type: "authorization_code", redirect_uri: appleRedirect() })
    });
    const tok = await tr.json();
    if (!tr.ok || !tok.id_token) throw new Error("jeton refusé");
    // Le jeton d'identité vient directement d'Apple, par une connexion HTTPS que nous avons ouverte (OpenID Connect,
    // § 3.1.3.7) : on contrôle son émetteur, son destinataire, sa date et le nonce de la demande.
    claims = JSON.parse(Buffer.from(String(tok.id_token).split(".")[1] || "", "base64url").toString());
    if (claims.iss !== APPLE.issuer || claims.aud !== APPLE.id || !(claims.exp * 1000 > Date.now()) || claims.nonce !== st.nonce || !claims.sub || !claims.email) throw new Error("jeton invalide");
  } catch (e) {
    console.error("Connexion Apple échouée :", e.message);
    return back("apple");
  }
  if (!(claims.email_verified === true || claims.email_verified === "true")) return back("apple-email");
  // Le nom n'est envoyé par Apple qu'à la toute première connexion.
  let name = "";
  try { const u = JSON.parse(b.user || "{}"); name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(" "); } catch (e) {}
  oauthDone(res, "apple", claims.sub, claims.email, name);
}));

app.get("/api/oauth-pending/:token", (req, res) => {
  const p = get("SELECT provider, email, name FROM oauth_pending WHERE token_hash = ? AND expires_at > ?", sha256(req.params.token), nowIso());
  if (!p) fail(404, "La connexion a expiré. Recommencez avec « Continuer avec Google » ou « Continuer avec Apple ».");
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
const siteFiles = (siteId) => all(`SELECT p.file FROM photos p JOIN updates u ON u.id = p.update_id WHERE u.site_id = ? UNION SELECT a.file FROM audios a JOIN updates u ON u.id = a.update_id WHERE u.site_id = ?
  UNION SELECT receipt_file FROM ledger WHERE site_id = ? AND receipt_file IS NOT NULL`, siteId, siteId, siteId).map((p) => p.file);
// Position de référence du chantier. Les coordonnées ne sont montrées qu'à qui peut la confirmer (le client).
const positionInfo = (s, withPoint = false) => (s.lat != null ? {
  set_at: s.position_set_at, set_by: s.position_set_by, confirmed_at: s.position_confirmed_at, confirmed_by: s.position_confirmed_by,
  ...(withPoint ? { lat: s.lat, lng: s.lng } : {})
} : null);
function startNextIfIdle(siteId, afterPosition) {
  const steps = all("SELECT * FROM steps WHERE site_id = ? ORDER BY position", siteId);
  if (steps.some((s) => stepStatus(s) === "en_cours")) return;
  const next = steps.find((s) => s.position > afterPosition && !s.started_at);
  if (next) run("UPDATE steps SET started_at = ? WHERE id = ?", nowIso(), next.id);
}

api.get("/me", (req, res) => res.json(publicArtisan(req.artisan)));
api.patch("/me", (req, res) => {
  const b = req.body || {}, a = req.artisan;
  const contact = b.contact_name !== undefined ? str(b.contact_name, 120, "nom") : a.contact_name;
  // Un client ou un proche n'a pas d'entreprise : son nom en tient lieu.
  run("UPDATE artisans SET company = ?, contact_name = ?, city = ? WHERE id = ?",
    a.account_type !== "pro" ? contact : b.company !== undefined ? str(b.company, 120, "entreprise") : a.company,
    contact, b.city !== undefined ? str(b.city, 120, "ville", false) : a.city, a.id);
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

// Ajouter ou changer son numéro : il faudra le confirmer par un code (POST /api/phone/send puis /api/phone/verify).
api.post("/me/phone", (req, res) => {
  const tel = phoneLib.normalize(req.body?.phone, req.body?.dial || req.artisan.country);
  if (!tel) fail(400, "Numéro de téléphone illisible. Écrivez-le avec l'indicatif du pays, par exemple +229 01 97 00 00 00.");
  const other = get("SELECT id FROM artisans WHERE phone = ?", tel);
  if (other && other.id !== req.artisan.id) fail(409, "Ce numéro est déjà utilisé par un autre compte.");
  if (tel !== req.artisan.phone) run("UPDATE artisans SET phone = ?, phone_verified_at = NULL WHERE id = ?", tel, req.artisan.id);
  res.json(publicArtisan(get("SELECT * FROM artisans WHERE id = ?", req.artisan.id)));
});

// Se déconnecter partout (téléphone perdu, ordinateur partagé) : toutes les sessions sauf celle-ci.
api.post("/me/logout-others", (req, res) => {
  const n = run("DELETE FROM sessions WHERE artisan_id = ? AND token <> ?", req.artisan.id, cookies(req).af_session).changes;
  res.json({ ok: true, closed: Number(n) });
});

// RGPD : export de toutes les données du compte, puis suppression définitive.
// L'export couvre les chantiers gérés et ceux dont le compte est propriétaire, avec leur argent, leurs visites et
// leurs invitations, plus les lignes d'argent que le compte a notées sur un chantier qu'il ne suit plus.
api.get("/me/export", (req, res) => {
  const a = req.artisan;
  const sites = all("SELECT * FROM sites WHERE artisan_id = ? OR owner_id = ? ORDER BY created_at", a.id, a.id).map((s) => ({
    ...s,
    role: s.artisan_id === a.id ? (s.owner_id === a.id ? "proprietaire_gestionnaire" : "gestionnaire") : "proprietaire",
    client_link: `${BASE_URL}/c/${s.client_token}`,
    steps: all("SELECT * FROM steps WHERE site_id = ? ORDER BY position", s.id),
    updates: team.updatesOf(s.id, BASE_URL + "/media/", { team: true, limitN: 100000 }),
    documents: all("SELECT * FROM documents WHERE site_id = ? ORDER BY doc_date", s.id),
    ledger: all("SELECT * FROM ledger WHERE site_id = ? ORDER BY entry_date, id", s.id).map((l) => ({ ...l, receipt_url: l.receipt_file ? BASE_URL + "/media/" + l.receipt_file : null })),
    visit_requests: all("SELECT * FROM visit_requests WHERE site_id = ? ORDER BY created_at", s.id),
    invitations: all("SELECT code, kind, invitee_name, created_at, accepted_at, revoked_at FROM invitations WHERE site_id = ? ORDER BY created_at", s.id),
    reports: all("SELECT * FROM reports WHERE site_id = ? ORDER BY period_end", s.id).map((r) => ({ ...r, data: JSON.parse(r.data) }))
  }));
  const ledgerElsewhere = all(`SELECT l.*, s.name AS site_name FROM ledger l JOIN sites s ON s.id = l.site_id
    WHERE l.created_by = ? AND s.artisan_id <> ? AND (s.owner_id IS NULL OR s.owner_id <> ?) ORDER BY l.entry_date, l.id`, a.id, a.id, a.id)
    .map((l) => ({ ...l, receipt_file: undefined }));
  res.setHeader("Content-Disposition", `attachment; filename="archfield-export-${nowIso().slice(0, 10)}.json"`);
  res.json({ exported_at: nowIso(), account: publicArtisan(a), sites, ledger_on_other_sites: ledgerElsewhere });
});
api.delete("/me", wrap(async (req, res) => {
  const a = req.artisan, typed = String(req.body?.password || "").trim();
  // Sans mot de passe : on tape l'e-mail du compte, ou son numéro s'il n'a pas d'e-mail (connexion par code).
  const ok = hasPassword(a) ? await bcrypt.compare(typed, a.password_hash) : a.email ? typed.toLowerCase() === a.email : phoneLib.normalize(typed, a.country) === a.phone;
  if (!ok) fail(400, hasPassword(a) ? "Mot de passe incorrect : le compte n'a pas été supprimé." : a.email ? "Tapez l'adresse e-mail du compte pour confirmer la suppression." : "Tapez le numéro de téléphone du compte pour confirmer la suppression.");
  // Les chantiers gérés pour un propriétaire lui reviennent ; les autres sont effacés avec leurs photos et leurs reçus.
  // Les demandes de visite (téléphone, précisions) partent avec le compte. Les lignes d'argent notées sur le chantier
  // d'un autre restent chez lui, avec le nom de leur auteur : c'est sa trace des versements et des dépenses.
  const id = req.artisan.id;
  const files = tx(() => {
    run("UPDATE sites SET artisan_id = owner_id WHERE artisan_id = ? AND owner_id IS NOT NULL AND owner_id <> ?", id, id);
    const f = all("SELECT id FROM sites WHERE artisan_id = ?", id).flatMap((s) => siteFiles(s.id));
    run("DELETE FROM visit_requests WHERE requested_by = ?", id);
    run("DELETE FROM artisans WHERE id = ?", id);
    return f;
  });
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

api.post("/sites", (req, res) => {
  if (req.artisan.account_type !== "pro") fail(403, "Seule une entreprise crée des chantiers ici. Les clients créent les leurs dans leur espace.");
  // Limite de l'offre : les chantiers confiés par un client ne comptent pas (c'est le client qui paie).
  const plan = billing.proPlan(req.artisan);
  if (plan.sites != null && billing.ownSitesCount(req.artisan) >= plan.sites)
    fail(402, plan.status === "free" ? "Sans abonnement, une entreprise suit un chantier à elle. Choisissez une offre pour en créer d'autres." : `Votre offre permet ${plan.sites} chantiers en cours. Passez à l'offre supérieure, ou marquez un chantier comme livré.`);
  const b = req.body || {};
  const steps = Array.isArray(b.steps) ? b.steps : [];
  if (!steps.length) fail(400, "Ajoutez au moins une étape.");
  if (steps.length > 30) fail(400, "30 étapes au maximum.");
  const clientName = str(b.client_name, 120, "client");
  const id = tx(() => {
    const r = run(
      `INSERT INTO sites (artisan_id, currency, name, location, kind, client_name, client_short, client_email, client_phone, client_city, client_token, tracking_code, budget, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.artisan.id, req.artisan.currency, str(b.name, 120, "nom du chantier"), str(b.location, 120, "lieu", false), b.kind === "ext" ? "ext" : "int",
      clientName, str(b.client_short, 60, "prénom du client", false) || clientName.split(" ")[0], email(b.client_email, "e-mail du client", false), phone(b.client_phone),
      str(b.client_city, 120, "ville du client", false), token(16), newTrackingCode(), Math.round(num(b.budget || 0, "budget")), nowIso());
    const siteId = Number(r.lastInsertRowid);
    steps.forEach((s, i) => run("INSERT INTO steps (site_id, position, name, planned_days, started_at) VALUES (?, ?, ?, ?, ?)",
      siteId, i + 1, str(s.name, 80, "étape"), num(s.planned_days, "durée prévue", 0.5, 365), i === 0 && b.start_now ? nowIso() : null));
    return siteId;
  });
  res.status(201).json(siteWithSummary(get("SELECT * FROM sites WHERE id = ?", id)));
});

api.get("/sites/:id", (req, res) => {
  const s = ownSite(req, req.params.id);
  const owner = s.owner_id && s.owner_id !== s.artisan_id ? get("SELECT contact_name FROM artisans WHERE id = ?", s.owner_id) : null;
  const sum = siteWithSummary(s);
  res.json({
    ...sum, lat: undefined, lng: undefined,
    owner: owner ? owner.contact_name : null,
    can_reset_position: !s.owner_id || s.owner_id === req.artisan.id,
    position: positionInfo(s),
    money: money.moneyOf(s, "/media/", sum.progress),
    updates: team.updatesOf(s.id, "/media/", { team: true }),
    team_count: get("SELECT COUNT(*) AS n FROM members WHERE site_id = ?", s.id).n,
    deliveries: all("SELECT d.label, d.quantity, d.created_at, u.author_name FROM deliveries d LEFT JOIN updates u ON u.id = d.update_id WHERE d.site_id = ? ORDER BY d.created_at DESC LIMIT 100", s.id),
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
  if (s.owner_id && s.owner_id !== req.artisan.id) fail(409, "Ce chantier appartient à votre client : vous pouvez arrêter de le gérer, mais pas le supprimer.");
  const files = siteFiles(s.id);
  run("DELETE FROM sites WHERE id = ?", s.id);
  removeFiles(files);
  res.json({ ok: true });
});

// Le gestionnaire (entreprise ou proche) rend le chantier à son propriétaire.
api.post("/sites/:id/release", (req, res) => {
  const s = ownSite(req, req.params.id);
  if (!s.owner_id || s.owner_id === req.artisan.id) fail(409, "Ce chantier n'a pas de propriétaire à qui le rendre.");
  run("UPDATE sites SET artisan_id = owner_id WHERE id = ?", s.id);
  res.json({ ok: true });
});

// Nouvelle position du chantier (erreur à la première publication). Si un client possède le chantier, c'est lui qui décide.
api.post("/sites/:id/position/reset", (req, res) => {
  const s = ownSite(req, req.params.id);
  if (s.owner_id && s.owner_id !== req.artisan.id) fail(403, "Seul le propriétaire du chantier peut changer sa position.");
  run("UPDATE sites SET lat = NULL, lng = NULL, position_set_at = NULL, position_set_by = NULL, position_confirmed_at = NULL, position_confirmed_by = NULL WHERE id = ?", s.id);
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

// Rapport de la semaine en PDF (fond blanc), pour le gestionnaire et pour le lien privé du client.
const sendPdf = async (res, site) => {
  const buf = await require("./pdf").weeklyPdf(site);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="archfield-${site.tracking_code || site.id}-${nowIso().slice(0, 10)}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buf);
};
api.get("/sites/:id/rapport.pdf", limit("pdf", 60, 60 * 60e3, (req) => "a" + req.artisan.id), wrap(async (req, res) => {
  const x = team.accessOf(req.artisan, req.params.id);
  if (!x || (x.as === "member" && !x.perms.budget)) fail(404, "Chantier introuvable.");
  await sendPdf(res, x.site);
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

/* Publications : photos, messages vocaux, rapport du jour, problème signalé */
const IMG = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heic" };
// Enregistrements du navigateur (WebM/Opus sur Android et ordinateur, MP4/AAC sur iPhone) ou du dictaphone du téléphone.
const AUD = { "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/m4a": ".m4a", "audio/aac": ".aac", "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/3gpp": ".3gp" };
const mimeOf = (f) => String(f.mimetype || "").split(";")[0].trim().toLowerCase();
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, f, cb) => cb(null, token(18) + (IMG[mimeOf(f)] || AUD[mimeOf(f)] || "")) }),
  limits: { fileSize: 15 * 1024 * 1024, files: 16 },
  fileFilter: (req, f, cb) => {
    if (f.fieldname === "audios") return cb(AUD[mimeOf(f)] ? null : new HttpError(400, "Ce message vocal n'est pas lisible. Enregistrez-le à nouveau."), !!AUD[mimeOf(f)]);
    cb(IMG[mimeOf(f)] ? null : new HttpError(400, "Seules les photos JPEG, PNG, WebP ou HEIC (iPhone) sont acceptées."), !!IMG[mimeOf(f)]);
  }
});
// Le type annoncé par le navigateur peut mentir : on lit les premiers octets du fichier pour vérifier que c'est
// bien une image (JPEG, PNG, WebP, HEIC) ou un son (WebM, Ogg, MP4/M4A, MP3, AAC, WAV). Un fichier déguisé est refusé.
async function checkFiles(files) {
  for (const f of files) {
    const fh = await fs.promises.open(f.path, "r");
    const head = Buffer.alloc(16);
    try { await fh.read(head, 0, 16, 0); } finally { await fh.close(); }
    const ascii = (a, b) => head.subarray(a, b).toString("latin1");
    const ok = f.fieldname === "audios"
      ? (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) || ascii(0, 4) === "OggS" || ascii(4, 8) === "ftyp" || ascii(0, 3) === "ID3"
        || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) || (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE")
      : (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) || ascii(0, 8) === "\x89PNG\r\n\x1a\n"
        || (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") || (ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(ascii(8, 12)));
    if (!ok) throw new HttpError(400, f.fieldname === "audios" ? "Ce message vocal n'est pas lisible. Enregistrez-le à nouveau." : `« ${f.originalname} » n'est pas une photo valide.`);
  }
}

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

const TOPICS = ["post", "rapport", "probleme"];
const WEATHER = ["soleil", "nuageux", "pluie", "orage", "vent"];
const PROBLEMS = ["accident", "panne", "retard", "materiel", "securite", "autre"];
api.post("/sites/:id/updates", limit("upload", 60, 60 * 60e3, (req) => "a" + req.artisan.id), upload.fields([{ name: "photos", maxCount: 10 }, { name: "audios", maxCount: 6 }]), wrap(async (req, res) => {
  const photosF = req.files?.photos || [], audiosF = req.files?.audios || [], files = [...photosF, ...audiosF];
  try {
    const x = team.accessOf(req.artisan, req.params.id);
    if (!x) fail(404, "Chantier introuvable.");
    if (x.as === "owner") fail(403, "Ce chantier est géré par quelqu'un d'autre : c'est lui qui publie l'avancement.");
    const s = x.site, p = x.perms, b = req.body;
    if (req.artisan.account_type === "proche" && x.as === "manager" && !space.prochePublishAllowed(s)) fail(402, "Le propriétaire du chantier doit activer l'offre Plus pour que vous puissiez publier.");
    // Ce que le gestionnaire autorise est ce que les autres peuvent faire.
    const topic = TOPICS.includes(b.topic) ? b.topic : "post";
    const allowed = topic === "rapport" ? p.rapport : topic === "probleme" ? p.probleme : (!photosF.length || p.photos) && (!audiosF.length || p.vocal) && (photosF.length || audiosF.length ? true : p.photos);
    if (!allowed) fail(403, "Le gestionnaire du chantier ne vous a pas donné ce droit.");
    const text = str(b.text, 2000, "message", false);
    if (!text && !photosF.length && !audiosF.length) fail(400, "Ajoutez une phrase, une photo ou un message vocal.");
    const st = b.step_id ? get("SELECT * FROM steps WHERE id = ? AND site_id = ?", Number(b.step_id), s.id) : null;
    if (b.step_id && !st) fail(400, "Étape inconnue pour ce chantier.");
    let data = null, deliveries = [];
    if (topic === "rapport") {
      data = { workers: Math.round(num(b.workers || 0, "ouvriers présents", 0, 2000)), weather: WEATHER.includes(b.weather) ? b.weather : null };
      let list = [];
      try { list = JSON.parse(b.deliveries || "[]"); } catch (e) { fail(400, "Livraisons illisibles."); }
      if (!Array.isArray(list) || list.length > 20) fail(400, "20 livraisons au plus par rapport.");
      deliveries = list.map((d) => ({ label: str(d?.label, 120, "livraison"), quantity: str(d?.quantity, 60, "quantité", false) }));
    } else if (topic === "probleme") data = { category: PROBLEMS.includes(b.category) ? b.category : "autre" };
    let durations = [];
    try { durations = JSON.parse(b.durations || "[]"); } catch (e) {}
    await checkFiles(files);
    await normalizePhotos(photosF);
    const done = x.as === "manager" && (b.done === "1" || b.done === "true");
    const now = nowIso();
    // Preuve : date de prise de vue des photos et position du téléphone, comparées à la position du chantier.
    const meta = cleanMeta(b.meta, photosF.length);
    const lat = Number(b.lat), lng = Number(b.lng);
    const pos = b.lat !== undefined && b.lat !== "" ? { lat, lng, accuracy: Number(b.accuracy) } : null;
    const v = verify({ site: s, pos, photos: meta });
    // Un problème, ou un message vocal seul, reste dans l'équipe jusqu'à ce que le gestionnaire le partage.
    // Quand le client gère lui-même son chantier, il est le responsable : rien ne lui est caché.
    const selfManaged = s.owner_id && s.owner_id === s.artisan_id;
    const visibility = !selfManaged && (topic === "probleme" || (topic === "post" && !photosF.length && audiosF.length && x.as !== "manager")) ? "team" : "all";
    const id = tx(() => {
      if (st && !st.started_at) run("UPDATE steps SET started_at = ? WHERE id = ?", now, st.id);
      if (v.setOrigin) run("UPDATE sites SET lat = ?, lng = ?, position_set_at = ?, position_set_by = ?, position_confirmed_at = NULL, position_confirmed_by = NULL WHERE id = ?", lat, lng, now, req.artisan.contact_name, s.id);
      const r = run(`INSERT INTO updates (site_id, step_id, kind, text, created_at, lat, lng, accuracy, verify, verify_note, topic, visibility, author_id, author_name, data, checked_at, checked_by_name)
        VALUES (?, ?, 'post', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s.id, st ? st.id : null, text, now, pos && v.note.position !== "unknown" ? lat : null, pos && v.note.position !== "unknown" ? lng : null, v.note.accuracy ?? null,
        photosF.length || pos ? v.status : null, photosF.length || pos ? JSON.stringify(v.note) : null, topic, visibility, req.artisan.id, req.artisan.contact_name,
        data ? JSON.stringify(data) : null, x.as === "manager" ? now : null, x.as === "manager" ? req.artisan.contact_name : null);
      const uid = Number(r.lastInsertRowid);
      photosF.forEach((f, i) => run("INSERT INTO photos (update_id, file, taken_at, shot_at, shot_lat, shot_lng) VALUES (?, ?, ?, ?, ?, ?)", uid, f.filename, now, meta[i].shot_at, meta[i].lat, meta[i].lng));
      audiosF.forEach((f, i) => run("INSERT INTO audios (update_id, file, duration, created_at) VALUES (?, ?, ?, ?)", uid, f.filename, Math.min(130, Math.max(0, Number(durations[i]) || 0)), now));
      deliveries.forEach((d) => run("INSERT INTO deliveries (site_id, update_id, label, quantity, created_at) VALUES (?, ?, ?, ?, ?)", s.id, uid, d.label, d.quantity, now));
      if (done && st && !st.finished_at) {
        run("UPDATE steps SET finished_at = ? WHERE id = ?", now, st.id);
        run("INSERT INTO updates (site_id, step_id, kind, created_at) VALUES (?, ?, 'step_done', ?)", s.id, st.id, new Date(Date.now() + 1000).toISOString());
      }
      return uid;
    });
    const notified = visibility === "all" ? await notifyClient(s, get("SELECT * FROM artisans WHERE id = ?", s.artisan_id) || req.artisan, text || (topic === "rapport" ? "Rapport du jour" : "Nouvelles photos")) : false;
    res.status(201).json({ id, photos: photosF.length, audios: audiosF.length, notified, verify: v.status, note: v.note, visibility });
  } catch (e) {
    removeFiles(files.map((f) => f.filename));
    throw e;
  }
}));

api.delete("/updates/:id", (req, res) => {
  const u = get("SELECT u.* FROM updates u JOIN sites si ON si.id = u.site_id WHERE u.id = ? AND si.artisan_id = ?", Number(req.params.id), req.artisan.id);
  if (!u) fail(404, "Mise à jour introuvable.");
  if (u.kind !== "post") fail(409, "Seules vos publications peuvent être supprimées.");
  const files = all("SELECT file FROM photos WHERE update_id = ? UNION SELECT file FROM audios WHERE update_id = ?", u.id, u.id).map((p) => p.file);
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

const teamApi = team.mount(app, api, { fail, str, num, wrap, limit, nowIso, token });
// Invitation dans une équipe (code EQP-…) : lecture publique et acceptation, avant les invitations « entreprise » et « proche ».
app.get("/api/invitations/:code", limit("invite-read", 60, 10 * 60e3), (req, res, next) => {
  if (!/^EQP-/i.test(req.params.code)) return next();
  const i = teamApi.findTeamInvite(req.params.code);
  res.json({ code: i.code, kind: "membre", role: i.role, site: i.site_name, location: i.location, owner: i.owner_type === "pro" ? i.company : i.owner_name, invitee: i.invitee_name, contact: i.invitee_contact });
});
api.post("/invitations/:code/accept", (req, res, next) => (/^EQP-/i.test(req.params.code) ? res.json({ site_id: teamApi.acceptTeamInvite(req.params.code, req.artisan) }) : next()));
billing.mount(app, api, { fail, wrap, limit });
require("./admin").mount(app, api, { fail, str, isAdmin, nowIso, grant: billing.grant });
const spaceApi = space.mount(app, api, { fail, str, num, wrap, limit, nowIso, token, sendMail });
money.mount(app, api, { fail, str, num, wrap, limit, nowIso, upload, normalizePhotos, removeFiles, checkFiles });
// Routes publiques sous /api : lien du client et lecture d'une invitation.
app.use("/api", (req, res, next) => (req.path.startsWith("/c/") || (req.method === "GET" && req.path.startsWith("/invitations/")) ? next() : api(req, res, next)));

/* ---------- Client (lien privé, sans compte) ---------- */
function bySiteToken(t) {
  const s = get("SELECT * FROM sites WHERE client_token = ?", String(t));
  if (!s) fail(404, "Ce lien n'est plus valide. Demandez un nouveau lien à votre artisan.");
  return s;
}
// Qui valide une étape depuis le lien : jamais le gestionnaire (il validerait son propre travail, et déclencherait
// le versement prévu) ; si le propriétaire a un espace client, lui seul, connecté.
function validator(req, s) {
  const a = sessionArtisan(req);
  if (s.owner_id && s.owner_id !== s.artisan_id) return a && a.id === s.owner_id ? { name: a.contact_name } : { block: "owner" };
  if (a && a.id === s.artisan_id && a.id !== s.owner_id) return { block: "manager" };
  return { name: a && a.id === s.owner_id ? a.contact_name : "lien du client" };
}
const VALIDATE_BLOCKED = {
  owner: "Ce chantier est suivi dans un espace client : connectez-vous à cet espace pour valider l'étape.",
  manager: "Vous gérez ce chantier : c'est à votre client de valider l'étape."
};
app.get("/api/c/:token", limit("client", 120, 60e3), (req, res) => {
  const s = bySiteToken(req.params.token);
  const a = get("SELECT * FROM artisans WHERE id = ?", s.artisan_id);
  const now = nowIso();
  const sum = siteWithSummary(s);
  const who = validator(req, s);
  const out = {
    ...sum,
    client_token: undefined, client_email: undefined, client_phone: undefined, last_notified_at: undefined, lat: undefined, lng: undefined,
    artisan: { company: a.company, contact_name: a.contact_name, city: a.city, currency: s.currency },
    // validate_block : ce visiteur ne peut pas agir au nom du client (valider une étape, confirmer la position).
    validate_block: who.block || null,
    position: positionInfo(s, !who.block),
    money: money.publicMoney(money.moneyOf(s, `/c/${s.client_token}/media/`, sum.progress)),
    updates: team.updatesOf(s.id, `/c/${s.client_token}/media/`).map((u) => ({ ...u, seen_at: undefined, author_id: undefined, checked_by_name: undefined })),
    documents: all("SELECT kind, ref, label, amount, status, doc_date FROM documents WHERE site_id = ? ORDER BY doc_date, id", s.id),
    reports: all("SELECT id, period_start, period_end, sent_at, data FROM reports WHERE site_id = ? ORDER BY period_end DESC LIMIT 12", s.id).map((r) => ({ ...r, data: JSON.parse(r.data) }))
  };
  // Le client a ouvert son lien : publications vues, rapports lus.
  run("UPDATE updates SET seen_at = ? WHERE site_id = ? AND seen_at IS NULL AND visibility = 'all'", now, s.id);
  run("UPDATE reports SET opened_at = ? WHERE site_id = ? AND opened_at IS NULL", now, s.id);
  run("UPDATE sites SET last_client_visit_at = ? WHERE id = ?", now, s.id);
  res.json(out);
});
app.get("/api/c/:token/rapport.pdf", limit("pdf", 30, 60 * 60e3), wrap(async (req, res) => sendPdf(res, bySiteToken(req.params.token))));
app.post("/api/c/:token/steps/:id/validate", limit("client-write", 30, 60e3), (req, res) => {
  const s = bySiteToken(req.params.token);
  const st = get("SELECT * FROM steps WHERE id = ? AND site_id = ?", Number(req.params.id), s.id);
  if (!st) fail(404, "Étape introuvable.");
  if (stepStatus(st) !== "a_valider") fail(409, "Cette étape n'attend pas de validation.");
  const who = validator(req, s);
  if (who.block) fail(403, VALIDATE_BLOCKED[who.block]);
  tx(() => {
    run("UPDATE steps SET validated_at = ?, validated_by = ? WHERE id = ?", nowIso(), who.name, st.id);
    run("INSERT INTO updates (site_id, step_id, kind, created_at, seen_at) VALUES (?, ?, 'step_validated', ?, ?)", s.id, st.id, nowIso(), nowIso());
    startNextIfIdle(s.id, st.position);
  });
  res.json({ ok: true });
});

// Le client confirme que la position enregistrée est bien celle de son chantier (voir space.confirmPosition).
app.post("/api/c/:token/position/confirm", limit("client-write", 30, 60e3), (req, res) => {
  const s = bySiteToken(req.params.token);
  const who = validator(req, s);
  if (who.block) fail(403, VALIDATE_BLOCKED[who.block]);
  if (!space.confirmPosition(s, who.name, nowIso())) fail(409, "La position du chantier n'est pas encore enregistrée.");
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
// Fichier → chantier, et visibilité de la publication (un problème interne n'est pas montré au client).
const fileSite = (file) => {
  const f = path.basename(String(file));
  return get("SELECT u.site_id, u.visibility FROM photos p JOIN updates u ON u.id = p.update_id WHERE p.file = ?", f)
    || get("SELECT u.site_id, u.visibility FROM audios x JOIN updates u ON u.id = x.update_id WHERE x.file = ?", f)
    || get("SELECT site_id, 'all' AS visibility FROM ledger WHERE receipt_file = ?", f);
};
app.get("/media/:file", (req, res) => {
  const a = sessionArtisan(req), ph = fileSite(req.params.file);
  // Le gestionnaire, l'équipe et le propriétaire (client) du chantier voient ses photos, vocaux et reçus.
  const x = a && ph ? team.accessOf(a, ph.site_id) : null;
  if (!x || (x.as === "owner" && ph.visibility !== "all")) return res.status(404).end();
  sendPhoto(res, path.basename(req.params.file));
});
app.get("/c/:token/media/:file", limit("client-media", 600, 60e3), (req, res) => {
  const s = get("SELECT id FROM sites WHERE client_token = ?", req.params.token), ph = fileSite(req.params.file);
  if (!s || !ph || ph.site_id !== s.id || ph.visibility !== "all") return res.status(404).end();
  sendPhoto(res, path.basename(req.params.file));
});

/* ---------- Pages ---------- */
const page = (f) => (req, res) => res.sendFile(path.join(PUBLIC, f));
app.get("/", page("index.html"));
app.get(["/connexion", "/inscription", "/inscription/confirmer", "/inscription/code", "/mot-de-passe-oublie", "/reinitialiser", "/invitation/:code"], page("auth.html"));
app.get("/paiement-test", page("paiement-test.html"));
app.get("/admin", page("admin.html"));
app.get("/confidentialite", page("confidentialite.html"));
app.get("/a-propos", page("a-propos.html"));
app.get("/guide", page("guide.html"));
app.get("/telecharger", page("telecharger.html"));
app.get("/mentions-legales", page("mentions-legales.html"));
app.get("/app", page("app.html"));
// Lien du client : la page annonce un manifeste propre à ce lien, pour que l'application installée depuis le lien
// rouvre ce chantier (et non la page de connexion, puisque le client n'a pas de compte).
app.get("/c/:token", (req, res) => {
  const html = fs.readFileSync(path.join(PUBLIC, "client.html"), "utf8");
  const href = /^[\w-]{1,100}$/.test(req.params.token) ? `/c/${req.params.token}/manifest.webmanifest` : "/manifest.webmanifest";
  res.type("html").send(html.replace('href="/manifest.webmanifest"', `href="${href}"`));
});
app.get("/hors-connexion", page("offline.html"));
// Surveillance (UptimeRobot…) : répond « ok » si le serveur et la base répondent.
app.get("/healthz", (req, res) => { get("SELECT 1"); res.type("text").send("ok"); });
// Service worker : sa version suit le contenu du site, pour que l'application installée se mette à jour seule.
let swCache = { at: 0, body: "" };
function siteVersion(dir = PUBLIC) {
  const h = crypto.createHash("sha1");
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) h.update(siteVersion(f));
    else { const st = fs.statSync(f); h.update(`${e.name}:${st.size}:${st.mtimeMs}`); }
  }
  return h.digest("hex").slice(0, 12);
}
app.get("/sw.js", (req, res) => {
  if (Date.now() - swCache.at > 5000) swCache = { at: Date.now(), body: fs.readFileSync(path.join(PUBLIC, "sw.js"), "utf8").replace("__VERSION__", siteVersion()) };
  res.type("application/javascript").setHeader("Cache-Control", "no-cache");
  res.send(swCache.body);
});
app.get("/manifest.webmanifest", (req, res) => { res.type("application/manifest+json"); res.sendFile(path.join(PUBLIC, "manifest.webmanifest")); });
app.get("/c/:token/manifest.webmanifest", limit("client", 120, 60e3), (req, res) => {
  const s = get("SELECT name FROM sites WHERE client_token = ?", req.params.token);
  const m = JSON.parse(fs.readFileSync(path.join(PUBLIC, "manifest.webmanifest"), "utf8"));
  if (s) {
    const start = `/c/${req.params.token}`;
    Object.assign(m, { id: start, start_url: start, scope: start, name: `${s.name} · Archfield` });
  }
  res.type("application/manifest+json").setHeader("Cache-Control", "no-cache");
  res.send(JSON.stringify(m));
});
app.use(express.static(PUBLIC, { index: false, maxAge: PROD ? "1h" : 0 }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Une photo dépasse 15 Mo." : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE" ? "10 photos au maximum par mise à jour." : "Envoi des photos refusé : " + err.message });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  // Erreurs des modules (téléphone, paiement, équipe) : un statut HTTP et un message prêt à afficher.
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600 && err.message) return res.status(err.status).json({ error: err.message });
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
  run("DELETE FROM phone_codes WHERE expires_at < ?", new Date(Date.now() - DAY).toISOString());
}

// En développement : adresse à ouvrir sur un téléphone connecté au même Wi-Fi, avec un QR code à scanner.
const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
function showPhoneAccess() {
  const ips = Object.values(require("node:os").networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal && !/^169\.254\./.test(i.address)).map((i) => i.address)
    .sort((a, b) => rank(a) - rank(b)); // le Wi-Fi d'une box (192.168…) avant les réseaux virtuels (WSL, VirtualBox)
  if (!ips.length) return console.log("Aucun réseau Wi-Fi détecté : le site n'est ouvrable que sur cet ordinateur.");
  const urls = ips.map((ip) => `http://${ip}:${PORT}`);
  console.log(`\nSur votre téléphone, connecté au même Wi-Fi, ouvrez : ${urls.join("  ou  ")}`);
  try { require("qrcode-terminal").generate(urls[0], { small: true }, (qr) => console.log(qr)); } catch (e) {}
  console.log("Si le téléphone n'y arrive pas, autorisez Node.js dans le pare-feu (réseau privé) quand Windows le demande.\n");
}

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Archfield écoute sur http://localhost:${PORT}`);
    if (!PROD) showPhoneAccess();
  });
  cleanup();
  setInterval(cleanup, 60 * 60e3);
  if (process.env.REPORTS !== "off") startScheduler();
}

module.exports = app;
