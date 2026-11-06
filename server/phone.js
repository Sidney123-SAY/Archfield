// Numéros de téléphone : format international, envoi des codes de confirmation par WhatsApp ou SMS.
//
// Sans service configuré (SMS_PROVIDER vide), le code est écrit dans le journal du serveur, et affiché à l'écran
// si SHOW_TEST_CODES=on : c'est le mode des tests en local. En production, Twilio Verify envoie le code
// par SMS ou par WhatsApp et le vérifie lui-même (SMS_PROVIDER=twilio, voir deploy/TELEPHONE.md).
const crypto = require("node:crypto");
const { get, run } = require("./db");

// Indicatif de chaque pays ; trunk : le 0 du numéro national disparaît au format international (06… → +33 6…).
// Au Bénin et en Côte d'Ivoire, le 0 fait partie du numéro (+229 01…, +225 07…).
const DIAL = {
  FR: { code: "33", trunk: true, name: "France" }, BE: { code: "32", trunk: true, name: "Belgique" }, CH: { code: "41", trunk: true, name: "Suisse" },
  LU: { code: "352", name: "Luxembourg" }, DE: { code: "49", trunk: true, name: "Allemagne" }, IT: { code: "39", name: "Italie" }, ES: { code: "34", name: "Espagne" },
  GB: { code: "44", trunk: true, name: "Royaume-Uni" }, NL: { code: "31", trunk: true, name: "Pays-Bas" }, PT: { code: "351", name: "Portugal" },
  CA: { code: "1", name: "Canada" }, US: { code: "1", name: "États-Unis" },
  BJ: { code: "229", name: "Bénin" }, SN: { code: "221", name: "Sénégal" }, CI: { code: "225", name: "Côte d'Ivoire" }, TG: { code: "228", name: "Togo" },
  BF: { code: "226", name: "Burkina Faso" }, ML: { code: "223", name: "Mali" }, NE: { code: "227", name: "Niger" }, GN: { code: "224", name: "Guinée" },
  CM: { code: "237", name: "Cameroun" }, GA: { code: "241", name: "Gabon" }, CG: { code: "242", name: "Congo" }, CD: { code: "243", trunk: true, name: "RD Congo" },
  TD: { code: "235", name: "Tchad" }, CF: { code: "236", name: "Centrafrique" }, GQ: { code: "240", name: "Guinée équatoriale" },
  MA: { code: "212", trunk: true, name: "Maroc" }, DZ: { code: "213", trunk: true, name: "Algérie" }, TN: { code: "216", name: "Tunisie" },
  MR: { code: "222", name: "Mauritanie" }, GH: { code: "233", trunk: true, name: "Ghana" }, NG: { code: "234", trunk: true, name: "Nigeria" }
};

// « 01 97 00 00 00 » avec le pays BJ → « +2290197000000 ». Renvoie null si ce n'est pas un numéro plausible.
function normalize(input, country) {
  let s = String(input || "").trim().replace(/[\s.()\-/]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) s = "+" + s.slice(1).replace(/\D/g, "");
  else {
    if (!/^\d+$/.test(s)) return null;
    const d = DIAL[String(country || "").toUpperCase()];
    if (!d) return null;
    s = "+" + d.code + (d.trunk && s.startsWith("0") ? s.slice(1) : s);
  }
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}
const isPhoneLike = (s) => /^[+\d\s.()\-/]{6,}$/.test(String(s || "").trim()) && !String(s).includes("@");
// Pour l'affichage : « +229 01 97 00 00 00 » (groupes de deux chiffres après l'indicatif).
function pretty(p) {
  if (!p) return "";
  const code = Object.values(DIAL).map((d) => d.code).sort((a, b) => b.length - a.length).find((c) => p.startsWith("+" + c));
  if (!code) return p;
  const rest = p.slice(code.length + 1);
  return `+${code} ${rest.replace(/(\d{2})(?=\d)/g, "$1 ")}`;
}
const publicDial = () => Object.entries(DIAL).map(([k, v]) => ({ country: k, code: v.code, name: v.name }));

