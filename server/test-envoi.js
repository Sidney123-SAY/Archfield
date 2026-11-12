// Vérifie les vrais envois : affiche la configuration, puis envoie un code à un numéro (SMS ou WhatsApp, Twilio)
// ou un e-mail de test (SMTP, par exemple Brevo).
//   npm run test-envoi -- +33612345678          code par le premier canal activé (SMS_CHANNELS)
//   npm run test-envoi -- +33612345678 sms      ou whatsapp
//   npm run test-envoi -- vous@example.com      e-mail de test
const phoneLib = require("./phone");
const { sendMail, mailEnabled } = require("./mail");

const [dest, channel] = process.argv.slice(2);
const ok = (b) => (b ? "oui" : "NON");
console.log("Configuration lue dans .env :");
console.log(`  SMS : SMS_PROVIDER=${phoneLib.PROVIDER || "(vide : codes écrits dans le journal, rien n'est envoyé)"}, canaux ${phoneLib.CHANNELS.join(" puis ")}`);
if (phoneLib.PROVIDER === "twilio") {
  console.log(`  Twilio : TWILIO_ACCOUNT_SID ${ok(process.env.TWILIO_ACCOUNT_SID)}, TWILIO_AUTH_TOKEN ${ok(process.env.TWILIO_AUTH_TOKEN)}, TWILIO_VERIFY_SID ${ok(process.env.TWILIO_VERIFY_SID)}`);
}
console.log(`  E-mail : SMTP_URL ${ok(mailEnabled)}, expéditeur ${process.env.MAIL_FROM || "(MAIL_FROM vide : Archfield <ne-pas-repondre@archfield.app>)"}`);
if (!dest) { console.log("\nIndiquez un numéro (+33…, +221…) ou une adresse e-mail : npm run test-envoi -- +33612345678"); process.exit(0); }

(async () => {
  if (dest.includes("@")) {
    if (!mailEnabled) throw new Error("SMTP_URL est vide : aucun e-mail ne peut partir.");
    const sent = await sendMail({ to: dest, subject: "Archfield : e-mail de test", text: "Bonjour,\n\nCet e-mail confirme que l'envoi d'Archfield fonctionne.\n" });
    if (!sent) throw new Error("L'e-mail n'est pas parti : voir le message ci-dessus (identifiant SMTP, clé, ou expéditeur non validé chez Brevo).");
    console.log(`\nE-mail envoyé à ${dest}. Regardez aussi dans les courriers indésirables.`);
    return;
  }
  const phone = phoneLib.normalize(dest, null);
  if (!phone) throw new Error("Numéro illisible : écrivez-le avec l'indicatif, par exemple +33612345678 ou +221771234567.");
  if (!phoneLib.PROVIDER) console.log("\nAttention : SMS_PROVIDER est vide, le code ne sera écrit que ci-dessous.");
  const r = await phoneLib.sendCode(phone, "test", channel);
  console.log(`\nCode demandé pour ${phoneLib.pretty(phone)} par ${r.channel === "sms" ? "SMS" : "WhatsApp"}.${phoneLib.PROVIDER ? " Il doit arriver dans la minute." : ""}`);
})().catch((e) => { console.error("\nÉchec : " + e.message); process.exit(1); });

