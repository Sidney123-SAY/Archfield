// Connexion avec Google (faux serveur Google local), numéros d'entreprise et comptes de démo.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const GPORT = 39000 + (process.pid % 1000);
Object.assign(process.env, {
  NODE_ENV: "test", DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "archfield-test-")),
  GOOGLE_CLIENT_ID: "id-test", GOOGLE_CLIENT_SECRET: "secret-test",
  GOOGLE_AUTH_URL: `http://127.0.0.1:${GPORT}/auth`, GOOGLE_TOKEN_URL: `http://127.0.0.1:${GPORT}/token`, GOOGLE_USERINFO_URL: `http://127.0.0.1:${GPORT}/userinfo`
});
const app = require("../server/server");
const { siret, bce, ide, checkCompany } = require("../server/company");

let server, google, base;
let profile = { sub: "g-123", email: "Moussa@Example.com", email_verified: true, name: "Moussa Sarr" };
test.before(async () => {
  google = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/token") return res.end(JSON.stringify({ access_token: "tok" }));
    if (req.url === "/userinfo") return res.end(JSON.stringify(req.headers.authorization === "Bearer tok" ? profile : {}));
    res.statusCode = 404; res.end("{}");
  }).listen(GPORT);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); google.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

const req = (url, opts = {}) => fetch(base + url, { redirect: "manual", ...opts });
const cookieOf = (res, name) => (res.headers.getSetCookie().find((c) => c.startsWith(name + "=")) || "").split(";")[0];

async function googleRound(stateOverride) {
  const start = await req("/auth/google");
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const oauth = cookieOf(start, "af_oauth");
  return req(`/auth/google/callback?code=abc&state=${stateOverride || state}`, { headers: { Cookie: oauth } });
}

test("numéros d'entreprise : SIRET, BCE, IDE", () => {
  assert.equal(siret("443 061 841 00047"), "44306184100047");
  assert.equal(siret("44306184100048"), null);
  assert.equal(bce("0403.170.701"), "0403170701");
  assert.equal(bce("0403170702"), null);
  assert.equal(ide("CHE-116.281.710"), "CHE116281710");
  assert.match(checkCompany("FR", "").error, /obligatoire/);
  assert.equal(checkCompany("SN", "").market, "af");
  assert.equal(checkCompany("BE", "0403170701").market, "eu");
});

test("inscription : SIRET obligatoire et vérifié en France, facultatif en Afrique de l'Ouest et centrale", async () => {
  const body = { email: "fr@example.com", password: "chantier-2026", company: "Rhône Rénov", contact_name: "Marc", country: "FR" };
  const post = (b) => req("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  assert.equal((await post(body)).status, 400);
  assert.equal((await post({ ...body, company_id: "12345678901234" })).status, 400);
  const ok = await post({ ...body, company_id: "443 061 841 00047" });
  assert.equal(ok.status, 201);
  const me = await (await req("/api/me", { headers: { Cookie: cookieOf(ok, "af_session") } })).json();
  assert.equal(me.company_id, "44306184100047");
  assert.equal(me.currency, "EUR");
  const sn = await post({ ...body, email: "sn@example.com", country: "SN", company_id: "" });
  assert.equal(sn.status, 201);
  assert.equal((await (await req("/api/me", { headers: { Cookie: cookieOf(sn, "af_session") } })).json()).currency, "XOF");
  // Afrique centrale : franc CFA d'Afrique centrale (XAF), même tarif en FCFA.
  const cm = await post({ ...body, email: "cm@example.com", country: "CM", company_id: "RC/DLA/2024/B/123" });
  assert.equal(cm.status, 201);
  const cmMe = await (await req("/api/me", { headers: { Cookie: cookieOf(cm, "af_session") } })).json();
  assert.equal(cmMe.currency, "XAF");
  assert.equal(cmMe.access.status, "free", "gratuit pour les entreprises");
  const client = await post({ email: "ga@example.com", password: "chantier-2026", contact_name: "Léa", account_type: "client", country: "GA" });
  assert.equal((await (await req("/api/me", { headers: { Cookie: cookieOf(client, "af_session") } })).json()).currency, "XAF");
  assert.equal((await req("/api/entreprise/12345678901234")).status, 400);
});

test("connexion avec Google : nouveau compte, puis reconnexion", async () => {
  assert.equal((await (await req("/api/config")).json()).google, true);
  assert.equal((await googleRound("mauvais-etat")).headers.get("location"), "/connexion?erreur=google");

  const cb = await googleRound();
  const loc = cb.headers.get("location");
  assert.match(loc, /^\/inscription\?google=/);
  const gtoken = new URL(base + loc).searchParams.get("google");
  const pending = await (await req("/api/oauth-pending/" + gtoken)).json();
  assert.equal(pending.email, "moussa@example.com");

  const su = await req("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ google_token: gtoken, country: "SN", company: "Sarr Construction", contact_name: "Moussa Sarr" }) });
  assert.equal(su.status, 201);
  const me = await (await req("/api/me", { headers: { Cookie: cookieOf(su, "af_session") } })).json();
  assert.equal(me.google, true);
  assert.equal(me.has_password, false);

  const login = await req("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "moussa@example.com", password: "nimportequoi" }) });
  assert.match((await login.json()).error, /Google/);

  const again = await googleRound();
  assert.equal(again.headers.get("location"), "/app");
  assert.ok(cookieOf(again, "af_session").length > 20);

  profile = { ...profile, sub: "g-999", email: "autre@example.com", email_verified: false };
  assert.equal((await googleRound()).headers.get("location"), "/connexion?erreur=google-email");
});

test("démo : connexion en un clic, message clair si les données ne sont pas chargées", async () => {
  const r = await req("/api/demo-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: "af" }) });
  assert.equal(r.status, 404);
  assert.match((await r.json()).error, /npm run seed/);
});
