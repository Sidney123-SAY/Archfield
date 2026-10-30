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
  email TEXT NOT NULL UNIQUE,
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

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}

module.exports = { db, all, get, run, tx, DATA_DIR, UPLOAD_DIR };
