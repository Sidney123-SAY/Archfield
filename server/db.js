// Base SQLite (module node:sqlite intégré à Node 22). Les dates sont stockées en ISO 8601 UTC.
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, "archfield.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS artisans (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  market TEXT NOT NULL CHECK (market IN ('eu', 'af')),
  currency TEXT NOT NULL,
  trial_ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  artisan_id INTEGER NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY,
  artisan_id INTEGER NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'int' CHECK (kind IN ('int', 'ext')),
  client_name TEXT NOT NULL,
  client_short TEXT NOT NULL,
  client_email TEXT NOT NULL DEFAULT '',
  client_city TEXT NOT NULL DEFAULT '',
  client_token TEXT NOT NULL UNIQUE,
  budget INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'delivered')),
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  last_client_visit_at TEXT
);
CREATE TABLE IF NOT EXISTS steps (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  planned_days REAL NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  validated_at TEXT
);
CREATE TABLE IF NOT EXISTS updates (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  step_id INTEGER REFERENCES steps(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'post' CHECK (kind IN ('post', 'step_done', 'step_validated')),
  text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  seen_at TEXT
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  update_id INTEGER NOT NULL REFERENCES updates(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  taken_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('devis', 'facture')),
  ref TEXT NOT NULL,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('signe', 'en_attente', 'payee', 'a_regler')),
  doc_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  data TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  emailed INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT,
  UNIQUE (site_id, period_end)
);
CREATE INDEX IF NOT EXISTS idx_sites_artisan ON sites(artisan_id);
CREATE INDEX IF NOT EXISTS idx_steps_site ON steps(site_id, position);
CREATE INDEX IF NOT EXISTS idx_updates_site ON updates(site_id, created_at);
CREATE INDEX IF NOT EXISTS idx_photos_update ON photos(update_id);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  artisan_id INTEGER NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
`);

// Colonnes ajoutées après la première version : ajoutées à la volée sur une base existante.
// Renvoie true si la colonne vient d'être créée (pour une reprise de données à faire une seule fois).
function addColumn(table, column, def) {
  if (db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  return true;
}
addColumn("artisans", "paid_until", "TEXT");
addColumn("sites", "client_phone", "TEXT NOT NULL DEFAULT ''");
addColumn("sites", "last_notified_at", "TEXT");
addColumn("artisans", "country", "TEXT NOT NULL DEFAULT ''");
addColumn("artisans", "company_id", "TEXT NOT NULL DEFAULT ''");
addColumn("artisans", "google_sub", "TEXT");

// Inscription commencée avec Google, en attente du nom de l'entreprise et du pays.
db.exec(`
CREATE TABLE IF NOT EXISTS oauth_pending (
  token_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artisans_google ON artisans(google_sub) WHERE google_sub IS NOT NULL;
`);
addColumn("artisans", "apple_sub", "TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_artisans_apple ON artisans(apple_sub) WHERE apple_sub IS NOT NULL");

// Espace client : comptes « client » (propriétaire) et « proche » (particulier qui publie pour le client),
// numéro de suivi par chantier, invitations à gérer un chantier.
addColumn("artisans", "account_type", "TEXT NOT NULL DEFAULT 'pro'");
addColumn("artisans", "plan", "TEXT NOT NULL DEFAULT 'free'");
addColumn("sites", "owner_id", "INTEGER REFERENCES artisans(id) ON DELETE SET NULL");
addColumn("sites", "tracking_code", "TEXT");
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_tracking ON sites(tracking_code) WHERE tracking_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sites_owner ON sites(owner_id);
CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('pro', 'proche')),
  invitee_name TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  accepted_by INTEGER REFERENCES artisans(id) ON DELETE SET NULL,
  accepted_at TEXT,
  revoked_at TEXT
);
`);

