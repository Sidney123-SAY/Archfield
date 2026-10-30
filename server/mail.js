// Envoi d'e-mails. Sans SMTP_URL, rien ne part : le message est affiché dans les journaux du serveur et gardé en mémoire (tests).
const nodemailer = require("nodemailer");

const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
const FROM = process.env.MAIL_FROM || "Archfield <ne-pas-repondre@archfield.app>";
const BASE_URL = (process.env.BASE_URL || "http://localhost:" + (process.env.PORT || 3000)).replace(/\/$/, "");
const outbox = [];

async function sendMail({ to, subject, text }) {
  if (!to) return false;
  if (!transport) {
    outbox.push({ to, subject, text });
    if (outbox.length > 50) outbox.shift();
    if (process.env.NODE_ENV !== "test") console.log(`[e-mail non envoyé, SMTP_URL absent] À : ${to} · ${subject}\n${text}\n`);
    return false;
  }
  try {
    await transport.sendMail({ from: FROM, to, subject, text });
    return true;
  } catch (e) {
    console.error(`E-mail à ${to} non envoyé : ${e.message}`);
    return false;
  }
}

module.exports = { sendMail, outbox, BASE_URL, mailEnabled: !!transport };
