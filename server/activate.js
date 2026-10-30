// Active un abonnement à la main, en attendant le paiement en ligne.
// Entreprise : npm run activate -- artisan@example.com 1            (1 mois)
// Client     : npm run activate -- client@example.com 1 premium    (offre basic ou premium)
const { get, run } = require("./db");

const [email, months = "1", plan] = process.argv.slice(2);
const a = email && get("SELECT * FROM artisans WHERE email = ?", email.toLowerCase());
if (!a || !(Number(months) > 0)) {
  console.error("Usage : npm run activate -- <e-mail> <nombre de mois> [basic|premium pour un client]");
  process.exit(1);
}
if (a.account_type === "client" && !["basic", "premium"].includes(plan)) {
  console.error("Pour un compte client, précisez l'offre : basic ou premium.");
  process.exit(1);
}
if (a.account_type === "proche") {
  console.error("Un proche ne paie pas : c'est le client qui lui a confié le chantier qui active son offre.");
  process.exit(1);
}
const start = Math.max(Date.now(), a.paid_until ? Date.parse(a.paid_until) : 0, a.account_type === "pro" ? Date.parse(a.trial_ends_at) : 0);
const until = new Date(start);
until.setMonth(until.getMonth() + Number(months));
run("UPDATE artisans SET paid_until = ?, plan = ? WHERE id = ?", until.toISOString(), plan || a.plan, a.id);
console.log(`${a.company} (${a.email}) : ${plan ? "offre " + plan + " active" : "abonnement actif"} jusqu'au ${until.toLocaleDateString("fr-FR")}.`);
