// Idées reprises de SuiviBat : téléphone et code, équipe et droits, rapport du jour (vocaux, livraisons), problèmes,
// dépenses à approuver, tableau du dirigeant, rapport PDF. Et : paiement (simulé et Stripe), administration.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

Object.assign(process.env, { NODE_ENV: "test", DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "archfield-equipe-")), SHOW_TEST_CODES: "on", STRIPE_WEBHOOK_SECRET: "whsec_test" });
const app = require("../server/server");
const { run, get } = require("../server/db");
const phoneLib = require("../server/phone");
const { verifySignature } = require("../server/billing");

let server, base;
test.before(async () => { server = app.listen(0); await new Promise((r) => server.once("listening", r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

function user() {
  let cookie = "";
  const call = async (method, url, body, form, raw) => {
    const headers = cookie ? { Cookie: cookie } : {};
    let payload;
    if (form) payload = form; else if (body !== undefined) { payload = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.getSetCookie().find((c) => c.startsWith("af_session="));
    if (set) cookie = set.split(";")[0];
    if (raw) return res;
    return { status: res.status, data: res.headers.get("content-type")?.includes("json") ? await res.json() : null, setCookie: set };
  };
  return { call };
}
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(300, 2)]);
const form = (fields, files = []) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, typeof v === "object" ? JSON.stringify(v) : v);
  for (const [name, buf, type, field] of files) f.append(field || "photos", new Blob([buf], { type }), name);
  return f;
};

test("numéros de téléphone : format international selon le pays", () => {
  assert.equal(phoneLib.normalize("01 97 00 00 00", "BJ"), "+2290197000000", "au Bénin, le 0 fait partie du numéro");
  assert.equal(phoneLib.normalize("06 12 34 56 78", "FR"), "+33612345678", "en France, le 0 disparaît");
  assert.equal(phoneLib.normalize("77 123 45 67", "SN"), "+221771234567");
  assert.equal(phoneLib.normalize("+229 01 97 00 00 00"), "+2290197000000");
  assert.equal(phoneLib.normalize("00 33 6 12 34 56 78"), "+33612345678");
  assert.equal(phoneLib.normalize("123", "BJ"), null);
  assert.equal(phoneLib.pretty("+2290197000000"), "+229 01 97 00 00 00");
});

test("inscription par téléphone, code par WhatsApp ou SMS, connexion, mot de passe oublié", async () => {
  const kofi = user();
  const r = await kofi.call("POST", "/api/signup", { account_type: "pro", contact_name: "Koffi Dossou", company: "Entreprise Démo BTP", country: "BJ", company_id: "", ident: "01 97 00 00 01", dial: "BJ", password: "chantier-2026" });
  assert.equal(r.status, 201);
  assert.equal(r.data.confirm_phone, true);
  let me = (await kofi.call("GET", "/api/me")).data;
  assert.equal(me.phone, "+2290197000001"); assert.equal(me.phone_verified, false); assert.equal(me.email, null);
  const sent = await kofi.call("POST", "/api/phone/send", { channel: "whatsapp" });
  assert.equal(sent.status, 200); assert.equal(sent.data.channel, "whatsapp"); assert.match(sent.data.test_code, /^\d{6}$/);
  assert.equal((await kofi.call("POST", "/api/phone/send", { channel: "sms" })).status, 429, "45 secondes entre deux codes");
  const wrong = sent.data.test_code === "000000" ? "111111" : "000000";
  assert.equal((await kofi.call("POST", "/api/phone/verify", { code: wrong })).status, 400);
  assert.equal((await kofi.call("POST", "/api/phone/verify", { code: sent.data.test_code })).status, 200);
  me = (await kofi.call("GET", "/api/me")).data;
  assert.equal(me.phone_verified, true);
  // Même numéro : refusé ; connexion avec le numéro tapé à la béninoise, ou au format international.
  assert.equal((await user().call("POST", "/api/signup", { account_type: "client", contact_name: "X", ident: "+229 01 97 00 00 01", password: "chantier-2026" })).status, 409);
  const again = user();
  const login = await again.call("POST", "/api/login", { ident: "0197000001", dial: "BJ", password: "chantier-2026", remember: false });
  assert.equal(login.status, 200);
  assert.ok(!/Max-Age/.test(login.setCookie), "« Rester connecté » décoché : cookie de session");
  assert.equal((await user().call("POST", "/api/login", { ident: "+2290197000001", password: "faux-mot-de-passe" })).status, 401);
  // Mot de passe oublié par code.
  const fg = await user().call("POST", "/api/password/forgot", { ident: "01 97 00 00 01", dial: "BJ", channel: "sms" });
  assert.equal(fg.data.method, "code");
  const rs = user();
  assert.equal((await rs.call("POST", "/api/password/reset-code", { phone: fg.data.phone, code: fg.data.test_code, password: "nouveau-mot-2026" })).status, 200);
  assert.equal((await rs.call("GET", "/api/me")).data.contact_name, "Koffi Dossou");
});

test("équipe, rapport du jour, problème, dépense à approuver, tableau du dirigeant, PDF", async () => {
  const boss = user(), chef = user(), equipe = user(), client = user();
  await boss.call("POST", "/api/signup", { account_type: "pro", contact_name: "Ama Boss", company: "BTP Cotonou", country: "BJ", company_id: "", email: "boss@example.com", password: "chantier-2026" });
  const site = (await boss.call("POST", "/api/sites", { name: "Villa R+1", location: "Abomey-Calavi", kind: "ext", client_name: "Awa Client", budget: 27900000, steps: [{ name: "Fondations", planned_days: 10 }, { name: "Murs", planned_days: 20 }], start_now: true })).data;
  // Chef de chantier : invitation par numéro (pas encore de compte) → lien EQP-… ; chef d'équipe : droits réduits.
  const inv = await boss.call("POST", `/api/sites/${site.id}/team`, { name: "Adjovi", contact: "01 97 00 00 02", country: "BJ", role: "chef_chantier" });
  assert.equal(inv.status, 201); assert.match(inv.data.code, /^EQP-/);
  const pub = await (await fetch(`${base}/api/invitations/${inv.data.code}`)).json();
  assert.equal(pub.kind, "membre"); assert.equal(pub.site, "Villa R+1"); assert.equal(pub.owner, "BTP Cotonou");
  assert.equal((await chef.call("POST", "/api/signup", { contact_name: "Adjovi", ident: "+2290197000002", password: "chantier-2026", invite_code: inv.data.code })).status, 201);
  assert.equal((await chef.call("GET", "/api/me")).data.account_type, "membre");
  await equipe.call("POST", "/api/signup", { account_type: "pro", contact_name: "Pascal", company: "Pascal Maçonnerie", country: "BJ", company_id: "", email: "pascal@example.com", password: "chantier-2026" });
  const added = await boss.call("POST", `/api/sites/${site.id}/team`, { name: "Pascal", contact: "pascal@example.com", role: "chef_equipe", perms: { photos: true, probleme: true, vocal: true, rapport: false, depenses: false, budget: false } });
  assert.equal(added.data.added, true, "compte existant : ajouté directement");
  const t = (await boss.call("GET", `/api/sites/${site.id}/team`)).data;
  assert.equal(t.members.length, 2);
  assert.equal(t.members.find((m) => m.contact_name === "Adjovi").role, "chef_chantier");

  // Accueil « sur le chantier » : seulement ce qui est autorisé.
  const home = (await chef.call("GET", "/api/terrain")).data;
  assert.equal(home.sites[0].perms.rapport, true); assert.equal(home.sites[0].perms.budget, false);
  assert.equal(home.sites[0].budget, undefined, "le budget est un droit");
  assert.equal(home.sites[0].report_today, null);

  // Rapport du jour : texte, vocal, ouvriers, livraisons, météo, photo.
  const rep = await chef.call("POST", `/api/sites/${site.id}/updates`, undefined, form({ topic: "rapport", text: "Coulage de la semelle côté nord.", workers: "12", weather: "soleil", deliveries: [{ label: "sacs de ciment", quantity: "50" }], durations: [42] }, [["photo.jpg", JPEG, "image/jpeg"], ["vocal.webm", WEBM, "audio/webm;codecs=opus", "audios"]]));
  assert.equal(rep.status, 201, JSON.stringify(rep.data)); assert.equal(rep.data.audios, 1); assert.equal(rep.data.visibility, "all");
  assert.equal((await chef.call("GET", "/api/terrain")).data.sites[0].last_workers, 12);
  // Le chef d'équipe n'a pas le droit au rapport ni aux dépenses ; il signale un problème (interne à l'équipe).
  assert.equal((await equipe.call("POST", `/api/sites/${site.id}/updates`, undefined, form({ topic: "rapport", text: "x" }))).status, 403);
  assert.equal((await equipe.call("POST", `/api/sites/${site.id}/ledger`, undefined, form({ kind: "depense", amount: "1000", label: "x" }))).status, 403);
  const pb = await equipe.call("POST", `/api/sites/${site.id}/updates`, undefined, form({ topic: "probleme", category: "panne", text: "La bétonnière est en panne." }));
  assert.equal(pb.data.visibility, "team");
  const fake = await equipe.call("POST", `/api/sites/${site.id}/updates`, undefined, form({ text: "vocal" }, [["v.webm", Buffer.from("<html>pas un son</html>"), "audio/webm", "audios"]]));
  assert.equal(fake.status, 400, "un faux fichier son est refusé");

  // Dépense du chef de chantier : en attente, ne compte pas avant approbation.
  const dep = await chef.call("POST", `/api/sites/${site.id}/ledger`, undefined, form({ kind: "depense", amount: "385000", label: "Ciment, 50 sacs", category: "materiaux" }, [["recu.jpg", JPEG, "image/jpeg", "receipt"]]));
  assert.equal(dep.data.status, "en_attente");
  let detail = (await boss.call("GET", `/api/sites/${site.id}`)).data;
  assert.equal(detail.money.spent, 0); assert.equal(detail.money.pending, 385000);
  assert.equal(detail.deliveries[0].label, "sacs de ciment");
  assert.ok(detail.updates.find((u) => u.topic === "probleme"), "le dirigeant voit le problème");

  // Tableau du dirigeant.
  let d = (await boss.call("GET", "/api/boss")).data;
  assert.equal(d.kpis.active, 1); assert.equal(d.kpis.reports, 1); assert.equal(d.kpis.expenses, 1); assert.equal(d.kpis.expenses_total.XOF, 385000);
  assert.ok(d.todo.find((x) => x.kind === "reports")); assert.ok(d.todo.find((x) => x.kind === "expenses")); assert.ok(d.todo.find((x) => x.kind === "problem"));
  assert.equal(d.sites[0].chef.name, "Adjovi");
  assert.ok(d.activity.length >= 3);

  // Le client (lien privé) voit le rapport, pas le problème interne ; ses médias suivent la même règle.
  const c = await (await fetch(`${base}/api/c/${detail.client_token}`)).json();
  assert.ok(c.updates.find((u) => u.topic === "rapport" && u.audios.length === 1 && u.deliveries.length === 1));
  assert.ok(!c.updates.find((u) => u.topic === "probleme"));
  const audioUrl = c.updates.find((u) => u.topic === "rapport").audios[0].url;
  assert.equal((await fetch(base + audioUrl)).status, 200);
  assert.equal((await chef.call("GET", "/api/sites/" + site.id)).status, 404, "le membre n'a pas la fiche complète du gestionnaire");
  // Le membre voit les médias de son chantier ; un inconnu non.
  const mediaFile = audioUrl.split("/").pop();
  assert.equal((await chef.call("GET", "/media/" + mediaFile, undefined, undefined, true)).status, 200);
  assert.equal((await client.call("GET", "/media/" + mediaFile, undefined, undefined, true)).status, 404);

  // Le dirigeant vérifie, approuve, partage le problème avec le client, le marque résolu.
  const reportId = detail.updates.find((u) => u.topic === "rapport").id, problemId = detail.updates.find((u) => u.topic === "probleme").id;
  assert.equal((await boss.call("POST", `/api/updates/${reportId}/check`)).status, 200);
  assert.equal((await boss.call("POST", `/api/ledger/${dep.data.id}/review`, { decision: "approve" })).status, 200);
  assert.equal((await boss.call("POST", `/api/ledger/${dep.data.id}/review`, { decision: "refuse" })).status, 409);
  assert.equal((await boss.call("POST", `/api/updates/${problemId}/share`, { share: true })).status, 200);
  assert.equal((await boss.call("POST", `/api/updates/${problemId}/resolve`)).status, 200);
  detail = (await boss.call("GET", `/api/sites/${site.id}`)).data;
  assert.equal(detail.money.spent, 385000);
  d = (await boss.call("GET", "/api/boss")).data;
  assert.equal(d.kpis.reports, 0); assert.equal(d.kpis.expenses, 0);
  assert.ok((await (await fetch(`${base}/api/c/${detail.client_token}`)).json()).updates.find((u) => u.topic === "probleme"), "problème partagé : visible du client");

  // Rapport PDF de la semaine (gestionnaire et lien du client) ; refusé au chef d'équipe sans le droit « budget ».
  const pdf = await boss.call("GET", `/api/sites/${site.id}/rapport.pdf`, undefined, undefined, true);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  assert.equal((await fetch(`${base}/api/c/${detail.client_token}/rapport.pdf`)).status, 200);
  assert.equal((await equipe.call("GET", `/api/sites/${site.id}/rapport.pdf`)).status, 404);

  // Retirer un membre : il perd l'accès.
  const pascal = (await boss.call("GET", `/api/sites/${site.id}/team`)).data.members.find((m) => m.contact_name === "Pascal");
  assert.equal((await boss.call("DELETE", `/api/team/${pascal.id}`)).status, 200);
  assert.equal((await equipe.call("POST", `/api/sites/${site.id}/updates`, undefined, form({ text: "encore là ?" }, [["p.jpg", JPEG, "image/jpeg"]]))).status, 404);
});

test("offres : limites, paiement simulé, signature Stripe, activation par l'administration", async () => {
  const pro = user();
  await pro.call("POST", "/api/signup", { account_type: "pro", contact_name: "Moussa", company: "Moussa BTP", country: "SN", company_id: "", email: "moussa@example.com", password: "chantier-2026" });
  let b = (await pro.call("GET", "/api/billing")).data;
  assert.equal(b.region, "world"); assert.equal(b.mode, "test");
  assert.deepEqual(b.offers.map((o) => [o.plan, o.currency]), [["demarrage", "usd"], ["pme", "usd"], ["pro", "usd"]], "Afrique : en dollars");
  assert.ok(b.offers[0].fcfa > 0, "indication en FCFA");
  const fr = user();
  await fr.call("POST", "/api/signup", { account_type: "client", contact_name: "Léa", country: "FR", email: "lea@example.com", password: "chantier-2026" });
  const fb = (await fr.call("GET", "/api/billing")).data;
  assert.equal(fb.offers[0].currency, "eur"); assert.equal(fb.offers[0].tax, "inclusive", "Europe : euros TTC");

  // Fin d'essai sans abonnement : un seul chantier à soi.
  run("UPDATE artisans SET trial_ends_at = ? WHERE email = ?", new Date(Date.now() - 1000).toISOString(), "moussa@example.com");
  const mk = (n) => pro.call("POST", "/api/sites", { name: "Chantier " + n, client_name: "C" + n, steps: [{ name: "A", planned_days: 2 }] });
  assert.equal((await mk(1)).status, 201);
  assert.equal((await mk(2)).status, 402);
  assert.equal((await pro.call("POST", "/api/sites/1/team", { name: "X", contact: "x@example.com", role: "chef_equipe" })).status, 404);

  // Paiement simulé : session, page de test, confirmation → offre PME active 30 jours.
  const co = (await pro.call("POST", "/api/billing/checkout", { plan: "pme" })).data;
  assert.match(co.url, /^\/paiement-test\?session=/);
  const sid = co.url.split("=")[1];
  const info = await (await fetch(`${base}/api/billing/test-session/${sid}`)).json();
  assert.equal(info.currency, "usd"); assert.equal(info.amount, 4500);
  assert.equal((await pro.call("POST", "/api/billing/test-complete", { session: sid })).status, 200);
  const me = (await pro.call("GET", "/api/me")).data;
  assert.equal(me.access.status, "paid"); assert.equal(me.access.plan, "pme");
  assert.equal((await mk(2)).status, 201, "PME : 10 chantiers");
  assert.equal((await pro.call("POST", "/api/billing/checkout", { plan: "plus" })).status, 400, "offre client refusée à une entreprise");

  // Webhook Stripe : signature vérifiée, événement traité une fois.
  const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.deleted", data: { object: { metadata: { artisan_id: String(me.id) }, customer: "cus_1" } } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", "whsec_test").update(`${ts}.${payload}`).digest("hex");
  assert.equal(verifySignature(payload, `t=${ts},v1=${sig}`, "whsec_test"), true);
  assert.equal(verifySignature(payload, `t=${ts},v1=${sig.replace(/^./, "0")}`, "whsec_test"), sig.startsWith("0") ? true : false);
  assert.equal((await fetch(`${base}/api/stripe/webhook`, { method: "POST", headers: { "Stripe-Signature": `t=${ts},v1=bad`, "Content-Type": "application/json" }, body: payload })).status, 400);
  const ok = await fetch(`${base}/api/stripe/webhook`, { method: "POST", headers: { "Stripe-Signature": `t=${ts},v1=${sig}`, "Content-Type": "application/json" }, body: payload });
  assert.equal(ok.status, 200);
  assert.equal(get("SELECT sub_status FROM artisans WHERE id = ?", me.id).sub_status, "canceled");
  assert.equal((await (await fetch(`${base}/api/stripe/webhook`, { method: "POST", headers: { "Stripe-Signature": `t=${ts},v1=${sig}`, "Content-Type": "application/json" }, body: payload })).json()).result, "déjà traité");

  // Administration : réservée aux administrateurs ; offre activée à la main (paiement par Wave, par exemple).
  assert.equal((await pro.call("GET", "/api/admin/overview")).status, 404);
  run("UPDATE artisans SET is_admin = 1 WHERE email = ?", "lea@example.com");
  const ov = (await fr.call("GET", "/api/admin/overview?q=moussa")).data;
  assert.equal(ov.accounts.length, 1);
  assert.equal((await fr.call("POST", `/api/admin/accounts/${ov.accounts[0].id}/grant`, { plan: "pro", months: 3 })).status, 200);
  assert.equal((await pro.call("GET", "/api/me")).data.access.plan, "pro");
  // Image de la page d'accueil remplacée, puis servie à la place de l'originale.
  const up = await fr.call("POST", "/api/admin/images/chantier-1", undefined, form({ caption: "Villa à Calavi, élévation des murs" }, [["c.jpg", JPEG, "image/jpeg", "image"]]));
  assert.equal(up.status, 201);
  const gal = await (await fetch(`${base}/api/site-images`)).json();
  assert.equal(gal[0].caption, "Villa à Calavi, élévation des murs");
  const img = await fetch(base + gal[0].url);
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  assert.equal((await fetch(`${base}/img/chantier-2`)).status, 404);
  assert.equal((await fr.call("POST", "/api/admin/images/chantier-2", undefined, form({}, [["x.svg", Buffer.from("<svg onload=alert(1)>"), "image/svg+xml", "image"]]))).status, 400);
});
