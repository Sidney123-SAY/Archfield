// Parcours complet de l'API sur une base temporaire : inscription, chantier, publication avec photo, lien client, validation, rapport, livraison.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "archfield-test-"));
const app = require("../server/server");

let server, base, cookie = "";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function call(method, url, body, { form, noCookie } = {}) {
  const headers = {};
  if (cookie && !noCookie) headers.Cookie = cookie;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { payload = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
  const res = await fetch(base + url, { method, headers, body: payload });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const type = res.headers.get("content-type") || "";
  return { status: res.status, data: type.includes("json") ? await res.json() : await res.text(), headers: res.headers };
}

test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

test("parcours artisan et client", async () => {
  assert.equal((await call("GET", "/api/me")).status, 401);

  const su = await call("POST", "/api/signup", { email: "Test@Example.com", password: "motdepasse", company: "Ndiaye BTP", contact_name: "Ousmane Ndiaye", city: "Thiès", market: "af" });
  assert.equal(su.status, 201);
  const me = (await call("GET", "/api/me")).data;
  assert.equal(me.email, "test@example.com");
  assert.equal(me.currency, "XOF");

  assert.equal((await call("POST", "/api/signup", { email: "test@example.com", password: "motdepasse", company: "X", contact_name: "Y" })).status, 409);

  const created = await call("POST", "/api/sites", {
    name: "Villa Diallo", location: "Thiès", kind: "ext", client_name: "Aminata Diallo", client_email: "a@example.com", budget: 18500000, start_now: true,
    steps: [{ name: "Terrassement", planned_days: 6 }, { name: "Fondations", planned_days: 14 }]
  });
  assert.equal(created.status, 201);
  const site = created.data;
  assert.equal(site.client_short, "Aminata");
  assert.equal(site.steps[0].status, "en_cours");
  assert.ok(site.client_token.length >= 20);

  assert.equal((await call("POST", "/api/sites", { name: "Vide", client_name: "Z", steps: [] })).status, 400);

  const form = new FormData();
  form.append("text", "Fouilles terminées.");
  form.append("step_id", String(site.steps[0].id));
  form.append("done", "1");
  form.append("photos", new Blob([PNG], { type: "image/png" }), "photo.png");
  const up = await call("POST", `/api/sites/${site.id}/updates`, undefined, { form });
  assert.equal(up.status, 201);
  assert.equal(up.data.photos, 1);

  const bad = new FormData();
  bad.append("text", "Mauvais fichier");
  bad.append("photos", new Blob(["<svg/>"], { type: "image/svg+xml" }), "x.svg");
  assert.equal((await call("POST", `/api/sites/${site.id}/updates`, undefined, { form: bad })).status, 400);

  const detail = (await call("GET", `/api/sites/${site.id}`)).data;
  assert.equal(detail.steps[0].status, "a_valider");
  const post = detail.updates.find((u) => u.kind === "post");
  assert.equal(post.seen_at, null);
  const media = await call("GET", post.photos[0].url);
  assert.equal(media.status, 200);

  // Le client ouvre son lien, sans cookie.
  const c = await call("GET", `/api/c/${site.client_token}`, undefined, { noCookie: true });
  assert.equal(c.status, 200);
  assert.equal(c.data.client_token, undefined);
  assert.equal(c.data.artisan.company, "Ndiaye BTP");
  assert.equal((await call("GET", "/api/c/inconnu", undefined, { noCookie: true })).status, 404);

  const seen = (await call("GET", `/api/sites/${site.id}`)).data.updates.find((u) => u.kind === "post");
  assert.ok(seen.seen_at, "la publication est marquée vue après la visite du client");

  const v = await call("POST", `/api/c/${site.client_token}/steps/${site.steps[0].id}/validate`, undefined, { noCookie: true });
  assert.equal(v.status, 200);
  const after = (await call("GET", `/api/sites/${site.id}`)).data;
  assert.equal(after.steps[0].status, "validee");
  assert.equal(after.steps[1].status, "en_cours", "l'étape suivante démarre après validation");
  assert.equal((await call("POST", `/api/c/${site.client_token}/steps/${site.steps[0].id}/validate`, undefined, { noCookie: true })).status, 409);

  const doc = await call("POST", `/api/sites/${site.id}/documents`, { kind: "facture", ref: "FA-1", label: "Acompte", amount: 5550000, status: "a_regler", doc_date: "2026-10-01" });
  assert.equal(doc.status, 201);
  assert.equal((await call("PATCH", `/api/documents/${doc.data.id}`, { status: "signe" })).status, 400);
  assert.equal((await call("PATCH", `/api/documents/${doc.data.id}`, { status: "payee" })).data.status, "payee");

  const rep = await call("POST", `/api/sites/${site.id}/report`);
  assert.equal(rep.status, 201);
  const reports = (await call("GET", `/api/c/${site.client_token}`, undefined, { noCookie: true })).data.reports;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].data.updates.length, 1);

  assert.equal((await call("POST", `/api/sites/${site.id}/deliver`)).status, 409);
  await call("PATCH", `/api/steps/${site.steps[1].id}`, { action: "finish" });
  await call("POST", `/api/c/${site.client_token}/steps/${site.steps[1].id}/validate`, undefined, { noCookie: true });
  assert.equal((await call("POST", `/api/sites/${site.id}/deliver`)).status, 200);

  const dash = (await call("GET", "/api/dashboard")).data;
  assert.equal(dash.reliability.delivered, 1);
  assert.equal(dash.kpis.active, 0);

  const csv = await call("GET", "/api/export.csv");
  assert.match(csv.headers.get("content-type"), /text\/csv/);

  // Un autre artisan ne voit pas ce chantier.
  const mine = cookie;
  cookie = "";
  await call("POST", "/api/signup", { email: "autre@example.com", password: "motdepasse", company: "Autre", contact_name: "Autre" });
  assert.equal((await call("GET", `/api/sites/${site.id}`)).status, 404);
  cookie = mine;

  assert.equal((await call("POST", "/api/logout")).status, 200);
  assert.equal((await call("GET", "/api/me")).status, 401);
  assert.equal((await call("POST", "/api/login", { email: "test@example.com", password: "faux" })).status, 401);
  assert.equal((await call("POST", "/api/login", { email: "test@example.com", password: "motdepasse" })).status, 200);
});

test("rapport hebdomadaire : un seul par chantier et par semaine", async () => {
  const { runWeekly } = require("../server/reports");
  await call("POST", "/api/sites", { name: "Cuisine", client_name: "Mme Benali", steps: [{ name: "Démolition", planned_days: 2 }] });
  const { run } = require("../server/db");
  run("UPDATE sites SET created_at = ?", new Date(Date.now() - 30 * 864e5).toISOString());
  const first = await runWeekly();
  assert.ok(first >= 1);
  assert.equal(await runWeekly(), 0);
});
