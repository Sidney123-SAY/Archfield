// L'argent du chantier : devis, versements du client, dépenses justifiées par le gestionnaire, et la question
// que se pose chaque client : « ai-je déjà payé plus que ce qui est construit ? »
const { all, get, run } = require("./db");
const { siteWithSummary } = require("./analytics");

const CATEGORIES = ["materiaux", "main_oeuvre", "transport", "autre"];
const METHODS = ["wave", "orange_money", "mtn_momo", "virement", "especes", "autre"];
const ALERT_MARGIN = 15; // alerte quand le client a versé 15 points de plus que l'avancement des travaux

const sum = (rows) => rows.reduce((a, r) => a + r.amount, 0);

// Résumé et lignes de l'argent d'un chantier. receiptBase : « /media/ » ou « /c/<lien>/media/ ».
function moneyOf(site, receiptBase, progress) {
  if (progress === undefined) progress = siteWithSummary(site).progress;
  const docs = all("SELECT kind, status, amount FROM documents WHERE site_id = ?", site.id);
  const entries = all("SELECT * FROM ledger WHERE site_id = ? ORDER BY entry_date DESC, id DESC", site.id);
  // Une dépense en attente d'approbation ou refusée ne compte pas dans le budget utilisé.
  const live = entries.filter((e) => !e.cancelled_at && (e.status || "approuvee") === "approuvee");
  const pending = entries.filter((e) => !e.cancelled_at && e.status === "en_attente");
  const quoted = sum(docs.filter((d) => d.kind === "devis" && d.status === "signe"));
  const budget = quoted || site.budget || 0;
  const paid = sum(live.filter((e) => e.kind === "versement"));
  const spent = sum(live.filter((e) => e.kind === "depense"));
  const invoiced = sum(docs.filter((d) => d.kind === "facture"));
  const paidPct = budget ? Math.round((paid / budget) * 100) : null;
  const scheduled = all("SELECT id, name, amount, validated_at FROM steps WHERE site_id = ? AND amount > 0 ORDER BY position", site.id);
  return {
    currency: site.currency || "EUR",
    budget, budget_from: quoted ? "devis" : site.budget ? "estimation" : null,
    paid, spent, invoiced, paid_pct: paidPct, progress,
    pending: sum(pending), pending_count: pending.length,
    // Plus versé que construit : le signal d'alarme du client.
    alert: paidPct != null && paid > 0 && paidPct > progress + ALERT_MARGIN,
    // Argent reçu par le gestionnaire mais pas encore justifié par une dépense (utile quand un proche gère l'argent).
    unjustified: Math.max(0, paid - spent),
    // Échéancier : montant prévu à la validation de chaque étape.
    schedule: scheduled.map((s) => ({ step_id: s.id, name: s.name, amount: s.amount, due: !!s.validated_at })),
    entries: entries.map((e) => ({
      id: e.id, kind: e.kind, amount: e.amount, label: e.label, category: e.category, entry_date: e.entry_date, step_id: e.step_id,
      receipt_url: e.receipt_file ? receiptBase + e.receipt_file : null, created_by_name: e.created_by_name, created_at: e.created_at,
      created_by: e.created_by,
      cancelled_at: e.cancelled_at, cancelled_by_name: e.cancelled_by_name, cancel_reason: e.cancel_reason,
      status: e.status || "approuvee", reviewed_at: e.reviewed_at, reviewed_by_name: e.reviewed_by_name, review_note: e.review_note
    }))
  };
}
// Côté lien privé : on ne montre pas qui a créé quoi par identifiant.
const publicMoney = (m) => ({ ...m, entries: m.entries.map((e) => ({ ...e, created_by: undefined })) });

