// Active l'abonnement d'un artisan à la main, en attendant le paiement en ligne.
// Usage : npm run activate -- artisan@example.com 1    (ajoute 1 mois)
const { get, run } = require("./db");

const [email, months = "1"] = process.argv.slice(2);
const a = email && get("SELECT * FROM artisans WHERE email = ?", email.toLowerCase());
if (!a || !(Number(months) > 0)) {
  console.error("Usage : npm run activate -- <e-mail de l'artisan> <nombre de mois>");
  process.exit(1);
}
const start = Math.max(Date.now(), a.paid_until ? Date.parse(a.paid_until) : 0, Date.parse(a.trial_ends_at));
const until = new Date(start);
until.setMonth(until.getMonth() + Number(months));
run("UPDATE artisans SET paid_until = ? WHERE id = ?", until.toISOString(), a.id);
console.log(`${a.company} (${a.email}) : abonnement actif jusqu'au ${until.toLocaleDateString("fr-FR")}.`);
