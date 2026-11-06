// Abonnements payés par carte bancaire avec Stripe : euros TTC en Europe, dollars ailleurs.
//
// Sans clé Stripe (STRIPE_SECRET_KEY vide), le paiement est simulé : une page de test confirme le paiement sans
// débiter personne. C'est le mode des tests en local ; il est refusé en production sauf si BILLING_TEST=on.
// Mise en place réelle : deploy/PAIEMENT.md.
const crypto = require("node:crypto");
const { all, get, run, tx } = require("./db");
const { DAY } = require("./analytics");
const { PLANS, PRO_FREE, PRO_TRIAL_PLAN, regionOf, priceOf } = require("./plans");
const { BASE_URL } = require("./mail");

const STRIPE = {
  key: process.env.STRIPE_SECRET_KEY || "", webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  base: process.env.STRIPE_API_URL || "https://api.stripe.com", tax: process.env.STRIPE_TAX === "on"
};
const PROD = process.env.NODE_ENV === "production";
const live = () => !!STRIPE.key;
const testMode = () => !live() && (!PROD || process.env.BILLING_TEST === "on");
const PAID = ["plus", "basic", "premium", "demarrage", "pme", "pro"];

// Offre d'une entreprise : payée, sinon essai (limites PME), sinon gratuite (un chantier à elle, sans équipe).
function proPlan(a, now = Date.now()) {
  const paid = a.paid_until && Date.parse(a.paid_until) > now && PLANS[a.plan]?.audience === "pro";
  if (paid) return { plan: a.plan, status: "paid", until: a.paid_until, ...limitsOf(a.plan) };
  if (Date.parse(a.trial_ends_at) > now) return { plan: PRO_TRIAL_PLAN, status: "trial", until: a.trial_ends_at, days_left: Math.ceil((Date.parse(a.trial_ends_at) - now) / DAY), ...limitsOf(PRO_TRIAL_PLAN) };
  return { plan: "free", status: "free", until: null, ...PRO_FREE };
}
const limitsOf = (id) => ({ sites: PLANS[id].sites ?? null, members: PLANS[id].members ?? null });
// Chantiers que l'entreprise a créés elle-même (ceux qu'un client lui confie ne comptent pas : le client paie).
const ownSitesCount = (a) => get("SELECT COUNT(*) AS n FROM sites WHERE artisan_id = ? AND status = 'active' AND (owner_id IS NULL OR owner_id = ?)", a.id, a.id).n;
const membersCount = (a) => get("SELECT COUNT(DISTINCT m.artisan_id) AS n FROM members m JOIN sites s ON s.id = m.site_id WHERE s.artisan_id = ?", a.id).n
  + get("SELECT COUNT(*) AS n FROM team_invites i JOIN sites s ON s.id = i.site_id WHERE s.artisan_id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL", a.id).n;

function billingInfo(a) {
  const region = regionOf(a.country, a.market);
  const audience = a.account_type === "client" ? "client" : a.account_type === "pro" ? "pro" : null;
  return {
    region, mode: live() ? "stripe" : testMode() ? "test" : "off",
    status: a.sub_status || null, cancel_at_end: !!a.sub_cancel_at_end, card: !!a.stripe_customer_id,
    current: audience === "pro" ? { ...proPlan(a), used_sites: ownSitesCount(a), used_members: membersCount(a) } : undefined,
    offers: audience ? Object.keys(PLANS).filter((k) => PLANS[k].audience === audience).map((k) => ({ ...priceOf(k, region), name: PLANS[k].name, sites: PLANS[k].sites ?? null, members: PLANS[k].members ?? null, proches: PLANS[k].proches ?? null })) : []
  };
}

// Active (ou prolonge) une offre jusqu'à une date. Utilisé par Stripe, le paiement simulé et l'administration.
function grant(artisanId, plan, until, extra = {}) {
  run(`UPDATE artisans SET plan = ?, paid_until = ?, sub_status = COALESCE(?, sub_status), sub_currency = COALESCE(?, sub_currency),
    stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_subscription_id = COALESCE(?, stripe_subscription_id), sub_cancel_at_end = ? WHERE id = ?`,
    plan, until, extra.status ?? null, extra.currency ?? null, extra.customer ?? null, extra.subscription ?? null, extra.cancelAtEnd ? 1 : 0, artisanId);
}
const logEvent = (id, type, artisanId, summary) => run("INSERT OR IGNORE INTO billing_events (id, type, artisan_id, summary, created_at) VALUES (?, ?, ?, ?, ?)", id, type, artisanId ?? null, summary, new Date().toISOString());

