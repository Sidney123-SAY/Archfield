// Équipe de chantier et vue du dirigeant (idées reprises de SuiviBat) :
// - chacun voit seulement ce que le gestionnaire du chantier l'autorise à faire (modèles « Chef de chantier »,
//   « Chef d'équipe » ou droits cochés un par un) ;
// - rapport du jour, problèmes et messages vocaux, dépenses « En attente » jusqu'à approbation ;
// - tableau du dirigeant : ce qui demande une action aujourd'hui.
const { all, get, run, tx, readableCode } = require("./db");
const { siteWithSummary, stepStatus, DAY } = require("./analytics");
const { moneyOf } = require("./money");
const { pretty } = require("./phone");

const PERMS = ["rapport", "photos", "depenses", "probleme", "vocal", "budget"];
const ROLES = {
  chef_chantier: { rapport: true, photos: true, depenses: true, probleme: true, vocal: true, budget: false },
  chef_equipe: { rapport: false, photos: true, depenses: false, probleme: true, vocal: true, budget: false }
};
const FULL = Object.fromEntries(PERMS.map((p) => [p, true]));
const WATCH_POINTS = 10;     // « à surveiller » : budget utilisé ≥ avancement + 10 points…
const SILENT_DAYS = 2;       // … ou aucun rapport depuis 2 jours sur un chantier en cours
// Droits envoyés par le formulaire : on part du modèle, chaque case cochée ou décochée le personnalise.
function permsFrom(role, perms) {
  const base = ROLES[role] || ROLES.chef_equipe;
  const out = {};
  for (const p of PERMS) out[p] = perms && typeof perms === "object" && p in perms ? !!perms[p] : base[p];
  // Droits identiques à un modèle : le modèle garde son nom ; sinon « Personnalisé ».
  const match = Object.keys(ROLES).find((r) => PERMS.every((p) => out[p] === ROLES[r][p]));
  return { role: match || "perso", perms: out };
}
const parsePerms = (s) => { try { return { ...ROLES.chef_equipe, ...JSON.parse(s) }; } catch (e) { return { ...ROLES.chef_equipe }; } };

// Qui est cette personne pour ce chantier : gestionnaire, propriétaire (client), membre de l'équipe ? Et ses droits.
function accessOf(a, siteId) {
  const s = get("SELECT * FROM sites WHERE id = ?", Number(siteId));
  if (!s) return null;
  if (s.artisan_id === a.id) return { site: s, as: "manager", perms: FULL };
  const m = get("SELECT * FROM members WHERE site_id = ? AND artisan_id = ?", s.id, a.id);
  if (m) return { site: s, as: "member", perms: parsePerms(m.perms), role: m.role };
  if (s.owner_id === a.id) return { site: s, as: "owner", perms: { budget: true } };
  return null;
}
const memberSiteIds = (a) => all("SELECT site_id FROM members WHERE artisan_id = ?", a.id).map((r) => r.site_id);

// Publications pour la vue « équipe » ou « client ». Les problèmes et vocaux internes ne sortent pas de l'équipe
// tant que le gestionnaire ne les a pas partagés.
function updatesOf(siteId, mediaBase, { team = false, limitN = 300 } = {}) {
  const ups = all(`SELECT u.*, st.name AS step_name FROM updates u LEFT JOIN steps st ON st.id = u.step_id WHERE u.site_id = ? ${team ? "" : "AND u.visibility = 'all'"} ORDER BY u.created_at DESC, u.id DESC LIMIT ?`, siteId, limitN);
  if (!ups.length) return [];
  const ids = ups.map((u) => u.id), q = ids.map(() => "?").join(",");
  const photos = all(`SELECT * FROM photos WHERE update_id IN (${q}) ORDER BY id`, ...ids);
  const audios = all(`SELECT * FROM audios WHERE update_id IN (${q}) ORDER BY id`, ...ids);
  const dels = all(`SELECT * FROM deliveries WHERE update_id IN (${q}) ORDER BY id`, ...ids);
  return ups.map((u) => ({
    ...u, lat: undefined, lng: undefined, verify_note: u.verify_note ? JSON.parse(u.verify_note) : null, data: u.data ? JSON.parse(u.data) : null,
    photos: photos.filter((p) => p.update_id === u.id).map((p) => ({ id: p.id, url: mediaBase + p.file, taken_at: p.taken_at, shot_at: p.shot_at })),
    audios: audios.filter((x) => x.update_id === u.id).map((x) => ({ id: x.id, url: mediaBase + x.file, duration: x.duration })),
    deliveries: dels.filter((d) => d.update_id === u.id).map((d) => ({ label: d.label, quantity: d.quantity }))
  }));
}

