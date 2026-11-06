// Rapport hebdomadaire : généré chaque lundi à 7 h UTC (8 h à Paris en hiver, 7 h à Dakar) pour chaque chantier actif.
const { all, get, run } = require("./db");
const { siteWithSummary, DAY } = require("./analytics");
const { sendMail, BASE_URL } = require("./mail");

function lastMonday(now = Date.now()) {
  const d = new Date(now);
  d.setUTCHours(7, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (d.getTime() > now) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

function buildReport(site, start, end, now = Date.now()) {
  const s = siteWithSummary(site, now);
  const range = [site.id, start.toISOString(), end.toISOString()];
  // Seulement ce que le client peut voir : les problèmes internes à l'équipe restent dehors.
  const posts = all(
    `SELECT u.id, u.text, u.created_at, u.topic, u.data, u.author_name, st.name AS step FROM updates u LEFT JOIN steps st ON st.id = u.step_id
     WHERE u.site_id = ? AND u.kind = 'post' AND u.visibility = 'all' AND u.created_at >= ? AND u.created_at < ? ORDER BY u.created_at`, ...range);
  const photos = get(
    `SELECT COUNT(*) AS n FROM photos p JOIN updates u ON u.id = p.update_id
     WHERE u.site_id = ? AND u.visibility = 'all' AND u.created_at >= ? AND u.created_at < ?`, ...range).n;
  const workers = posts.filter((p) => p.topic === "rapport" && p.data).map((p) => JSON.parse(p.data).workers).filter((n) => Number.isFinite(n));
  const deliveries = all(`SELECT d.label, d.quantity, d.created_at FROM deliveries d JOIN updates u ON u.id = d.update_id WHERE d.site_id = ? AND u.visibility = 'all' AND d.created_at >= ? AND d.created_at < ? ORDER BY d.created_at`, ...range);
  const spent = get(`SELECT COALESCE(SUM(amount), 0) AS n FROM ledger WHERE site_id = ? AND kind = 'depense' AND status = 'approuvee' AND cancelled_at IS NULL AND entry_date >= ? AND entry_date < ?`, site.id, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).n;
  const next = s.steps.find((x) => x.status === "a_venir");
  return {
    progress: s.progress,
    updates: posts.map((p) => ({ date: p.created_at, step: p.step, text: p.text, topic: p.topic, author: p.author_name, workers: p.data ? JSON.parse(p.data).workers ?? null : null })),
    photos,
    reports: posts.filter((p) => p.topic === "rapport").length,
    workers_avg: workers.length ? Math.round(workers.reduce((a, n) => a + n, 0) / workers.length) : null,
    deliveries: deliveries.map((d) => ({ label: d.label, quantity: d.quantity, date: d.created_at })),
    spent,
    drift: s.drift,
    running: s.running ? { name: s.running.name, actual: s.running.actual_days, planned: s.running.planned_days, delay: s.delay } : null,
    next: next ? next.name : null,
    toValidate: s.toValidate
  };
}

function reportText(site, artisan, data) {
  const lines = [
    `Bonjour ${site.client_short},`, "",
    `Voici la semaine du chantier « ${site.name} » réalisé par ${artisan.company}.`, "",
    `Avancement : ${data.progress} %`,
    `Mises à jour publiées : ${data.updates.length}, photos : ${data.photos}`
  ];
  if (data.running) lines.push(`Étape en cours : ${data.running.name} (${data.running.actual} j pour ${data.running.planned} prévus)`);
  if (data.drift) lines.push(`Attention : cette étape a pris du retard.`);
  if (data.toValidate) lines.push(`${data.toValidate} étape(s) attendent votre validation.`);
  if (data.workers_avg != null) lines.push(`Ouvriers présents en moyenne : ${data.workers_avg}`);
  if (data.deliveries?.length) lines.push(`Livraisons : ${data.deliveries.map((d) => [d.quantity, d.label].filter(Boolean).join(" ")).join(", ")}`);
  data.updates.forEach((u) => lines.push(`- ${u.date.slice(0, 10)} · ${u.text || (u.topic === "rapport" ? "Rapport du jour" : "Photos")}`));
  if (!data.updates.length) lines.push(data.reminded ? `Aucune mise à jour cette semaine. ${artisan.company} a reçu une relance par e-mail.` : "Aucune mise à jour cette semaine.");
  lines.push("", `Voir les photos et valider les étapes : ${BASE_URL}/c/${site.client_token}`, `Le rapport en PDF : ${BASE_URL}/api/c/${site.client_token}/rapport.pdf`);
  return lines.join("\n");
}

function remindManager(site, artisan) {
  return sendMail({
    to: artisan.email, subject: `${site.name} : votre client attend des nouvelles`,
    text: `Bonjour ${artisan.contact_name},\n\nRien n'a été publié cette semaine sur le chantier « ${site.name} ». ${site.client_short} reçoit ce matin son rapport du lundi, qui l'indique.\n\nUne photo et une phrase suffisent pour le rassurer : ${BASE_URL}/app#chantier-${site.id}\n\nArchfield`
  });
}

async function sendReport(site, force = false, now = Date.now()) {
  const end = force ? new Date(now) : lastMonday(now);
  const start = new Date(end.getTime() - 7 * DAY);
  const data = buildReport(site, start, end, now);
  const r = run(
    `INSERT INTO reports (site_id, period_start, period_end, data, sent_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (site_id, period_end) DO NOTHING`,
    site.id, start.toISOString(), end.toISOString(), JSON.stringify(data), new Date(now).toISOString());
  if (!r.changes) return null;
  const id = Number(r.lastInsertRowid);
  const artisan = get("SELECT * FROM artisans WHERE id = ?", site.artisan_id);
  // Une étape est en cours mais rien n'a été publié de la semaine : le gestionnaire est relancé (une fois par rapport,
  // grâce à la ligne unique ci-dessus), sauf rapport demandé à la main ou chantier géré par son propriétaire.
  if (!force && !data.updates.length && data.running && site.artisan_id !== site.owner_id) {
    data.reminded = await remindManager(site, artisan);
    if (data.reminded) run("UPDATE reports SET data = ? WHERE id = ?", JSON.stringify(data), id);
  }
  if (site.client_email) {
    if (await sendMail({ to: site.client_email, subject: `${site.name} : votre semaine de chantier`, text: reportText(site, artisan, data) }))
      run("UPDATE reports SET emailed = 1 WHERE id = ?", id);
  }
  return id;
}

async function runWeekly(now = Date.now()) {
  const end = lastMonday(now).toISOString();
  const due = all(
    `SELECT * FROM sites s WHERE s.status = 'active' AND s.created_at < ?
     AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.site_id = s.id AND r.period_end = ?)`, end, end);
  for (const site of due) await sendReport(site, false, now);
  return due.length;
}

function startScheduler() {
  const tick = () => runWeekly().then((n) => n && console.log(`${n} rapport(s) hebdomadaire(s) envoyé(s)`)).catch((e) => console.error(e));
  tick();
  return setInterval(tick, 15 * 60 * 1000);
}

module.exports = { lastMonday, buildReport, sendReport, runWeekly, startScheduler };