/* ---------- Envoi et vérification des codes ---------- */
const PROVIDER = (process.env.SMS_PROVIDER || "").toLowerCase(); // "" (journal du serveur) ou "twilio"
const TWILIO = { sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN, verify: process.env.TWILIO_VERIFY_SID, base: process.env.TWILIO_VERIFY_URL || "https://verify.twilio.com/v2" };
const SHOW_CODES = process.env.SHOW_TEST_CODES === "on" || (process.env.NODE_ENV !== "production" && process.env.SHOW_TEST_CODES !== "off");
const CODE_MIN = 10, RESEND_S = 45, MAX_TRIES = 5, MAX_PER_HOUR = 6;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const enabled = () => PROVIDER !== "twilio" || !!(TWILIO.sid && TWILIO.token && TWILIO.verify);

async function twilio(path, params) {
  const r = await fetch(`${TWILIO.base}/Services/${TWILIO.verify}/${path}`, {
    method: "POST", signal: AbortSignal.timeout(10000),
    headers: { Authorization: "Basic " + Buffer.from(`${TWILIO.sid}:${TWILIO.token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.message || "Envoi du code refusé."); e.status = r.status; throw e; }
  return data;
}

// Envoie un code. Renvoie { channel, wait } ; en mode test, aussi { test_code } pour l'afficher à l'écran.
// Lève une erreur { status, message } si l'on demande trop vite ou trop souvent.
async function sendCode(phone, purpose, channel) {
  channel = channel === "sms" ? "sms" : "whatsapp";
  const now = Date.now();
  const last = get("SELECT created_at FROM phone_codes WHERE phone = ? AND purpose = ? ORDER BY id DESC LIMIT 1", phone, purpose);
  if (last && now - Date.parse(last.created_at) < RESEND_S * 1000) {
    const e = new Error(`Patientez ${Math.ceil(RESEND_S - (now - Date.parse(last.created_at)) / 1000)} secondes avant de demander un nouveau code.`); e.status = 429; throw e;
  }
  const n = get("SELECT COUNT(*) AS n FROM phone_codes WHERE phone = ? AND created_at > ?", phone, new Date(now - 3600e3).toISOString()).n;
  if (n >= MAX_PER_HOUR) { const e = new Error("Trop de codes demandés pour ce numéro. Réessayez dans une heure."); e.status = 429; throw e; }
  const created = new Date(now).toISOString(), expires = new Date(now + CODE_MIN * 60e3).toISOString();
  if (PROVIDER === "twilio") {
    await twilio("Verifications", { To: phone, Channel: channel, Locale: "fr" });
    run("INSERT INTO phone_codes (phone, purpose, channel, code_hash, created_at, expires_at) VALUES (?, ?, ?, NULL, ?, ?)", phone, purpose, channel, created, expires);
    return { channel, wait: RESEND_S };
  }
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  run("INSERT INTO phone_codes (phone, purpose, channel, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)", phone, purpose, channel, sha(phone + ":" + code), created, expires);
  console.log(`[code ${channel === "sms" ? "SMS" : "WhatsApp"}] ${phone} (${purpose}) : ${code}  — aucun service d'envoi configuré, le code n'est écrit qu'ici.`);
  return { channel, wait: RESEND_S, ...(SHOW_CODES ? { test_code: code } : {}) };
}

// Vérifie le dernier code envoyé. true si bon ; lève une erreur claire sinon.
async function checkCode(phone, purpose, code) {
  const c = String(code || "").replace(/\D/g, "");
  const row = get("SELECT * FROM phone_codes WHERE phone = ? AND purpose = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1", phone, purpose);
  const fail = (m, status = 400) => { const e = new Error(m); e.status = status; throw e; };
  if (!row || Date.parse(row.expires_at) < Date.now()) fail("Ce code a expiré. Demandez-en un nouveau.");
  if (row.attempts >= MAX_TRIES) fail("Trop d'essais avec ce code. Demandez-en un nouveau.", 429);
  run("UPDATE phone_codes SET attempts = attempts + 1 WHERE id = ?", row.id);
  if (c.length !== 6) fail("Le code contient 6 chiffres.");
  let ok;
  if (row.code_hash) ok = crypto.timingSafeEqual(Buffer.from(sha(phone + ":" + c)), Buffer.from(row.code_hash));
  else { const r = await twilio("VerificationCheck", { To: phone, Code: c }); ok = r.status === "approved"; }
  if (!ok) fail("Code incorrect. Vérifiez les 6 chiffres reçus.");
  run("UPDATE phone_codes SET used_at = ? WHERE id = ?", new Date().toISOString(), row.id);
  return true;
}

module.exports = { DIAL, normalize, isPhoneLike, pretty, publicDial, sendCode, checkCode, enabled, SHOW_CODES, RESEND_S, PROVIDER };