// Argent, preuves et visites.
// - ledger : versements du client et dépenses du gestionnaire (reçu en photo). On n'efface jamais une ligne :
//   une annulation reste visible avec son auteur et sa date, pour que personne ne fasse disparaître une dépense.
// - steps.amount : versement prévu quand l'étape est validée (échéancier).
// - sites.lat/lng : position du chantier, enregistrée à la première publication géolocalisée.
// - updates.verify : photo vérifiée (date de prise de vue et position), cohérente, partielle ou suspecte.
addColumn("steps", "amount", "INTEGER NOT NULL DEFAULT 0");
addColumn("sites", "currency", "TEXT");
addColumn("sites", "lat", "REAL");
addColumn("sites", "lng", "REAL");
addColumn("sites", "position_set_at", "TEXT");
addColumn("sites", "position_set_by", "TEXT");
addColumn("updates", "lat", "REAL");
addColumn("updates", "lng", "REAL");
addColumn("updates", "accuracy", "REAL");
addColumn("updates", "verify", "TEXT");
addColumn("updates", "verify_note", "TEXT");
addColumn("photos", "shot_at", "TEXT");
addColumn("photos", "shot_lat", "REAL");
addColumn("photos", "shot_lng", "REAL");
db.exec(`
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('versement', 'depense')),
  amount INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  entry_date TEXT NOT NULL,
  step_id INTEGER REFERENCES steps(id) ON DELETE SET NULL,
  receipt_file TEXT,
  created_by INTEGER REFERENCES artisans(id) ON DELETE SET NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  cancelled_by_name TEXT,
  cancel_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ledger_site ON ledger(site_id, entry_date);
CREATE TABLE IF NOT EXISTS visit_requests (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  requested_by INTEGER REFERENCES artisans(id) ON DELETE SET NULL,
  wished_date TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'demandee',
  created_at TEXT NOT NULL
);
`);
// Preuves de confiance :
// - artisans.email_verified_at : l'adresse est prouvée (Google, Apple, ou lien de réinitialisation reçu). Sans elle,
//   « Continuer avec Google » ne rattache pas un compte existant, créé par quelqu'un qui aurait pris l'e-mail d'un autre.
// - steps.validated_by : qui a validé l'étape (le propriétaire connecté, ou « lien du client »).
addColumn("artisans", "email_verified_at", "TEXT");
db.exec("UPDATE artisans SET email_verified_at = created_at WHERE email_verified_at IS NULL AND (google_sub IS NOT NULL OR apple_sub IS NOT NULL)");
addColumn("steps", "validated_by", "TEXT");
// - sites.position_confirmed_at/_by : le client a confirmé la position du chantier, enregistrée par le gestionnaire à sa
//   première publication. Sans cette confirmation, une publication n'est que « cohérente », jamais « vérifiée ».
//   Avant cette colonne, aucune position n'était confirmée : les anciennes publications « vérifiées » deviennent « cohérentes ».
if (addColumn("sites", "position_confirmed_at", "TEXT")) db.exec("UPDATE updates SET verify = 'coherent' WHERE verify = 'verified'");
addColumn("sites", "position_confirmed_by", "TEXT");

// Monnaie propre au chantier : un client à Paris peut construire en FCFA à Thiès.
db.exec("UPDATE sites SET currency = (SELECT currency FROM artisans WHERE artisans.id = sites.artisan_id) WHERE currency IS NULL");

