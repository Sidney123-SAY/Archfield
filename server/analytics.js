// Calculs tirés des données de chantier : avancement, dérive, durées par étape, indice de fiabilité.
const { all, get } = require("./db");

const DAY = 864e5;
const DRIFT = 1.2; // une étape dérive quand elle dépasse sa durée prévue de plus de 20 %

const roundHalf = (n) => Math.round(n * 2) / 2;

function stepStatus(s) {
  if (s.validated_at) return "validee";
  if (s.finished_at) return "a_valider";
  if (s.started_at) return "en_cours";
  return "a_venir";
}

function stepDays(s, now = Date.now()) {
  if (!s.started_at) return 0;
  const end = s.finished_at ? Date.parse(s.finished_at) : now;
  return Math.max(0.5, roundHalf((end - Date.parse(s.started_at)) / DAY));
}

function decorateStep(s, now) {
  return { ...s, status: stepStatus(s), actual_days: stepDays(s, now) };
}

function summarize(site, steps, now = Date.now()) {
  const ds = steps.map((s) => decorateStep(s, now));
  const total = ds.reduce((a, s) => a + s.planned_days, 0) || 1;
  const done = ds.reduce((a, s) => {
    if (s.status === "validee" || s.status === "a_valider") return a + s.planned_days;
    if (s.status === "en_cours") return a + Math.min(s.actual_days, s.planned_days * 0.9) * 0.9;
    return a;
  }, 0);
  const running = ds.find((s) => s.status === "en_cours") || null;
  const delay = running ? Math.max(0, running.actual_days - running.planned_days) : 0;
  return {
    steps: ds,
    progress: site.status === "delivered" ? 100 : Math.round((done / total) * 100),
    running,
    runningIndex: running ? ds.indexOf(running) : -1,
    delay,
    drift: !!running && running.actual_days > running.planned_days * DRIFT,
    overPct: running ? Math.round(((running.actual_days - running.planned_days) / running.planned_days) * 100) : 0,
    toValidate: ds.filter((s) => s.status === "a_valider").length
  };
}

function siteWithSummary(site, now) {
  const steps = all("SELECT * FROM steps WHERE site_id = ? ORDER BY position", site.id);
  return { ...site, ...summarize(site, steps, now) };
}

function dashboard(artisanId, now = Date.now()) {
  const active = all("SELECT * FROM sites WHERE artisan_id = ? AND status = 'active' ORDER BY created_at", artisanId).map((s) => siteWithSummary(s, now));
  const withRunning = active.filter((s) => s.running);
  const avgDelay = withRunning.reduce((a, s) => a + s.delay, 0) / Math.max(1, withRunning.length);

  // Durée prévue / réelle par type d'étape, sur les étapes terminées des 12 derniers mois.
  const since = new Date(now - 365 * DAY).toISOString();
  const finished = all(
    `SELECT st.name, st.position, st.planned_days, st.started_at, st.finished_at FROM steps st
     JOIN sites si ON si.id = st.site_id
     WHERE si.artisan_id = ? AND st.finished_at IS NOT NULL AND st.finished_at >= ?`, artisanId, since);
  const groups = new Map();
  for (const s of finished) {
    const key = s.name.trim().toLowerCase();
    const g = groups.get(key) || { name: s.name.trim(), planned: 0, actual: 0, n: 0, pos: 0 };
    g.planned += s.planned_days; g.actual += stepDays(s, now); g.n += 1; g.pos += s.position;
    groups.set(key, g);
  }
  const byStep = [...groups.values()].filter((g) => g.n >= 2)
    .sort((a, b) => b.n - a.n).slice(0, 7).sort((a, b) => a.pos / a.n - b.pos / b.n)
    .map((g) => ({ name: g.name, planned: roundHalf(g.planned / g.n), actual: roundHalf(g.actual / g.n), samples: g.n }));

  // Indice de fiabilité : part des étapes livrées dans les délais (tolérance de 10 %, une demi-journée au moins), sur les chantiers terminés.
  const delivered = get("SELECT COUNT(*) AS n FROM sites WHERE artisan_id = ? AND status = 'delivered'", artisanId).n;
  const deliveredSteps = all(
    `SELECT st.planned_days, st.started_at, st.finished_at FROM steps st JOIN sites si ON si.id = st.site_id
     WHERE si.artisan_id = ? AND si.status = 'delivered' AND st.finished_at IS NOT NULL`, artisanId);
  const onTime = deliveredSteps.filter((s) => stepDays(s, now) <= s.planned_days + Math.max(0.5, s.planned_days * 0.1)).length;
  const reliability = deliveredSteps.length ? Math.round((onTime / deliveredSteps.length) * 100) : null;

  const since28 = new Date(now - 28 * DAY).toISOString();
  const rep = get(
    `SELECT COUNT(*) AS sent, SUM(CASE WHEN r.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened FROM reports r
     JOIN sites si ON si.id = r.site_id WHERE si.artisan_id = ? AND r.sent_at >= ?`, artisanId, since28);
  const reportsRead = rep.sent ? Math.round(((rep.opened || 0) / rep.sent) * 100) : null;

  const lastUpdates = all(
    `SELECT u.site_id, MAX(u.created_at) AS last FROM updates u JOIN sites si ON si.id = u.site_id
     WHERE si.artisan_id = ? AND u.kind = 'post' GROUP BY u.site_id`, artisanId);
  const lastBySite = Object.fromEntries(lastUpdates.map((r) => [r.site_id, r.last]));

  return {
    sites: active.map((s) => ({ ...s, last_update_at: lastBySite[s.id] || null })),
    alerts: active.filter((s) => s.drift).map((s) => ({ site_id: s.id, site: s.name, location: s.location, client_short: s.client_short, step: s.running.name, actual: s.running.actual_days, planned: s.running.planned_days, overPct: s.overPct })),
    kpis: {
      active: active.length,
      starting: active.filter((s) => s.progress < 25).length,
      alerts: active.filter((s) => s.drift).length,
      avgDelay: Math.round(avgDelay * 10) / 10,
      reportsRead
    },
    byStep,
    reliability: { pct: reliability, delivered, steps: deliveredSteps.length }
  };
}

module.exports = { stepStatus, stepDays, decorateStep, summarize, siteWithSummary, dashboard, DAY };
