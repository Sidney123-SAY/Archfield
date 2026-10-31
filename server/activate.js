// Active à la main l'offre Plus d'un client, en attendant le paiement en ligne.
// Usage : npm run activate -- client@example.com 1      (1 mois)
// Les entreprises et les proches ne paient pas.
const { get, run } = require("./db");

const [email, months = "1"] = process.argv.slice(2);
const a = email && get("SELECT * FROM artisans WHERE email = ?", email.toLowerCase());
if (!a || !(Number(months) > 0)) {
  console.error("Usage : npm run activate -- <e-mail du client> <nombre de mois>");
  process.exit(1);
}
if (a.account_type !== "client") {
  console.error("Seuls les clients paient l'offre Plus : les entreprises et les proches utilisent Archfield gratuitement.");
  process.exit(1);
}
const start = Math.max(Date.now(), a.paid_until ? Date.parse(a.paid_until) : 0, Date.parse(a.trial_ends_at));
const until = new Date(start);
until.setMonth(until.getMonth() + Number(months));
run("UPDATE artisans SET paid_until = ?, plan = 'plus' WHERE id = ?", until.toISOString(), a.id);
console.log(`${a.contact_name} (${a.email}) : offre Plus active jusqu'au ${until.toLocaleDateString("fr-FR")}.`);
