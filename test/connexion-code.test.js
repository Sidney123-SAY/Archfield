// Connexion sans mot de passe : inscription avec un numéro seulement, confirmation par code, puis connexion par un
// code reçu par WhatsApp ou SMS. Tant que le numéro n'est pas confirmé, le compte ne peut rien écrire.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

Object.assign(process.env, { NODE_ENV: "test", DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "archfield-code-")), SHOW_TEST_CODES: "on" });
const app = require("../server/server");
const { run } = require("../server/db");

let server, base;
test.before(async () => { server = app.listen(0); await new Promise((r) => server.once("listening", r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

function user() {
  let cookie = "";
  const call = async (method, url, body) => {
    const headers = cookie ? { Cookie: cookie } : {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.getSetCookie().find((c) => c.startsWith("af_session="));
    if (set) cookie = set.split(";")[0];
    return { status: res.status, data: res.headers.get("content-type")?.includes("json") ? await res.json() : null };
  };
  return { call };
}
// Le délai entre deux codes (45 s) est sauté : on recule la date du dernier code envoyé.
const skipWait = () => run("UPDATE phone_codes SET created_at = ?", new Date(Date.now() - 3600e3 + 60e3).toISOString());

test("inscription avec un numéro, sans mot de passe, puis connexion par code", async () => {
  const awa = user();
  const su = await awa.call("POST", "/api/signup", { account_type: "client", contact_name: "Awa Ndiaye", ident: "77 123 45 67", dial: "SN", country: "SN" });
  assert.equal(su.status, 201, JSON.stringify(su.data));
  assert.equal(su.data.confirm_phone, true);
  const me = (await awa.call("GET", "/api/me")).data;
  assert.equal(me.has_password, false);
  assert.equal(me.phone_verified, false);

  // Numéro pas encore confirmé : lecture permise, écriture refusée.
  const blocked = await awa.call("POST", "/api/client/sites", { name: "Villa", city: "Saly" });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.confirm_phone, true);

  const sent = await awa.call("POST", "/api/phone/send", { channel: "whatsapp" });
  assert.equal((await awa.call("POST", "/api/phone/verify", { code: sent.data.test_code })).status, 200);
  assert.notEqual((await awa.call("POST", "/api/client/sites", { name: "Villa", city: "Saly" })).status, 403);

  // Connexion par mot de passe : refusée avec un message qui renvoie vers le code.
  const pw = await user().call("POST", "/api/login", { ident: "+221771234567", password: "nimporte-quoi" });
  assert.equal(pw.status, 400);
  assert.match(pw.data.error, /code/);

  // Connexion par code, depuis un autre appareil.
  skipWait();
  const phone = user();
  const code = await phone.call("POST", "/api/login/code/send", { ident: "77 123 45 67", dial: "SN", channel: "sms" });
  assert.equal(code.status, 200, JSON.stringify(code.data));
  assert.equal(code.data.phone, "+221771234567");
  assert.equal(code.data.channel, "sms");
  const wrong = code.data.test_code === "000000" ? "111111" : "000000";
  assert.equal((await phone.call("POST", "/api/login/code", { phone: code.data.phone, code: wrong })).status, 400, "mauvais code");
  assert.equal((await phone.call("POST", "/api/login/code", { phone: code.data.phone, code: code.data.test_code })).status, 200);
  assert.equal((await phone.call("GET", "/api/me")).data.contact_name, "Awa Ndiaye");
  assert.equal((await phone.call("POST", "/api/login/code", { phone: code.data.phone, code: code.data.test_code })).status, 400, "un code ne sert qu'une fois");

  // Suppression du compte sans mot de passe ni e-mail : on tape son numéro.
  assert.equal((await phone.call("DELETE", "/api/me", { password: "+221 77 000 00 00" })).status, 400);
  assert.equal((await phone.call("DELETE", "/api/me", { password: "+221 77 123 45 67" })).status, 200);
});

test("connexion par code : numéro inconnu, e-mail, compte avec mot de passe", async () => {
  const none = await user().call("POST", "/api/login/code/send", { ident: "+33612345678", channel: "whatsapp" });
  assert.equal(none.status, 404);
  assert.equal((await user().call("POST", "/api/login/code/send", { ident: "lea@example.com" })).status, 400);

  // Un compte créé avec un numéro et un mot de passe peut aussi se connecter par code ; le numéro devient confirmé.
  const koffi = user();
  assert.equal((await koffi.call("POST", "/api/signup", { account_type: "pro", contact_name: "Koffi", company: "Koffi BTP", country: "BJ", company_id: "", ident: "01 97 11 22 33", dial: "BJ", password: "chantier-2026" })).status, 201);
  const other = user();
  const sent = await other.call("POST", "/api/login/code/send", { ident: "+2290197112233" });
  assert.equal((await other.call("POST", "/api/login/code", { phone: sent.data.phone, code: sent.data.test_code })).status, 200);
  assert.equal((await other.call("GET", "/api/me")).data.phone_verified, true);
  assert.equal((await user().call("POST", "/api/login", { ident: "+2290197112233", password: "chantier-2026" })).status, 200, "le mot de passe marche toujours");
});

test("inscription avec un e-mail : code reçu par e-mail pour confirmer l'adresse", async () => {
  const { outbox } = require("../server/mail");
  const lea = user();
  const su = await lea.call("POST", "/api/signup", { account_type: "client", contact_name: "Léa", country: "FR", ident: "lea@example.com", password: "chantier-2026" });
  assert.equal(su.status, 201);
  assert.equal(su.data.confirm_email, true);
  assert.equal((await lea.call("GET", "/api/me")).data.email_pending, true);

  const sent = await lea.call("POST", "/api/email/send");
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sent.data.channel, "email");
  const mail = outbox.filter((m) => m.to === "lea@example.com").pop();
  assert.ok(mail.text.includes(sent.data.test_code), "le code est dans l'e-mail");
  assert.equal((await lea.call("POST", "/api/email/send")).status, 429, "45 secondes entre deux codes");

  assert.equal((await lea.call("POST", "/api/email/verify", { code: "12" })).status, 400);
  assert.equal((await lea.call("POST", "/api/email/verify", { code: sent.data.test_code })).status, 200);
  const me = (await lea.call("GET", "/api/me")).data;
  assert.equal(me.email_verified, true);
  assert.equal(me.email_pending, false);
  assert.equal((await user().call("POST", "/api/login", { ident: "lea@example.com", password: "chantier-2026" })).data.confirm_email, false);
});