function mount(app, api, h) {
  const { fail, str, num, wrap, limit, nowIso, upload, normalizePhotos, removeFiles, checkFiles } = h;
  const dateOk = (v) => { const d = str(v, 10, "date"); if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) fail(400, "La date doit être au format AAAA-MM-JJ."); return d; };
  // Gestionnaire du chantier (entreprise, proche, ou client qui le gère lui-même), propriétaire, ou membre de l'équipe.
  const siteFor = (req, id) => {
    const x = require("./team").accessOf(req.artisan, id);
    if (!x) fail(404, "Chantier introuvable.");
    return x;
  };

  // Nouvelle ligne : dépense (gestionnaire, avec reçu en photo) ou versement (propriétaire, ou gestionnaire qui l'a reçu).
  api.post("/sites/:id/ledger", limit("ledger", 120, 60 * 60e3, (req) => "a" + req.artisan.id), upload.single("receipt"), wrap(async (req, res) => {
    const files = req.file ? [req.file] : [];
    try {
      const x = siteFor(req, req.params.id), s = x.site, b = req.body || {}, me = req.artisan;
      const isManager = x.as === "manager", isOwner = s.owner_id === me.id, isMember = x.as === "member";
      const kind = b.kind === "versement" ? "versement" : b.kind === "depense" ? "depense" : fail(400, "Type de ligne inconnu.");
      if (kind === "depense" && !isManager && !(isMember && x.perms.depenses)) fail(403, "Les dépenses sont notées par la personne qui gère le chantier.");
      if (kind === "versement" && isMember) fail(403, "Les versements sont notés par le propriétaire ou le gestionnaire du chantier.");
      if (kind === "versement" && isOwner && !isManager) {
        const { clientPlan } = require("./space");
        if (clientPlan(me).plan === "free") fail(402, "Le suivi de vos versements fait partie de l'offre Plus.");
      }
      const amount = Math.round(num(b.amount, "montant", 1, 1e12));
      const category = kind === "depense" ? (CATEGORIES.includes(b.category) ? b.category : "autre") : (METHODS.includes(b.category) ? b.category : "autre");
      const step = b.step_id ? get("SELECT id FROM steps WHERE id = ? AND site_id = ?", Number(b.step_id), s.id) : null;
      if (b.step_id && !step) fail(400, "Étape inconnue pour ce chantier.");
      await checkFiles(files);
      await normalizePhotos(files);
      // Dépense notée par un membre de l'équipe : « En attente » jusqu'à l'approbation du gestionnaire.
      const status = kind === "depense" && isMember ? "en_attente" : "approuvee";
      const r = run(`INSERT INTO ledger (site_id, kind, amount, label, category, entry_date, step_id, receipt_file, created_by, created_by_name, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s.id, kind, amount, str(b.label, 160, "libellé", kind === "depense"), category, dateOk(b.entry_date || nowIso().slice(0, 10)), step ? step.id : null,
        files[0] ? files[0].filename : null, me.id, me.contact_name, nowIso(), status);
      res.status(201).json({ id: Number(r.lastInsertRowid), status });
    } catch (e) { removeFiles(files.map((f) => f.filename)); throw e; }
  }));

  // Annuler une ligne : seulement son auteur ; la ligne reste visible, barrée, avec le motif.
  api.post("/ledger/:id/cancel", (req, res) => {
    const e = get("SELECT l.* FROM ledger l WHERE l.id = ?", Number(req.params.id));
    if (e && !require("./team").accessOf(req.artisan, e.site_id)) fail(404, "Ligne introuvable.");
    if (!e) fail(404, "Ligne introuvable.");
    if (e.created_by !== req.artisan.id) fail(403, "Seule la personne qui a noté cette ligne peut l'annuler.");
    if (e.cancelled_at) fail(409, "Cette ligne est déjà annulée.");
    run("UPDATE ledger SET cancelled_at = ?, cancelled_by_name = ?, cancel_reason = ? WHERE id = ?", nowIso(), req.artisan.contact_name, str(req.body?.reason, 200, "motif", false), e.id);
    res.json({ ok: true });
  });

  // Versement prévu à la validation d'une étape (échéancier), fixé par le gestionnaire.
  api.patch("/steps/:id/amount", (req, res) => {
    const st = get("SELECT st.* FROM steps st JOIN sites si ON si.id = st.site_id WHERE st.id = ? AND si.artisan_id = ?", Number(req.params.id), req.artisan.id);
    if (!st) fail(404, "Étape introuvable.");
    run("UPDATE steps SET amount = ? WHERE id = ?", Math.round(num(req.body?.amount || 0, "montant")), st.id);
    res.json({ ok: true });
  });
}

module.exports = { moneyOf, publicMoney, mount, CATEGORIES, METHODS };
