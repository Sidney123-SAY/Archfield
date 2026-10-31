// Espace client : numéro de suivi, chantier créé par le client, invitation d'un proche ou d'une entreprise, offres.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

Object.assign(process.env, { NODE_ENV: "test", DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "archfield-test-")) });
const app = require("../server/server");
const { run, get } = require("../server/db");

let server, base;
test.before(async () => { server = app.listen(0); await new Promise((r) => server.once("listening", r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

// Petit client HTTP avec son propre cookie de session.
function user() {
  let cookie = "";
  const call = async (method, url, body, form) => {
    const headers = cookie ? { Cookie: cookie } : {};
    let payload;
    if (form) payload = form; else if (body !== undefined) { payload = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.getSetCookie().find((c) => c.startsWith("af_session="));
    if (set) cookie = set.split(";")[0];
    return { status: res.status, data: res.headers.get("content-type")?.includes("json") ? await res.json() : null };
  };
  return { call };
}
const post = (u, text) => { const f = new FormData(); f.append("text", text); return u.call("POST", `/api/sites/${u.siteId}/updates`, undefined, f); };

test("le client suit, crée, confie à un proche puis à une entreprise", async () => {
  const awa = user();
  assert.equal((await awa.call("POST", "/api/signup", { account_type: "client", country: "FR", contact_name: "Awa Ndiaye", email: "awa@example.com", password: "chantier-2026" })).status, 201);
  const me = (await awa.call("GET", "/api/me")).data;
  assert.equal(me.account_type, "client");
  assert.equal(me.client.plan, "plus");
  assert.equal(me.client.status, "trial");
  assert.equal(me.client.prices.plus, "9,99 €");
  assert.equal((await awa.call("POST", "/api/sites", { name: "X", client_name: "Y", steps: [{ name: "A", planned_days: 1 }] })).status, 403);

  // Chantier géré par une entreprise : rattaché grâce au numéro de suivi.
  const pro = user();
  await pro.call("POST", "/api/signup", { country: "SN", company: "Sarr Construction", contact_name: "Moussa", email: "sarr@example.com", password: "chantier-2026" });
  const villa = (await pro.call("POST", "/api/sites", { name: "Villa", client_name: "Awa", steps: [{ name: "Murs", planned_days: 10 }], start_now: true })).data;
  const code = (await pro.call("GET", `/api/sites/${villa.id}`)).data.tracking_code;
  assert.match(code, /^ARC-\w{4}-\w{4}$/);
  assert.equal((await awa.call("POST", "/api/client/claim", { code: "ARC-AAAA-AAAA" })).status, 404);
  assert.equal((await awa.call("POST", "/api/client/claim", { code: code.toLowerCase().replace(/-/g, " ") })).status, 200);
  const other = user();
  await other.call("POST", "/api/signup", { account_type: "client", contact_name: "Autre", email: "autre@example.com", password: "chantier-2026" });
  assert.equal((await other.call("POST", "/api/client/claim", { code })).status, 409);
  assert.equal((await pro.call("GET", `/api/sites/${villa.id}`)).data.owner, "Awa Ndiaye");
  assert.equal((await pro.call("DELETE", `/api/sites/${villa.id}`)).status, 409, "l'entreprise ne supprime pas le chantier du client");

  // Chantier créé par le client puis confié à son frère.
  const maison = (await awa.call("POST", "/api/client/sites", { name: "Maison familiale", location: "Thiès", steps: [{ name: "Fondations", planned_days: 12 }] })).data;
  let list = (await awa.call("GET", "/api/client/sites")).data;
  assert.equal(list.sites.length, 2);
  assert.ok(list.sites.find((s) => s.id === maison.id).self_managed);
  const inv = (await awa.call("POST", `/api/client/sites/${maison.id}/invite`, { kind: "proche", name: "Ousmane" })).data;
  assert.match(inv.code, /^INV-/);
  const pub = await user().call("GET", "/api/invitations/" + inv.code);
  assert.equal(pub.data.owner, "Awa Ndiaye");
  assert.equal(pub.data.kind, "proche");

  const ousmane = user();
  assert.equal((await ousmane.call("POST", "/api/signup", { account_type: "proche", contact_name: "Ousmane", email: "ousmane@example.com", password: "chantier-2026" })).status, 400, "pas de compte proche sans invitation");
  assert.equal((await ousmane.call("POST", "/api/signup", { invite_code: inv.code, contact_name: "Ousmane Ndiaye", email: "ousmane@example.com", password: "chantier-2026" })).status, 201);
  const om = (await ousmane.call("GET", "/api/me")).data;
  assert.equal(om.account_type, "proche");
  assert.deepEqual(om.sponsors, ["Awa Ndiaye"]);
  assert.equal((await ousmane.call("GET", "/api/sites")).data[0].id, maison.id);
  ousmane.siteId = maison.id;
  assert.equal((await post(ousmane, "Fouilles terminées.")).status, 201);
  assert.equal((await ousmane.call("POST", "/api/sites", { name: "X", client_name: "Y", steps: [{ name: "A", planned_days: 1 }] })).status, 403);
  assert.equal((await ousmane.call("DELETE", `/api/sites/${maison.id}`)).status, 409);
  assert.equal((await user().call("GET", "/api/invitations/" + inv.code)).status, 410, "invitation déjà utilisée");

  list = (await awa.call("GET", "/api/client/sites")).data;
  const m = list.sites.find((s) => s.id === maison.id);
  assert.equal(m.manager.type, "proche");
  assert.equal(m.unseen, 1);
  assert.equal(list.plan.used, 1);

  // Sans offre Plus (essai fini, rien payé) : pas de nouveau proche, le proche ne publie plus ; le client garde l'accès.
  const awaId = get("SELECT id FROM artisans WHERE email = 'awa@example.com'").id;
  run("UPDATE artisans SET paid_until = NULL, trial_ends_at = ? WHERE id = ?", new Date(Date.now() - 864e5).toISOString(), awaId);
  const ext = (await awa.call("POST", "/api/client/sites", { name: "Extension", steps: [{ name: "Murs", planned_days: 8 }] })).data;
  assert.equal((await awa.call("POST", `/api/client/sites/${ext.id}/invite`, { kind: "proche" })).status, 402);
  assert.equal((await post(ousmane, "Après l'offre.")).status, 402);
  assert.equal((await awa.call("GET", "/api/client/sites")).data.plan.plan, "free");

  // Confier l'extension à une entreprise : gratuit pour le client.
  const invPro = (await awa.call("POST", `/api/client/sites/${ext.id}/invite`, { kind: "pro" })).data;
  assert.equal((await ousmane.call("POST", `/api/invitations/${invPro.code}/accept`)).status, 409, "un proche n'accepte pas une invitation entreprise");
  assert.equal((await pro.call("POST", `/api/invitations/${invPro.code}/accept`)).status, 200);
  assert.ok((await pro.call("GET", "/api/sites")).data.some((s) => s.id === ext.id));
  assert.equal((await pro.call("POST", `/api/sites/${ext.id}/release`)).status, 200);
  assert.ok((await awa.call("GET", "/api/client/sites")).data.sites.find((s) => s.id === ext.id).self_managed);

  // Reprendre la main sur la maison : le proche perd l'accès.
  assert.equal((await awa.call("POST", `/api/client/sites/${maison.id}/take-back`)).status, 200);
  assert.equal((await ousmane.call("GET", `/api/sites/${maison.id}`)).status, 404);
});