/* ---------- API Stripe (sans bibliothèque : formulaire encodé, version d'API fixée) ---------- */
function form(obj, prefix, out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" ? form(x, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === "object") form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(method, path, params) {
  const r = await fetch(STRIPE.base + path, {
    method, signal: AbortSignal.timeout(15000),
    headers: { Authorization: "Bearer " + STRIPE.key, "Stripe-Version": "2024-06-20", ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: params ? form(params) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error?.message || "Stripe a refusé la demande."); e.status = 502; throw e; }
  return data;
}
// Signature des événements envoyés par Stripe (en-tête Stripe-Signature : t=…,v1=…), à 5 minutes près.
function verifySignature(payload, header, secret, now = Date.now()) {
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.split("=")).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header || "").split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  if (!parts.t || !sigs.length || !secret) return false;
  if (Math.abs(now / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

const iso = (sec) => new Date(sec * 1000).toISOString();
const accountFor = (obj) => {
  const id = Number(obj?.metadata?.artisan_id || obj?.client_reference_id) || null;
  return (id && get("SELECT * FROM artisans WHERE id = ?", id)) || (obj?.customer && get("SELECT * FROM artisans WHERE stripe_customer_id = ?", String(obj.customer))) || null;
};
async function handleEvent(ev) {
  if (get("SELECT 1 FROM billing_events WHERE id = ?", ev.id)) return "déjà traité";
  const o = ev.data?.object || {};
  let a = accountFor(o), summary = "";
  if (ev.type === "checkout.session.completed" && o.mode === "subscription" && a) {
    const sub = await stripe("GET", "/v1/subscriptions/" + o.subscription);
    const plan = sub.metadata?.plan || o.metadata?.plan;
    if (PLANS[plan]) grant(a.id, plan, iso(sub.current_period_end), { status: sub.status, currency: o.currency, customer: String(o.customer), subscription: String(o.subscription), cancelAtEnd: sub.cancel_at_period_end });
    summary = `${plan} jusqu'au ${iso(sub.current_period_end).slice(0, 10)}`;
  } else if ((ev.type === "invoice.paid" || ev.type === "invoice.payment_succeeded") && a && o.subscription) {
    const end = Math.max(...(o.lines?.data || []).map((l) => l.period?.end || 0));
    const plan = (o.lines?.data || []).map((l) => l.metadata?.plan).find(Boolean) || o.subscription_details?.metadata?.plan || a.plan;
    if (end && PLANS[plan] && (!a.paid_until || Date.parse(a.paid_until) < end * 1000)) grant(a.id, plan, iso(end), { status: "active", customer: String(o.customer), subscription: String(o.subscription) });
    summary = `facture payée : ${(o.amount_paid / 100).toFixed(2)} ${String(o.currency).toUpperCase()}`;
  } else if (ev.type === "customer.subscription.updated" && a) {
    run("UPDATE artisans SET sub_status = ?, sub_cancel_at_end = ?, paid_until = MAX(COALESCE(paid_until, ''), ?) WHERE id = ?", o.status, o.cancel_at_period_end ? 1 : 0, iso(o.current_period_end), a.id);
    summary = `abonnement ${o.status}${o.cancel_at_period_end ? ", s'arrête en fin de période" : ""}`;
  } else if (ev.type === "customer.subscription.deleted" && a) {
    run("UPDATE artisans SET sub_status = 'canceled', sub_cancel_at_end = 0 WHERE id = ?", a.id); // l'accès reste jusqu'à paid_until
    summary = "abonnement arrêté";
  } else if (ev.type === "invoice.payment_failed" && a) {
    run("UPDATE artisans SET sub_status = 'past_due' WHERE id = ?", a.id);
    summary = "paiement refusé";
  }
  logEvent(ev.id, ev.type, a?.id, summary);
  return summary || "ignoré";
}

function mount(app, api, h) {
  const { fail, wrap, limit } = h;
  const audienceOf = (a) => (a.account_type === "client" ? "client" : a.account_type === "pro" ? "pro" : null);

  api.get("/billing", (req, res) => res.json(billingInfo(req.artisan)));

  // Paiement : page Stripe (carte), ou page de test quand Stripe n'est pas configuré.
  api.post("/billing/checkout", limit("checkout", 20, 60 * 60e3, (req) => "a" + req.artisan.id), wrap(async (req, res) => {
    const a = req.artisan, planId = String(req.body?.plan || "");
    if (!PLANS[planId] || PLANS[planId].audience !== audienceOf(a)) fail(400, "Cette offre n'existe pas pour votre compte.");
    const price = priceOf(planId, regionOf(a.country, a.market));
    if (!live()) {
      if (!testMode()) fail(503, "Le paiement en ligne n'est pas encore ouvert. Écrivez-nous pour activer votre offre.");
      const id = crypto.randomBytes(18).toString("base64url");
      run("INSERT INTO billing_sessions (id, artisan_id, plan, currency, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, a.id, planId, price.currency, price.amount, new Date().toISOString());
      return res.json({ url: "/paiement-test?session=" + id });
    }
    // Les jours d'essai restants sont conservés : le premier prélèvement a lieu à la fin de l'essai.
    const trialEnd = Date.parse(a.trial_ends_at) > Date.now() + 2 * DAY && !a.paid_until ? Math.floor(Date.parse(a.trial_ends_at) / 1000) : undefined;
    const lang = req.body?.lang === "en" ? "en" : "fr";
    const s = await stripe("POST", "/v1/checkout/sessions", {
      mode: "subscription", client_reference_id: String(a.id), locale: lang,
      ...(a.stripe_customer_id ? { customer: a.stripe_customer_id, ...(STRIPE.tax ? { customer_update: { address: "auto" } } : {}) } : a.email ? { customer_email: a.email } : {}),
      line_items: [{ quantity: 1, price_data: { currency: price.currency, unit_amount: price.amount, recurring: { interval: "month" }, product_data: { name: PLANS[planId].name }, tax_behavior: price.tax } }],
      metadata: { plan: planId, artisan_id: String(a.id) },
      subscription_data: { metadata: { plan: planId, artisan_id: String(a.id) }, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      ...(STRIPE.tax ? { automatic_tax: { enabled: true }, billing_address_collection: "required" } : {}),
      allow_promotion_codes: true,
      success_url: `${BASE_URL}/app?paiement=ok`, cancel_url: `${BASE_URL}/app?paiement=annule`
    });
    res.json({ url: s.url });
  }));

  // Gérer sa carte, ses factures ou arrêter l'abonnement : portail Stripe.
  api.post("/billing/portal", wrap(async (req, res) => {
    const a = req.artisan;
    if (!live()) {
      if (!a.paid_until) fail(400, "Aucun abonnement à gérer.");
      // Mode test : l'abonnement s'arrête à la fin de la période payée.
      run("UPDATE artisans SET sub_cancel_at_end = 1 - sub_cancel_at_end WHERE id = ?", a.id);
      return res.json({ toggled: true });
    }
    if (!a.stripe_customer_id) fail(400, "Aucun abonnement par carte sur ce compte.");
    const s = await stripe("POST", "/v1/billing_portal/sessions", { customer: a.stripe_customer_id, return_url: `${BASE_URL}/app` });
    res.json({ url: s.url });
  }));

  // Paiement simulé : lecture de la session, puis confirmation (aucun argent ne bouge).
  app.get("/api/billing/test-session/:id", (req, res) => {
    const s = get("SELECT b.*, a.contact_name, a.email, a.phone FROM billing_sessions b JOIN artisans a ON a.id = b.artisan_id WHERE b.id = ?", String(req.params.id));
    if (!s || !testMode()) fail(404, "Session de paiement introuvable.");
    res.json({ plan: s.plan, name: PLANS[s.plan].name, currency: s.currency, amount: s.amount, completed: !!s.completed_at, who: s.contact_name });
  });
  api.post("/billing/test-complete", (req, res) => {
    if (!testMode()) fail(404, "Le paiement de test n'est pas disponible.");
    const s = get("SELECT * FROM billing_sessions WHERE id = ? AND artisan_id = ?", String(req.body?.session || ""), req.artisan.id);
    if (!s) fail(404, "Session de paiement introuvable.");
    if (s.completed_at) return res.json({ ok: true });
    const a = req.artisan;
    const from = a.paid_until && Date.parse(a.paid_until) > Date.now() && a.plan === s.plan ? Date.parse(a.paid_until) : Date.now();
    const until = new Date(from + 30 * DAY).toISOString();
    tx(() => {
      run("UPDATE billing_sessions SET completed_at = ? WHERE id = ?", new Date().toISOString(), s.id);
      grant(a.id, s.plan, until, { status: "active", currency: s.currency });
      logEvent("test_" + s.id, "test.payment", a.id, `${s.plan} : ${(s.amount / 100).toFixed(2)} ${s.currency.toUpperCase()} (simulé) jusqu'au ${until.slice(0, 10)}`);
    });
    res.json({ ok: true, until });
  });
}

// Le webhook lit le corps brut de la requête pour vérifier la signature : à monter avant express.json().
function mountWebhook(app, express) {
  app.post("/api/stripe/webhook", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    const payload = req.body.toString("utf8");
    if (!verifySignature(payload, req.headers["stripe-signature"], STRIPE.webhookSecret)) return res.status(400).json({ error: "Signature invalide." });
    try { const r = await handleEvent(JSON.parse(payload)); res.json({ received: true, result: r }); }
    catch (e) { console.error("Webhook Stripe :", e.message); res.status(500).json({ error: "Erreur de traitement." }); }
  });
}

module.exports = { mount, mountWebhook, proPlan, billingInfo, grant, verifySignature, handleEvent, ownSitesCount, membersCount, live, testMode, form, PAID };