// « À surveiller » : l'argent dépensé avance plus vite que les travaux, ou personne n'a donné de nouvelles.
function watchOf(s, m, lastReport, now = Date.now()) {
  const budgetPct = m.budget ? Math.round((m.spent / m.budget) * 100) : null;
  const silentDays = lastReport ? (now - Date.parse(lastReport)) / DAY : (now - Date.parse(s.created_at)) / DAY;
  const reasons = [];
  if (budgetPct != null && m.spent > 0 && budgetPct >= s.progress + WATCH_POINTS) reasons.push("budget");
  if (s.running && silentDays >= SILENT_DAYS) reasons.push("silence");
  return { budget_pct: budgetPct, silent_days: Math.floor(silentDays), reasons };
}

// Tableau du dirigeant : 4 chiffres, chantiers (avancement et budget côte à côte), « À traiter aujourd'hui », activité.
function bossDashboard(a, now = Date.now()) {
  const sites = all("SELECT * FROM sites WHERE artisan_id = ? AND status = 'active' ORDER BY created_at", a.id).map((s) => siteWithSummary(s, now));
  const ids = sites.map((s) => s.id);
  const q = ids.map(() => "?").join(",") || "NULL";
  const toCheck = ids.length ? all(`SELECT u.id, u.site_id, u.author_name, u.created_at FROM updates u WHERE u.site_id IN (${q}) AND u.topic = 'rapport' AND u.checked_at IS NULL AND (u.author_id IS NULL OR u.author_id <> ?) ORDER BY u.created_at DESC`, ...ids, a.id) : [];
  const pending = ids.length ? all(`SELECT id, site_id, amount, label, created_by_name, entry_date FROM ledger WHERE site_id IN (${q}) AND status = 'en_attente' AND cancelled_at IS NULL ORDER BY created_at DESC`, ...ids) : [];
  const problems = ids.length ? all(`SELECT u.id, u.site_id, u.text, u.data, u.author_name, u.created_at FROM updates u WHERE u.site_id IN (${q}) AND u.topic = 'probleme' AND u.resolved_at IS NULL ORDER BY u.created_at DESC`, ...ids) : [];
  const rows = sites.map((s) => {
    const m = moneyOf(s, "/media/", s.progress);
    const last = get("SELECT MAX(created_at) AS d FROM updates WHERE site_id = ? AND kind = 'post'", s.id).d;
    const w = watchOf(s, m, last, now);
    const chef = get(`SELECT a.contact_name, a.phone FROM members mb JOIN artisans a ON a.id = mb.artisan_id WHERE mb.site_id = ? ORDER BY CASE mb.role WHEN 'chef_chantier' THEN 0 ELSE 1 END, mb.id LIMIT 1`, s.id);
    return {
      id: s.id, name: s.name, location: s.location, client_name: s.client_name, client_short: s.client_short, currency: s.currency, progress: s.progress, drift: s.drift, delay: s.delay,
      running: s.running ? { name: s.running.name } : null, toValidate: s.toValidate, budget: m.budget, spent: m.spent, budget_pct: w.budget_pct, last_report_at: last,
      watch: w.reasons, silent_days: w.silent_days, chef: chef ? { name: chef.contact_name, phone: chef.phone } : null,
      shared_by: s.owner_id && s.owner_id !== a.id ? get("SELECT contact_name FROM artisans WHERE id = ?", s.owner_id)?.contact_name : null
    };
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const todo = [];
  const group = (list) => { const g = new Map(); for (const x of list) { const k = x.site_id; g.set(k, [...(g.get(k) || []), x]); } return g; };
  for (const [sid, list] of group(toCheck)) todo.push({ kind: "reports", site_id: sid, site: byId[sid].name, n: list.length, who: [...new Set(list.map((x) => x.author_name).filter(Boolean))].join(", ") });
  for (const [sid, list] of group(pending)) todo.push({ kind: "expenses", site_id: sid, site: byId[sid].name, n: list.length, amount: list.reduce((x, e) => x + e.amount, 0), currency: byId[sid].currency });
  for (const p of problems) todo.push({ kind: "problem", site_id: p.site_id, site: byId[p.site_id].name, update_id: p.id, text: p.text, category: (p.data && JSON.parse(p.data).category) || "autre", who: p.author_name, at: p.created_at });
  for (const r of rows) {
    if (r.watch.includes("silence")) todo.push({ kind: "silence", site_id: r.id, site: r.name, days: r.silent_days, chef: r.chef });
    if (r.watch.includes("budget")) todo.push({ kind: "budget", site_id: r.id, site: r.name, budget_pct: r.budget_pct, progress: r.progress });
  }
  // Activité récente : publications, rapports, dépenses, validations.
  const activity = ids.length ? [
    ...all(`SELECT u.id, u.site_id, u.kind, u.topic, u.author_name, u.created_at, (SELECT COUNT(*) FROM photos p WHERE p.update_id = u.id) AS photos, st.name AS step FROM updates u LEFT JOIN steps st ON st.id = u.step_id WHERE u.site_id IN (${q}) ORDER BY u.created_at DESC LIMIT 12`, ...ids).map((u) => ({ type: u.kind === "post" ? u.topic : u.kind, site_id: u.site_id, site: byId[u.site_id].name, who: u.author_name || null, photos: u.photos, step: u.step, at: u.created_at })),
    ...all(`SELECT site_id, kind, amount, label, status, created_by_name, created_at FROM ledger WHERE site_id IN (${q}) ORDER BY created_at DESC LIMIT 8`, ...ids).map((l) => ({ type: l.kind, site_id: l.site_id, site: byId[l.site_id].name, who: l.created_by_name, amount: l.amount, label: l.label, status: l.status, currency: byId[l.site_id].currency, at: l.created_at }))
  ].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 10) : [];
  const pendingTotal = {};
  for (const e of pending) { const c = byId[e.site_id].currency; pendingTotal[c] = (pendingTotal[c] || 0) + e.amount; }
  return {
    kpis: { active: rows.length, shared: rows.filter((r) => r.shared_by).length, reports: toCheck.length, reports_today: toCheck.filter((x) => new Date(x.created_at).toDateString() === new Date(now).toDateString()).length, expenses: pending.length, expenses_total: pendingTotal, watch: rows.filter((r) => r.watch.length || r.drift).length },
    sites: rows, todo, activity
  };
}

function mount(app, api, h) {
  const { fail, str, wrap, limit, nowIso, token } = h;
  const managed = (req, id) => {
    const x = accessOf(req.artisan, id);
    if (!x || x.as !== "manager") fail(404, "Chantier introuvable.");
    return x.site;
  };
  const contactOf = (v) => { const s = str(v, 200, "téléphone ou e-mail", false); return s; };

  /* ---------- Équipe d'un chantier ---------- */
  api.get("/sites/:id/team", (req, res) => {
    const s = managed(req, req.params.id);
    res.json({
      members: all("SELECT m.id, m.role, m.perms, m.created_at, a.contact_name, a.phone, a.email FROM members m JOIN artisans a ON a.id = m.artisan_id WHERE m.site_id = ? ORDER BY m.created_at", s.id)
        .map((m) => ({ ...m, perms: parsePerms(m.perms), phone: pretty(m.phone) })),
      invites: all("SELECT id, code, role, perms, invitee_name, invitee_contact, created_at FROM team_invites WHERE site_id = ? AND accepted_at IS NULL AND revoked_at IS NULL ORDER BY created_at DESC", s.id)
        .map((i) => ({ ...i, perms: parsePerms(i.perms) })),
      roles: ROLES
    });
  });

  // Inviter une personne : si elle a déjà un compte (même téléphone ou e-mail), elle est ajoutée tout de suite ;
  // sinon elle reçoit un lien d'invitation (WhatsApp, SMS ou e-mail) pour créer son compte.
  api.post("/sites/:id/team", limit("team", 60, 60 * 60e3, (req) => "a" + req.artisan.id), (req, res) => {
    const s = managed(req, req.params.id), a = req.artisan, b = req.body || {};
    if (a.account_type === "proche") fail(403, "Un proche ne peut pas ajouter d'équipe au chantier qu'on lui confie.");
    checkTeamLimit(a);
    const { role, perms } = permsFrom(b.role, b.perms);
    const name = str(b.name, 120, "nom");
    const contact = contactOf(b.contact);
    const { normalize } = require("./phone");
    const phone = contact && !contact.includes("@") ? normalize(contact, b.country || a.country) : null;
    if (contact && !contact.includes("@") && !phone) fail(400, "Numéro de téléphone illisible. Écrivez-le avec l'indicatif du pays, par exemple +229 01 97 00 00 00.");
    const existing = phone ? get("SELECT * FROM artisans WHERE phone = ?", phone) : contact ? get("SELECT * FROM artisans WHERE email = ?", contact.toLowerCase()) : null;
    if (existing && existing.id !== a.id && existing.account_type !== "client") {
      if (get("SELECT 1 FROM members WHERE site_id = ? AND artisan_id = ?", s.id, existing.id)) fail(409, "Cette personne fait déjà partie de l'équipe du chantier.");
      run("INSERT INTO members (site_id, artisan_id, role, perms, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", s.id, existing.id, role, JSON.stringify(perms), a.id, nowIso());
      return res.status(201).json({ added: true, name: existing.contact_name });
    }
    if (existing && existing.id === a.id) fail(400, "Vous gérez déjà ce chantier.");
    const code = readableCode("EQP");
    run("INSERT INTO team_invites (code, site_id, role, perms, invitee_name, invitee_contact, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", code, s.id, role, JSON.stringify(perms), name, phone || contact.toLowerCase(), a.id, nowIso());
    res.status(201).json({ code, phone });
  });
  const ownMember = (req) => {
    const m = get("SELECT m.* FROM members m JOIN sites s ON s.id = m.site_id WHERE m.id = ? AND s.artisan_id = ?", Number(req.params.id), req.artisan.id);
    if (!m) fail(404, "Membre introuvable.");
    return m;
  };
  api.patch("/team/:id", (req, res) => {
    const m = ownMember(req);
    const { role, perms } = permsFrom(req.body?.role || m.role, req.body?.perms);
    run("UPDATE members SET role = ?, perms = ? WHERE id = ?", role, JSON.stringify(perms), m.id);
    res.json({ ok: true, role, perms });
  });
  api.delete("/team/:id", (req, res) => { run("DELETE FROM members WHERE id = ?", ownMember(req).id); res.json({ ok: true }); });
  api.delete("/team-invites/:id", (req, res) => {
    const i = get("SELECT i.* FROM team_invites i JOIN sites s ON s.id = i.site_id WHERE i.id = ? AND s.artisan_id = ?", Number(req.params.id), req.artisan.id);
    if (!i) fail(404, "Invitation introuvable.");
    run("UPDATE team_invites SET revoked_at = ? WHERE id = ?", nowIso(), i.id);
    res.json({ ok: true });
  });

  /* ---------- Accueil « sur le chantier » d'un membre de l'équipe ---------- */
  api.get("/terrain", (req, res) => {
    const a = req.artisan;
    const ids = [...new Set([...memberSiteIds(a), ...all("SELECT id FROM sites WHERE artisan_id = ? AND status = 'active'", a.id).map((r) => r.id)])];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const sites = ids.map((id) => {
      const x = accessOf(a, id);
      if (!x || x.site.status !== "active") return null;
      const s = siteWithSummary(x.site);
      const mine = get("SELECT created_at FROM updates WHERE site_id = ? AND author_id = ? AND topic = 'rapport' AND created_at >= ? ORDER BY created_at DESC LIMIT 1", s.id, a.id, today.toISOString());
      const lastWorkers = get("SELECT data FROM updates WHERE site_id = ? AND topic = 'rapport' AND data IS NOT NULL ORDER BY created_at DESC LIMIT 1", s.id);
      const boss = get("SELECT contact_name, company, account_type FROM artisans WHERE id = ?", s.artisan_id);
      return {
        id: s.id, name: s.name, location: s.location, currency: s.currency, as: x.as, role: x.role || null, perms: x.perms,
        boss: boss ? (boss.account_type === "pro" ? boss.company : boss.contact_name) : "",
        steps: s.steps.map((st) => ({ id: st.id, name: st.name, status: st.status })), running: s.running ? { id: s.running.id, name: s.running.name } : null,
        progress: x.perms.budget ? s.progress : undefined, budget: x.perms.budget ? moneyOf(x.site, "/media/", s.progress).budget : undefined,
        report_today: mine ? mine.created_at : null,
        last_workers: lastWorkers ? (JSON.parse(lastWorkers.data).workers ?? null) : null
      };
    }).filter(Boolean);
    const recent = ids.length ? [
      ...all(`SELECT u.id, u.site_id, u.topic, u.text, u.created_at, u.checked_at, (SELECT COUNT(*) FROM photos p WHERE p.update_id = u.id) AS photos, (SELECT COUNT(*) FROM audios x WHERE x.update_id = u.id) AS audios FROM updates u WHERE u.author_id = ? ORDER BY u.created_at DESC LIMIT 6`, a.id),
      ...all("SELECT id, site_id, 'depense' AS topic, label AS text, amount, status, created_at FROM ledger WHERE created_by = ? ORDER BY created_at DESC LIMIT 4", a.id)
    ].sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 8) : [];
    res.json({ sites, recent });
  });

  /* ---------- Le gestionnaire traite ce que l'équipe envoie ---------- */
  const ownUpdate = (req) => {
    const u = get("SELECT u.* FROM updates u JOIN sites s ON s.id = u.site_id WHERE u.id = ? AND s.artisan_id = ?", Number(req.params.id), req.artisan.id);
    if (!u) fail(404, "Publication introuvable.");
    return u;
  };
  api.post("/updates/:id/check", (req, res) => {
    const u = ownUpdate(req);
    run("UPDATE updates SET checked_at = COALESCE(checked_at, ?), checked_by_name = COALESCE(checked_by_name, ?) WHERE id = ?", nowIso(), req.artisan.contact_name, u.id);
    res.json({ ok: true });
  });
  api.post("/sites/:id/check-all", (req, res) => {
    const s = managed(req, req.params.id);
    const n = run("UPDATE updates SET checked_at = ?, checked_by_name = ? WHERE site_id = ? AND topic = 'rapport' AND checked_at IS NULL", nowIso(), req.artisan.contact_name, s.id).changes;
    res.json({ ok: true, checked: Number(n) });
  });
  // Partager avec le client un problème ou un vocal resté dans l'équipe ; le reprendre.
  api.post("/updates/:id/share", (req, res) => {
    const u = ownUpdate(req);
    run("UPDATE updates SET visibility = ? WHERE id = ?", req.body?.share === false ? "team" : "all", u.id);
    res.json({ ok: true });
  });
  api.post("/updates/:id/resolve", (req, res) => {
    const u = ownUpdate(req);
    if (u.topic !== "probleme") fail(409, "Seul un problème signalé peut être marqué résolu.");
    run("UPDATE updates SET resolved_at = ? WHERE id = ?", u.resolved_at ? null : nowIso(), u.id);
    res.json({ ok: true });
  });
  // Dépense d'un membre : approuvée (elle compte dans le budget utilisé) ou refusée (elle reste visible, barrée).
  api.post("/ledger/:id/review", (req, res) => {
    const e = get("SELECT l.* FROM ledger l JOIN sites s ON s.id = l.site_id WHERE l.id = ? AND s.artisan_id = ?", Number(req.params.id), req.artisan.id);
    if (!e) fail(404, "Dépense introuvable.");
    if (e.status !== "en_attente") fail(409, "Cette dépense a déjà été traitée.");
    const ok = req.body?.decision === "approve";
    run("UPDATE ledger SET status = ?, reviewed_at = ?, reviewed_by_name = ?, review_note = ? WHERE id = ?", ok ? "approuvee" : "refusee", nowIso(), req.artisan.contact_name, str(req.body?.note, 200, "motif", false), e.id);
    res.json({ ok: true });
  });

  api.get("/boss", (req, res) => res.json(bossDashboard(req.artisan)));
  api.get("/sites/:id/deliveries", (req, res) => {
    const x = accessOf(req.artisan, req.params.id);
    if (!x) fail(404, "Chantier introuvable.");
    res.json(all("SELECT d.label, d.quantity, d.created_at, u.author_name FROM deliveries d LEFT JOIN updates u ON u.id = d.update_id WHERE d.site_id = ? ORDER BY d.created_at DESC LIMIT 200", x.site.id));
  });

  /* ---------- Invitation dans une équipe ---------- */
  const findTeamInvite = (code) => {
    const i = get(`SELECT i.*, s.name AS site_name, s.location, a.company, a.contact_name AS owner_name, a.account_type AS owner_type FROM team_invites i
      JOIN sites s ON s.id = i.site_id JOIN artisans a ON a.id = i.created_by WHERE i.code = ? AND i.revoked_at IS NULL`, String(code || "").toUpperCase().trim());
    if (!i) fail(404, "Cette invitation n'existe pas ou a été annulée. Demandez un nouveau lien.");
    if (i.accepted_at) fail(410, "Cette invitation a déjà été acceptée.");
    return i;
  };
  function acceptTeamInvite(code, account) {
    const i = findTeamInvite(code);
    if (account.account_type === "client") fail(409, "Cette invitation est destinée à un membre d'équipe. Créez un compte avec ce lien.");
    tx(() => {
      run("UPDATE team_invites SET accepted_by = ?, accepted_at = ? WHERE id = ?", account.id, nowIso(), i.id);
      run("INSERT OR IGNORE INTO members (site_id, artisan_id, role, perms, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", i.site_id, account.id, i.role, i.perms, i.created_by, nowIso());
    });
    return i.site_id;
  }
  return { findTeamInvite, acceptTeamInvite };
}

// Limite d'équipe selon l'offre de l'entreprise (le client qui gère lui-même : 5 personnes avec Plus).
function checkTeamLimit(a) {
  const { proPlan, membersCount } = require("./billing");
  if (a.account_type === "client") {
    const { clientPlan } = require("./space");
    if (clientPlan(a).plan === "free") { const e = new Error("Ajouter une équipe à votre chantier fait partie de l'offre Plus."); e.status = 402; throw e; }
    if (membersCount(a) >= 5) { const e = new Error("L'offre Plus permet 5 personnes dans l'équipe de vos chantiers."); e.status = 402; throw e; }
    return;
  }
  const p = proPlan(a);
  if (p.members != null && membersCount(a) >= p.members) {
    const e = new Error(p.members === 0 ? "Ajouter une équipe demande une offre Démarrage, PME ou Pro." : `Votre offre permet ${p.members} personnes dans l'équipe. Passez à l'offre supérieure pour en ajouter.`);
    e.status = 402; throw e;
  }
}

module.exports = { mount, accessOf, updatesOf, bossDashboard, permsFrom, parsePerms, PERMS, ROLES, memberSiteIds, watchOf };
