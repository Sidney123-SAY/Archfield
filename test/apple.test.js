// Connexion avec Apple : faux serveur Apple local, vraie clé ES256 pour le « client_secret ».
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const APORT = 41000 + (process.pid % 1000);
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
Object.assign(process.env, {
  NODE_ENV: "test", DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "archfield-apple-")),
  APPLE_CLIENT_ID: "app.archfield.web", APPLE_TEAM_ID: "TEAM123456", APPLE_KEY_ID: "KEY1234567",
  APPLE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).replace(/\n/g, "\\n"), // comme dans un fichier .env
  APPLE_AUTH_URL: `http://127.0.0.1:${APORT}/auth/authorize`, APPLE_TOKEN_URL: `http://127.0.0.1:${APORT}/auth/token`
});
const app = require("../server/server");

let server, apple, base, nonce = "", claims = {};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
test.before(async () => {
  apple = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const p = new URLSearchParams(body);
      // Le client_secret doit être un jeton ES256 signé par notre clé, destiné à Apple.
      const [h, pl, sig] = (p.get("client_secret") || "").split(".");
      const ok = sig && crypto.verify("sha256", Buffer.from(`${h}.${pl}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
      const payload = ok ? JSON.parse(Buffer.from(pl, "base64url")) : {};
      res.setHeader("Content-Type", "application/json");
      if (!ok || payload.iss !== "TEAM123456" || payload.sub !== "app.archfield.web" || p.get("code") !== "code-ok") { res.statusCode = 400; return res.end('{"error":"invalid_client"}'); }
      res.end(JSON.stringify({ id_token: `${b64({ alg: "RS256" })}.${b64({ iss: "https://appleid.apple.com", aud: "app.archfield.web", exp: Math.floor(Date.now() / 1000) + 600, nonce, ...claims })}.sig` }));
    });
  }).listen(APORT);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); apple.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

const req = (url, opts = {}) => fetch(base + url, { redirect: "manual", ...opts });
const cookieOf = (res) => (res.headers.getSetCookie().find((c) => c.startsWith("af_session=")) || "").split(";")[0];
// Apple renvoie l'utilisateur par un formulaire POST, sans cookie.
async function appleRound({ state, code = "code-ok", user } = {}) {
  const start = await req("/auth/apple");
  const q = new URL(start.headers.get("location")).searchParams;
  assert.equal(q.get("response_mode"), "form_post");
  nonce = q.get("nonce");
  const form = new URLSearchParams({ state: state || q.get("state"), code });
  if (user) form.set("user", JSON.stringify(user));
  return req("/auth/apple/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
}

test("connexion avec Apple : nouveau compte, reconnexion, refus", async () => {
  assert.equal((await (await req("/api/config")).json()).apple, true);
  claims = { sub: "apple-001", email: "Fatou@privaterelay.appleid.com", email_verified: "true" };
  assert.equal((await appleRound({ state: "faux" })).headers.get("location"), "/connexion?erreur=apple");
  assert.equal((await appleRound({ code: "mauvais" })).headers.get("location"), "/connexion?erreur=apple");

  // Première fois : Apple donne le nom, l'inscription demande le reste.
  const first = await appleRound({ user: { name: { firstName: "Fatou", lastName: "Sow" } } });
  assert.equal(first.status, 303);
  const pending = new URL(first.headers.get("location"), base).searchParams.get("google");
  const p = await (await req("/api/oauth-pending/" + pending)).json();
  assert.equal(p.provider, "apple"); assert.equal(p.name, "Fatou Sow"); assert.equal(p.email, "fatou@privaterelay.appleid.com");
  const signup = await req("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_type: "client", contact_name: "Fatou Sow", google_token: pending }) });
  assert.equal(signup.status, 201);
  const me = await (await req("/api/me", { headers: { Cookie: cookieOf(signup) } })).json();
  assert.equal(me.apple, true); assert.equal(me.has_password, false);

  // Ensuite : connexion directe ; la connexion par mot de passe renvoie vers Apple.
  const again = await appleRound();
  assert.equal(again.headers.get("location"), "/app");
  assert.ok(cookieOf(again));
  const pw = await req("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "fatou@privaterelay.appleid.com", password: "x" }) });
  assert.match((await pw.json()).error, /Apple/);

  // Jeton d'un autre destinataire, ou adresse non vérifiée : refusé.
  claims = { sub: "apple-002", email: "x@ex.com", email_verified: "true", aud: "autre.app" };
  assert.equal((await appleRound()).headers.get("location"), "/connexion?erreur=apple");
  claims = { sub: "apple-003", email: "y@ex.com", email_verified: false };
  assert.equal((await appleRound()).headers.get("location"), "/connexion?erreur=apple-email");
});
