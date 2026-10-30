// Espace client : le propriétaire retrouve tous ses chantiers (numéro de suivi), crée les siens et les confie
// à une entreprise ou à un proche par invitation. Suivre est gratuit ; confier à un proche demande Basic ou Premium.
const { all, get, run, tx, readableCode, newTrackingCode } = require("./db");
const { siteWithSummary, DAY } = require("./analytics");

const CLIENT_PLANS = {
  free: { slots: 0 },
  basic: { slots: 1, eu: "4,99 €", af: "2 500 FCFA" },
  premium: { slots: 5, eu: "9,99 €", af: "5 000 FCFA" }
};
const CLIENT_TRIAL_DAYS = 61;

// Offre en vigueur : payée, sinon essai Premium de 2 mois, sinon gratuite.
function clientPlan(a, now = Date.now()) {
  if (a.paid_until && Date.parse(a.paid_until) > now && CLIENT_PLANS[a.plan]) return { plan: a.plan, status: "paid", until: a.paid_until };
  if (Date.parse(a.trial_ends_at) > now) return { plan: "premium", status: "trial", until: a.trial_ends_at, days_left: Math.ceil((Date.parse(a.trial_ends_at) - now) / DAY) };
  return { plan: "free", status: "free", until: null };
}
// Proches qui gèrent un chantier du client (comptés une fois chacun).
const prochesOf = (ownerId) => all(
  `SELECT DISTINCT a.id, a.contact_name, a.email FROM sites s JOIN artisans a ON a.id = s.artisan_id
   WHERE s.owner_id = ? AND a.account_type = 'proche'`, ownerId);
function clientInfo(a) {
  const p = clientPlan(a);
  return { ...p, slots: CLIENT_PLANS[p.plan].slots, used: prochesOf(a.id).length, prices: { basic: CLIENT_PLANS.basic[a.market], premium: CLIENT_PLANS.premium[a.market] } };
}
// Un proche ne peut publier que si le propriétaire du chantier a une offre Basic ou Premium active.
const prochePublishAllowed = (site) => {
  const owner = site.owner_id && get("SELECT * FROM artisans WHERE id = ?", site.owner_id);
  return !!owner && clientPlan(owner).plan !== "free";
};

const managerOf = (site) => {
  const m = get("SELECT id, company, contact_name, account_type, company_id FROM artisans WHERE id = ?", site.artisan_id);
  if (!m || m.id === site.owner_id) return null;
  return { name: m.account_type === "pro" ? m.company : m.contact_name, type: m.account_type, company_id: m.account_type === "pro" ? m.company_id : "" };
};
const openInvitations = (siteId) => all("SELECT code, kind, invitee_name, created_at FROM invitations WHERE site_id = ? AND accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC", siteId);

