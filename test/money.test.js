// Argent du chantier, photos vérifiées, fichiers déguisés, visites de contrôle et sécurité des comptes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

Object.assign(process.env, { NODE_ENV: "test", DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "archfield-money-")), CONTACT_EMAIL: "equipe@example.com" });
const app = require("../server/server");
const { run, get } = require("../server/db");
const { outbox } = require("../server/mail");
const { verify } = require("../server/verify");

let server, base;
test.before(async () => { server = app.listen(0); await new Promise((r) => server.once("listening", r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

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
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);
const form = (fields, files = []) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const [name, buf, type, field] of files) f.append(field || "photos", new Blob([buf], { type }), name);
  return f;
};
const hoursAgo = (h) => new Date(Date.now() - h * 36e5).toISOString();

test("vérification : photo récente sur place, photo ancienne, photo prise loin", () => {
  const site = { lat: 14.4472, lng: -17.0089, position_confirmed_at: hoursAgo(48) };
  assert.equal(verify({ site, pos: { lat: 14.4475, lng: -17.0091, accuracy: 15 }, photos: [{ shot_at: hoursAgo(1) }] }).status, "verified");
  const unconfirmed = { lat: 14.4472, lng: -17.0089 };
  assert.equal(verify({ site: unconfirmed, pos: { lat: 14.4475, lng: -17.0091, accuracy: 15 }, photos: [{ shot_at: hoursAgo(1) }] }).status, "coherent", "position pas confirmée par le client");
  assert.equal(verify({ site: {}, pos: { lat: 14.4, lng: -17, accuracy: 10 }, photos: [{ shot_at: hoursAgo(1) }] }).status, "coherent", "la publication qui fixe la position n'est pas vérifiée");
  assert.equal(verify({ site, pos: { lat: 14.4475, lng: -17.0091, accuracy: 15 }, photos: [{ shot_at: hoursAgo(24 * 10) }] }).status, "warning");
  assert.equal(verify({ site, pos: { lat: 14.7167, lng: -17.4677, accuracy: 15 }, photos: [] }).note.position, "far");
  assert.equal(verify({ site, pos: null, photos: [{ shot_at: hoursAgo(1) }] }).status, "partial");
  assert.equal(verify({ site: {}, pos: { lat: 14.4, lng: -17, accuracy: 10 }, photos: [] }).setOrigin, true);
});

test("argent, preuves et visites : du chantier confié à un proche jusqu'au lien privé", async () => {
  const awa = user(), paul = user(), intrus = user();
  assert.equal((await awa.call("POST", "/api/signup", { account_type: "client", country: "FR", contact_name: "Awa", email: "awa@ex.com", password: "123456789" })).status, 400, "mot de passe trop courant");
  assert.equal((await awa.call("POST", "/api/signup", { account_type: "client", country: "FR", contact_name: "Awa", email: "awa@ex.com", password: "trois-mots-ici" })).status, 201);
  const site = (await awa.call("POST", "/api/client/sites", { name: "Maison", location: "Thiès", currency: "XOF", steps: [{ name: "Fondations", planned_days: 10 }, { name: "Murs", planned_days: 10 }] })).data;
  assert.equal(get("SELECT currency FROM sites WHERE id = ?", site.id).currency, "XOF", "monnaie propre au chantier");
  const inv = (await awa.call("POST", `/api/client/sites/${site.id}/invite`, { kind: "proche", name: "Paul" })).data;
  assert.equal((await paul.call("POST", "/api/signup", { contact_name: "Paul", email: "paul@ex.com", password: "trois-mots-ici", invite_code: inv.code })).status, 201);

  // La première publication fixe la position : « cohérente » seulement ; une photo prise loin est signalée.
  const steps = (await paul.call("GET", `/api/sites/${site.id}`)).data.steps;
  let r = await paul.call("POST", `/api/sites/${site.id}/updates`, undefined, form({ text: "Fouilles faites.", step_id: steps[0].id, lat: "14.7910", lng: "-16.9359", accuracy: "12", meta: JSON.stringify([{ shot_at: hoursAgo(0.2) }]) }, [["a.jpg", JPEG, "image/jpeg"]]));
  assert.equal(r.status, 201); assert.equal(r.data.verify, "coherent"); assert.equal(r.data.note.position, "origin");
  r = await paul.call("POST", `/api/sites/${site.id}/updates`, undefined, form({ text: "Photo d'ailleurs.", lat: "14.7167", lng: "-17.4677", accuracy: "12", meta: JSON.stringify([{ shot_at: hoursAgo(300) }]) }, [["b.jpg", JPEG, "image/jpeg"]]));
  assert.equal(r.data.verify, "warning");
  // Awa confirme la position (le proche ne le peut pas) : la publication suivante faite sur place est « vérifiée ».
  assert.equal((await paul.call("POST", `/api/client/sites/${site.id}/position/confirm`)).status, 403);
  const awaPos = (await awa.call("GET", "/api/client/sites")).data.sites.find((x) => x.id === site.id).position;
  assert.equal(awaPos.lat, 14.791, "le propriétaire voit la position pour la reconnaître sur la carte");
  assert.equal(awaPos.confirmed_at, null);
  assert.equal((await awa.call("POST", `/api/client/sites/${site.id}/position/confirm`)).status, 200);
  assert.equal(get("SELECT verify FROM updates WHERE text = 'Fouilles faites.'").verify, "verified", "la publication qui a fixé la position devient vérifiée");
  assert.equal(get("SELECT verify FROM updates WHERE text = 'Photo d''ailleurs.'").verify, "warning", "une photo suspecte le reste");
  r = await paul.call("POST", `/api/sites/${site.id}/updates`, undefined, form({ text: "Semelles coulées.", lat: "14.7911", lng: "-16.9360", accuracy: "10", meta: JSON.stringify([{ shot_at: hoursAgo(0.1) }]) }, [["c.jpg", JPEG, "image/jpeg"]]));
  assert.equal(r.data.verify, "verified");
  // Un fichier qui n'est pas une image, même annoncé comme JPEG, est refusé.
  r = await paul.call("POST", `/api/sites/${site.id}/updates`, undefined, form({ text: "Piège." }, [["piege.jpg", Buffer.from("<script>alert(1)</script>"), "image/jpeg"]]));
  assert.equal(r.status, 400);
  const count = () => fs.readdirSync(path.join(process.env.DATA_DIR, "uploads")).length;
  for (let i = 0; i < 20 && count() > 3; i++) await new Promise((ok) => setTimeout(ok, 50)); // effacement en arrière-plan
  assert.equal(count(), 3, "le fichier refusé est effacé");

  // Échéancier, dépenses avec reçu (gestionnaire), versements (propriétaire).
  assert.equal((await paul.call("PATCH", `/api/steps/${steps[0].id}/amount`, { amount: 2500000 })).status, 200);
  assert.equal((await awa.call("POST", `/api/sites/${site.id}/ledger`, undefined, form({ kind: "depense", amount: "1000", label: "X" }))).status, 403, "le propriétaire ne note pas les dépenses");
  const dep = (await paul.call("POST", `/api/sites/${site.id}/ledger`, undefined, form({ kind: "depense", amount: "800000", label: "Ciment", category: "materiaux", entry_date: "2026-10-01" }, [["recu.jpg", JPEG, "image/jpeg", "receipt"]]))).data;
  assert.ok(dep.id);
  assert.equal((await awa.call("POST", `/api/sites/${site.id}/ledger`, undefined, form({ kind: "versement", amount: "3000000", category: "wave" }))).status, 201);
  assert.equal((await intrus.call("POST", "/api/signup", { account_type: "client", contact_name: "X", email: "x@ex.com", password: "trois-mots-ici" })).status, 201);
  assert.equal((await intrus.call("POST", `/api/sites/${site.id}/ledger`, undefined, form({ kind: "versement", amount: "1" }))).status, 404, "un inconnu n'écrit rien");

  // Annulation : seulement par l'auteur, et la ligne reste visible.
  assert.equal((await awa.call("POST", `/api/ledger/${dep.id}/cancel`, {})).status, 403);
  assert.equal((await paul.call("POST", `/api/ledger/${dep.id}/cancel`, { reason: "Erreur de montant" })).status, 200);
  const list = (await awa.call("GET", "/api/client/sites")).data.sites.find((s) => s.id === site.id);
  const m = list.money;
  assert.equal(m.paid, 3000000); assert.equal(m.spent, 0, "la dépense annulée ne compte plus");
  assert.equal(m.entries.find((e) => e.id === dep.id).cancel_reason, "Erreur de montant");
  assert.equal(m.schedule[0].amount, 2500000);
  assert.equal(m.budget, 0);

  // Le reçu se voit par le gestionnaire, le propriétaire et le lien privé, pas par un inconnu.
  const receipt = get("SELECT receipt_file FROM ledger WHERE id = ?", dep.id).receipt_file;
  const token = get("SELECT client_token FROM sites WHERE id = ?", site.id).client_token;
  assert.equal((await fetch(`${base}/c/${token}/media/${receipt}`)).status, 200);
  assert.equal((await fetch(`${base}/media/${receipt}`)).status, 404);
  const link = (await fetch(`${base}/api/c/${token}`).then((x) => x.json()));
  assert.equal(link.money.paid, 3000000);
  assert.equal(link.money.entries[0].created_by, undefined, "pas d'identifiant interne sur le lien privé");
  assert.equal(link.lat, undefined, "pas de coordonnées exactes sur le lien privé");
  assert.ok(link.position.set_by);
  assert.ok(link.position.confirmed_at);
  assert.equal(link.position.lat, undefined, "le lien seul ne montre pas la position d'un chantier qui a un propriétaire");
  assert.equal((await fetch(`${base}/api/c/${token}/position/confirm`, { method: "POST" })).status, 403);
  assert.equal(link.updates.find((u) => u.text === "Photo d'ailleurs.").verify, "warning");

  // Alerte : versé bien plus que l'avancement.
  run("UPDATE sites SET budget = 4000000 WHERE id = ?", site.id);
  assert.equal((await awa.call("GET", "/api/client/sites")).data.sites.find((s) => s.id === site.id).money.alert, true);

  // Sans offre Plus, plus de versement noté par le propriétaire.
  run("UPDATE artisans SET trial_ends_at = ?, paid_until = NULL WHERE email = 'awa@ex.com'", hoursAgo(1));
  assert.equal((await awa.call("POST", `/api/sites/${site.id}/ledger`, undefined, form({ kind: "versement", amount: "1" }))).status, 402);

  // Position : seul le propriétaire l'efface quand le chantier lui appartient.
  assert.equal((await paul.call("POST", `/api/sites/${site.id}/position/reset`)).status, 403);
  assert.equal((await awa.call("POST", `/api/client/sites/${site.id}/position/reset`)).status, 200);
  assert.equal(get("SELECT lat FROM sites WHERE id = ?", site.id).lat, null);

  // Visite de contrôle : enregistrée et signalée à l'équipe.
  assert.equal((await awa.call("POST", `/api/client/sites/${site.id}/visits`, { wished_date: "2026-11-20", phone: "+33612345678", note: "Les murs sont-ils montés ?" })).status, 201);
  assert.ok(outbox.some((mail) => mail.to === "equipe@example.com" && /Visite de contrôle/.test(mail.subject)));
  assert.equal((await awa.call("GET", "/api/client/sites")).data.sites.find((s) => s.id === site.id).visits.length, 1);
});

test("sécurité des comptes : se déconnecter de ses autres appareils", async () => {
  const phone = user(), laptop = user();
  assert.equal((await phone.call("POST", "/api/signup", { account_type: "client", contact_name: "Léa", email: "lea@ex.com", password: "trois-mots-ici" })).status, 201);
  assert.equal((await laptop.call("POST", "/api/login", { email: "lea@ex.com", password: "trois-mots-ici" })).status, 200);
  assert.equal((await phone.call("POST", "/api/me/logout-others")).data.closed, 1);
  assert.equal((await laptop.call("GET", "/api/me")).status, 401);
  assert.equal((await phone.call("GET", "/api/me")).status, 200);
  const h = (await fetch(base + "/")).headers;
  assert.match(h.get("permissions-policy"), /geolocation=\(self\)/);
});