// Compte ouvert avec un numéro de téléphone seulement : l'e-mail devient facultatif. SQLite ne sait pas retirer
// un NOT NULL : la table est reconstruite (procédure officielle, clés étrangères suspendues le temps de la copie).
if (db.prepare("PRAGMA table_info(artisans)").all().find((c) => c.name === "email").notnull) {
  const cols = db.prepare("PRAGMA table_info(artisans)").all().map((c) => c.name).join(", ");
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'artisans'").get().sql;
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN");
    db.exec(sql.replace(/email TEXT NOT NULL UNIQUE/, "email TEXT UNIQUE").replace(/CREATE TABLE (IF NOT EXISTS )?"?artisans"?/, "CREATE TABLE artisans_new"));
    db.exec(`INSERT INTO artisans_new (${cols}) SELECT ${cols} FROM artisans`);
    db.exec("DROP TABLE artisans");
    db.exec("ALTER TABLE artisans_new RENAME TO artisans");
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; } finally { db.exec("PRAGMA foreign_keys = ON"); }
}
addColumn("artisans", "phone", "TEXT");
addColumn("artisans", "phone_verified_at", "TEXT");
// Inscrit avec un e-mail (pas Google ni Apple) alors que l'envoi d'e-mails marche : l'adresse est confirmée par un code.
addColumn("artisans", "email_confirm_required", "INTEGER NOT NULL DEFAULT 0");
addColumn("artisans", "is_admin", "INTEGER NOT NULL DEFAULT 0");
// Abonnement payé par carte (Stripe) ou activé à la main par l'équipe.
addColumn("artisans", "stripe_customer_id", "TEXT");
addColumn("artisans", "stripe_subscription_id", "TEXT");
addColumn("artisans", "sub_status", "TEXT");
addColumn("artisans", "sub_currency", "TEXT");
addColumn("artisans", "sub_cancel_at_end", "INTEGER NOT NULL DEFAULT 0");
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_artisans_google ON artisans(google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_artisans_apple ON artisans(apple_sub) WHERE apple_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_artisans_phone ON artisans(phone) WHERE phone IS NOT NULL;
-- Codes à 6 chiffres envoyés par WhatsApp ou SMS : confirmer un numéro, retrouver son mot de passe.
CREATE TABLE IF NOT EXISTS phone_codes (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  channel TEXT NOT NULL,
  code_hash TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_phone_codes ON phone_codes(phone, purpose, created_at);

-- Équipe d'un chantier : chef de chantier, chef d'équipe ou droits choisis case par case.
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  artisan_id INTEGER NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  perms TEXT NOT NULL,
  added_by INTEGER REFERENCES artisans(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (site_id, artisan_id)
);
CREATE TABLE IF NOT EXISTS team_invites (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  perms TEXT NOT NULL,
  invitee_name TEXT NOT NULL DEFAULT '',
  invitee_contact TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  accepted_by INTEGER REFERENCES artisans(id) ON DELETE SET NULL,
  accepted_at TEXT,
  revoked_at TEXT
);

-- Messages vocaux (2 minutes au plus chacun) et livraisons de matériaux, rattachés à une publication.
CREATE TABLE IF NOT EXISTS audios (
  id INTEGER PRIMARY KEY,
  update_id INTEGER NOT NULL REFERENCES updates(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  duration REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audios_update ON audios(update_id);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  update_id INTEGER REFERENCES updates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_site ON deliveries(site_id, created_at);

-- Paiements : chaque événement Stripe n'est traité qu'une fois ; sessions du paiement simulé (tests en local).
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  artisan_id INTEGER,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_sessions (
  id TEXT PRIMARY KEY,
  artisan_id INTEGER NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

-- Images de la page d'accueil remplacées depuis l'espace d'administration (vraies photos de chantier).
CREATE TABLE IF NOT EXISTS site_images (
  slot TEXT PRIMARY KEY,
  file TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
// Publications : rapport du jour, problème signalé ou publication simple ; visible du client ou de l'équipe seulement.
addColumn("updates", "topic", "TEXT NOT NULL DEFAULT 'post'");
addColumn("updates", "visibility", "TEXT NOT NULL DEFAULT 'all'");
addColumn("updates", "author_id", "INTEGER");
addColumn("updates", "author_name", "TEXT");
addColumn("updates", "data", "TEXT");
addColumn("updates", "checked_at", "TEXT");
addColumn("updates", "checked_by_name", "TEXT");
addColumn("updates", "resolved_at", "TEXT");
// Dépense notée par un membre de l'équipe : « En attente » jusqu'à l'approbation de celui qui gère le chantier.
addColumn("ledger", "status", "TEXT NOT NULL DEFAULT 'approuvee'");
addColumn("ledger", "reviewed_at", "TEXT");
addColumn("ledger", "reviewed_by_name", "TEXT");
addColumn("ledger", "review_note", "TEXT NOT NULL DEFAULT ''");
addColumn("site_images", "caption", "TEXT NOT NULL DEFAULT ''");
fs.mkdirSync(path.join(DATA_DIR, "site-images"), { recursive: true });

// Codes lisibles à dicter ou recopier : sans 0/O, 1/I/L. 31^8 combinaisons par code.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function readableCode(prefix) {
  const bytes = require("node:crypto").randomBytes(8);
  const c = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${prefix}-${c.slice(0, 4)}-${c.slice(4)}`;
}
function newTrackingCode() {
  for (;;) { const c = readableCode("ARC"); if (!db.prepare("SELECT 1 FROM sites WHERE tracking_code = ?").get(c)) return c; }
}
for (const s of db.prepare("SELECT id FROM sites WHERE tracking_code IS NULL").all()) db.prepare("UPDATE sites SET tracking_code = ? WHERE id = ?").run(newTrackingCode(), s.id);

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}

module.exports = { db, all, get, run, tx, DATA_DIR, UPLOAD_DIR, readableCode, newTrackingCode };