function mount(app, api, h) {
  const { fail, str, num, wrap, limit, nowIso, token } = h;
  const onlyClient = (req) => { if (req.artisan.account_type !== "client") fail(403, "Cette page est réservée à l'espace client."); };
  const ownedSite = (req, id) => {
    const s = get("SELECT * FROM sites WHERE id = ? AND owner_id = ?", Number(id), req.artisan.id);
    if (!s) fail(404, "Chantier introuvable.");
    return s;
  };

  // Liste des chantiers du client, tous gestionnaires confondus.
  api.get("/client/sites", (req, res) => {
    onlyClient(req);
    const sites = all("SELECT * FROM sites WHERE owner_id = ? ORDER BY created_at DESC", req.artisan.id).map((s) => {
      const x = siteWithSummary(s);
      const last = get("SELECT MAX(created_at) AS d FROM updates WHERE site_id = ? AND kind = 'post'", s.id).d;
      const unseen = get("SELECT COUNT(*) AS n FROM updates WHERE site_id = ? AND kind = 'post' AND seen_at IS NULL", s.id).n;
      return { ...x, last_update_at: last, unseen, manager: managerOf(s), self_managed: s.artisan_id === s.owner_id, invitations: openInvitations(s.id) };
    });
    res.json({ sites, plan: clientInfo(req.artisan) });
  });

  // Ajouter un chantier géré par une entreprise grâce à son numéro de suivi.
  api.post("/client/claim", limit("claim", 15, 60 * 60e3, (req) => "a" + req.artisan.id), (req, res) => {
    onlyClient(req);
    const code = str(req.body?.code, 20, "numéro de suivi").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(ARC)?(\w{4})(\w{4})$/, "ARC-$2-$3");
    const s = get("SELECT * FROM sites WHERE tracking_code = ?", code);
    if (!s) fail(404, "Aucun chantier ne correspond à ce numéro de suivi. Vérifiez-le auprès de votre artisan.");
    if (s.owner_id && s.owner_id !== req.artisan.id) fail(409, "Ce chantier est déjà rattaché à un autre compte client. Contactez votre artisan.");
    run("UPDATE sites SET owner_id = ? WHERE id = ?", req.artisan.id, s.id);
    res.json({ id: s.id, name: s.name });
  });

  // Le client crée son propre chantier ; il le gère lui-même jusqu'à ce qu'il le confie.
  api.post("/client/sites", (req, res) => {
    onlyClient(req);
    const b = req.body || {}, a = req.artisan;
    const steps = Array.isArray(b.steps) ? b.steps : [];
    if (!steps.length) fail(400, "Ajoutez au moins une étape.");
    if (steps.length > 30) fail(400, "30 étapes au maximum.");
    const id = tx(() => {
      const r = run(
        `INSERT INTO sites (artisan_id, owner_id, name, location, kind, client_name, client_short, client_email, client_city, client_token, tracking_code, budget, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        a.id, a.id, str(b.name, 120, "nom du chantier"), str(b.location, 120, "lieu", false), b.kind === "int" ? "int" : "ext",
        a.contact_name, a.contact_name.split(" ")[0], a.email, a.city || "", token(16), newTrackingCode(), Math.round(num(b.budget || 0, "budget")), nowIso());
      const siteId = Number(r.lastInsertRowid);
      steps.forEach((s, i) => run("INSERT INTO steps (site_id, position, name, planned_days) VALUES (?, ?, ?, ?)", siteId, i + 1, str(s.name, 80, "étape"), num(s.planned_days, "durée prévue", 0.5, 365)));
      return siteId;
    });
    res.status(201).json({ id });
  });

  // Confier le chantier : invitation pour une entreprise (gratuit) ou pour un proche (Basic ou Premium).
  api.post("/client/sites/:id/invite", (req, res) => {
    onlyClient(req);
    const s = ownedSite(req, req.params.id);
    const kind = req.body?.kind === "proche" ? "proche" : "pro";
    if (kind === "proche") {
      const info = clientInfo(req.artisan);
      if (info.plan === "free") fail(402, "Confier un chantier à un proche demande l'offre Basic ou Premium.");
      const pendingProche = get(`SELECT COUNT(*) AS n FROM invitations i JOIN sites s ON s.id = i.site_id WHERE s.owner_id = ? AND i.kind = 'proche' AND i.accepted_at IS NULL AND i.revoked_at IS NULL`, req.artisan.id).n;
      if (info.used + pendingProche >= info.slots) fail(402, `Votre offre permet ${info.slots} proche(s). Passez à Premium ou annulez une invitation en attente.`);
    }
    run("UPDATE invitations SET revoked_at = ? WHERE site_id = ? AND accepted_at IS NULL AND revoked_at IS NULL", nowIso(), s.id);
    const code = readableCode("INV");
    run("INSERT INTO invitations (code, site_id, kind, invitee_name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", code, s.id, kind, str(req.body?.name, 120, "nom", false), req.artisan.id, nowIso());
    res.status(201).json({ code, kind });
  });
  api.delete("/client/sites/:id/invite", (req, res) => {
    onlyClient(req);
    const s = ownedSite(req, req.params.id);
    run("UPDATE invitations SET revoked_at = ? WHERE site_id = ? AND accepted_at IS NULL AND revoked_at IS NULL", nowIso(), s.id);
    res.json({ ok: true });
  });
  // Reprendre la main : le client redevient gestionnaire (le proche ou l'entreprise perd l'accès).
  api.post("/client/sites/:id/take-back", (req, res) => {
    onlyClient(req);
    const s = ownedSite(req, req.params.id);
    run("UPDATE sites SET artisan_id = ? WHERE id = ?", req.artisan.id, s.id);
    res.json({ ok: true });
  });
  // Retirer de son espace un chantier géré par une entreprise (il reste chez l'entreprise).
  api.delete("/client/sites/:id", (req, res) => {
    onlyClient(req);
    const s = ownedSite(req, req.params.id);
    if (s.artisan_id === req.artisan.id) fail(409, "Ce chantier est le vôtre : supprimez-le depuis sa page.");
    run("UPDATE sites SET owner_id = NULL WHERE id = ?", s.id);
    res.json({ ok: true });
  });
  api.get("/client/sites/:id/link", (req, res) => { onlyClient(req); res.json({ client_token: ownedSite(req, req.params.id).client_token }); });

  // Invitation : lecture publique (nom du chantier et de l'inviteur), acceptation une fois connecté.
  const findInvitation = (code) => {
    const i = get(`SELECT i.*, s.name AS site_name, s.location, a.contact_name AS owner_name FROM invitations i
      JOIN sites s ON s.id = i.site_id JOIN artisans a ON a.id = i.created_by
      WHERE i.code = ? AND i.revoked_at IS NULL`, String(code || "").toUpperCase().trim());
    if (!i) fail(404, "Cette invitation n'existe pas ou a été annulée. Demandez un nouveau lien.");
    if (i.accepted_at) fail(410, "Cette invitation a déjà été acceptée.");
    return i;
  };
  app.get("/api/invitations/:code", limit("invite-read", 60, 10 * 60e3), (req, res) => {
    const i = findInvitation(req.params.code);
    res.json({ code: i.code, kind: i.kind, site: i.site_name, location: i.location, owner: i.owner_name, invitee: i.invitee_name });
  });
  function acceptInvitation(code, account) {
    const i = findInvitation(code);
    if (i.kind === "pro" && account.account_type !== "pro") fail(409, "Cette invitation est destinée à une entreprise : connectez-vous avec un compte entreprise.");
    if (i.kind === "proche" && account.account_type === "client") fail(409, "Un compte client ne peut pas gérer le chantier d'un autre client. Créez un compte « proche » avec ce lien.");
    tx(() => {
      run("UPDATE invitations SET accepted_by = ?, accepted_at = ? WHERE id = ?", account.id, nowIso(), i.id);
      run("UPDATE sites SET artisan_id = ? WHERE id = ?", account.id, i.site_id);
    });
    return i.site_id;
  }
  api.post("/invitations/:code/accept", (req, res) => res.json({ site_id: acceptInvitation(req.params.code, req.artisan) }));

  return { acceptInvitation, findInvitation };
}

module.exports = { mount, clientPlan, clientInfo, prochePublishAllowed, CLIENT_PLANS, CLIENT_TRIAL_DAYS };
