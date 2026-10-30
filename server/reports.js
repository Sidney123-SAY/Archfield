// Rapport hebdomadaire : généré chaque lundi à 7 h UTC (8 h à Paris en hiver, 7 h à Dakar) pour chaque chantier actif.
const nodemailer = require("nodemailer");
const { all, get, run } = require("./db");
const { siteWithSummary, DAY } = require("./analytics");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
const MAIL_FROM = process.env.MAIL_FROM || "Archfield <rapports@archfield.app>";

function lastMonday(now = Date.now()) {
  const d = new Date(now);
  d.setUTCHours(7, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (d.getTime() > now) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

function buildReport(site, start, end, now = Date.now()) {
  const s = siteWithSummary(site, now);
  const posts = all(
    `SELECT u.id, u.text, u.created_at, st.name AS step FROM updates u LEFT JOIN steps st ON st.id = u.step_id
     WHERE u.site_id = ? AND u.kind = 'post' AND u.created_at >= ? AND u.created_at < ? ORDER BY u.created_at`,
    site.id, start.toISOString(), end.toISOString());
  const photos = get(
    `SELECT COUNT(*) AS n FROM photos p JOIN updates u ON u.id = p.update_id
     WHERE u.site_id = ? AND u.created_at >= ? AND u.created_at < ?`, site.id, start.toISOString(), end.toISOString()).n;
  const next = s.steps.find((x) => x.status === "a_venir");
  return {
    progress: s.progress,
    updates: posts.map((p) => ({ date: p.created_at, step: p.step, text: p.text })),
    photos,
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
  data.updates.forEach((u) => lines.push(`- ${u.date.slice(0, 10)} · ${u.text}`));
  if (!data.updates.length) lines.push("Aucune mise à jour cette semaine. Votre artisan a été relancé.");
  lines.push("", `Voir les photos et valider les étapes : ${BASE_URL}/c/${site.client_token}`);
  return lines.join("\n");
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
  if (transport && site.client_email) {
    const artisan = get("SELECT * FROM artisans WHERE id = ?", site.artisan_id);
    try {
      await transport.sendMail({ from: MAIL_FROM, to: site.client_email, subject: `${site.name} : votre semaine de chantier`, text: reportText(site, artisan, data) });
      run("UPDATE reports SET emailed = 1 WHERE id = ?", id);
    } catch (e) {
      console.error(`Rapport ${id} : l'e-mail n'est pas parti (${e.message})`);
    }
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
