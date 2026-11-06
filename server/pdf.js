// Rapport de la semaine en PDF, toujours sur fond blanc (à imprimer, à transmettre à une banque ou à un notaire).
const path = require("node:path");
const fs = require("node:fs");
const PDFDocument = require("pdfkit");
const { all, get, UPLOAD_DIR } = require("./db");
const { buildReport } = require("./reports");
const { moneyOf } = require("./money");
const { DAY } = require("./analytics");

const INK = "#14263D", MUTED = "#6B7079", LINE = "#DDD7CC", ACCENT = "#C2410C";
// Les polices intégrées du PDF ne connaissent pas les espaces fines des nombres français.
const clean = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/[’]/g, "'").replace(/[≥]/g, ">=");
const money = (n, cur) => clean(new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur || "EUR", maximumFractionDigits: 0 }).format(n));
const day = (d) => clean(new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d)));
const short = (d) => clean(new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(d)));
const WEATHER = { soleil: "soleil", nuageux: "nuageux", pluie: "pluie", orage: "orage", vent: "vent" };

function weeklyPdf(site, { end = new Date() } = {}) {
  const start = new Date(end.getTime() - 7 * DAY);
  const data = buildReport(site, start, end);
  const manager = get("SELECT company, contact_name, account_type FROM artisans WHERE id = ?", site.artisan_id) || {};
  const m = moneyOf(site, "", data.progress);
  const photos = all(`SELECT p.file FROM photos p JOIN updates u ON u.id = p.update_id WHERE u.site_id = ? AND u.visibility = 'all' AND u.created_at >= ? AND u.created_at < ?
    ORDER BY u.created_at DESC LIMIT 6`, site.id, start.toISOString(), end.toISOString()).map((p) => path.join(UPLOAD_DIR, path.basename(p.file))).filter((f) => /\.(jpe?g|png)$/i.test(f) && fs.existsSync(f));

  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `${clean(site.name)} - semaine du ${day(start)}`, Author: "Archfield" }, bufferPages: true });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const W = doc.page.width - 96;

  // En-tête
  doc.fillColor(ACCENT).fontSize(9).font("Helvetica-Bold").text("ARCHFIELD", 48, 48, { characterSpacing: 1.5 });
  doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(clean(`Semaine du ${day(start)} au ${day(end)}`), 48, 48, { width: W, align: "right" });
  doc.moveDown(1.6);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(20).text("Rapport hebdomadaire", 48);
  doc.font("Helvetica").fontSize(11).fillColor(INK).text(clean(`${site.name}${site.location ? " · " + site.location : ""}`));
  doc.fillColor(MUTED).fontSize(9).text(clean(`Réalisé par ${manager.account_type === "pro" ? manager.company : manager.contact_name || ""} pour ${site.client_name}`));
  doc.moveDown(0.8);
  doc.moveTo(48, doc.y).lineTo(48 + W, doc.y).lineWidth(1.2).strokeColor(INK).stroke();
  doc.moveDown(0.8);

  // Chiffres clés
  const figs = [["Avancement", `${data.progress} %`], ["Dépenses approuvées", money(data.spent, site.currency)], ["Effectif moyen", data.workers_avg != null ? String(data.workers_avg) : "-"], ["Photos", String(data.photos)]];
  const top = doc.y, bw = (W - 3 * 10) / 4;
  figs.forEach(([k, v], i) => {
    const x = 48 + i * (bw + 10);
    doc.roundedRect(x, top, bw, 52, 4).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(k, x + 10, top + 9, { width: bw - 20 });
    doc.fillColor(INK).fontSize(15).font("Helvetica-Bold").text(v, x + 10, top + 24, { width: bw - 20 });
  });
  doc.y = top + 66; doc.x = 48;

  const section = (t) => { doc.moveDown(0.6); doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(t, 48); doc.moveDown(0.3); doc.font("Helvetica").fontSize(9.5).fillColor(INK); };
  section("Où en est le chantier");
  doc.text(clean(data.running ? `Étape en cours : ${data.running.name} (${data.running.actual} jours pour ${data.running.planned} prévus)${data.drift ? ", en retard sur le prévu" : ""}.` : data.toValidate ? "Étape terminée, en attente de validation par le client." : "Aucune étape en cours."), { width: W });
  if (data.next) doc.fillColor(MUTED).text(clean(`Étape suivante : ${data.next}.`), { width: W });
  if (m.budget) doc.fillColor(INK).text(clean(`Budget ${money(m.budget, site.currency)} · versé ${money(m.paid, site.currency)} · dépenses justifiées ${money(m.spent, site.currency)}.`), { width: W });

  section("Ce qui a été fait");
  if (!data.updates.length) doc.fillColor(MUTED).text("Aucune publication cette semaine.");
  for (const u of data.updates) {
    const head = clean(`${short(u.date)}${u.author ? " · " + u.author : ""}${u.topic === "rapport" ? " · rapport du jour" : ""}${u.workers != null ? ` · ${u.workers} ouvriers` : ""}${u.step ? " · " + u.step : ""}`);
    doc.fillColor(MUTED).fontSize(8.5).text(head, { width: W });
    doc.fillColor(INK).fontSize(9.5).text(clean(u.text || (u.topic === "rapport" ? "Rapport du jour (message vocal)" : "Photos du chantier")), { width: W });
    doc.moveDown(0.35);
  }
  if (data.deliveries.length) {
    section("Livraisons reçues");
    data.deliveries.forEach((d) => doc.text(clean(`${short(d.date)} · ${[d.quantity, d.label].filter(Boolean).join(" ")}`), { width: W }));
  }

  if (photos.length) {
    section("Photos de la semaine");
    const pw = (W - 2 * 8) / 3, ph = pw * 0.72;
    let y = doc.y;
    photos.forEach((f, i) => {
      if (i % 3 === 0 && i) y += ph + 8;
      if (y + ph > doc.page.height - 60) { doc.addPage(); y = 48; }
      try { doc.image(f, 48 + (i % 3) * (pw + 8), y, { cover: [pw, ph], align: "center", valign: "center" }); } catch (e) {}
    });
    doc.y = y + ph + 10;
  }

  // Pied de page sur chaque page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor(MUTED).fontSize(7.5).font("Helvetica").text(clean(`Généré avec Archfield le ${day(new Date())}`), 48, doc.page.height - 36, { width: W / 2, lineBreak: false });
    doc.text(`Page ${i + 1} / ${range.count}`, 48 + W / 2, doc.page.height - 36, { width: W / 2, align: "right", lineBreak: false });
  }
  doc.end();
  return new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
}

module.exports = { weeklyPdf };
