// Active à la main une offre (paiement reçu par Wave, Orange Money, virement…), ou nomme un administrateur.
//   npm run activate -- <e-mail ou téléphone> <offre> <mois>    ex. : npm run activate -- +2290197000000 pme 3
//   npm run admin -- <e-mail ou téléphone>                      donne l'accès à l'espace d'administration (/admin)
// Offres : plus (client), demarrage, pme, pro (entreprise). L'espace d'administration fait la même chose en ligne.
const { get, run } = require("./db");
const { PLANS } = require("./plans");
const { normalize } = require("./phone");

const args = process.argv.slice(2);
const find = (ident) => {
  if (!ident) return null;
  if (ident.includes("@")) return get("SELECT * FROM artisans WHERE email = ?", ident.toLowerCase());
  const p = normalize(ident);
  return p ? get("SELECT * FROM artisans WHERE phone = ?", p) : null;
};

if (args[0] === "--admin") {
  const a = find(args[1]);
  if (!a) { console.error("Usage : npm run admin -- <e-mail ou téléphone au format +229…>  (le compte doit exister)"); process.exit(1); }
  run("UPDATE artisans SET is_admin = 1 WHERE id = ?", a.id);
  console.log(`${a.contact_name} est administrateur : ouvrez /admin une fois connecté.`);
  process.exit(0);
}

const [ident, planArg, monthsArg] = args;
const a = find(ident);
// Ancienne forme : npm run activate -- client@example.com 2  (offre Plus, 2 mois)
const plan = PLANS[planArg] ? planArg : "plus";
const months = Number(PLANS[planArg] ? monthsArg || 1 : planArg || 1);
if (!a || !(months > 0)) {
  console.error("Usage : npm run activate -- <e-mail ou téléphone> <offre : plus, demarrage, pme, pro> <nombre de mois>");
  process.exit(1);
}
const audience = a.account_type === "client" ? "client" : a.account_type === "pro" ? "pro" : null;
if (PLANS[plan].audience !== audience) {
  console.error(audience ? `L'offre « ${plan} » n'est pas pour ce type de compte (${a.account_type}).` : "Les proches et les membres d'équipe ne paient pas : leur accès est offert par le chantier.");
  process.exit(1);
}
const start = Math.max(Date.now(), a.paid_until && a.plan === plan ? Date.parse(a.paid_until) : 0, Date.parse(a.trial_ends_at));
const until = new Date(start);
until.setMonth(until.getMonth() + months);
run("UPDATE artisans SET paid_until = ?, plan = ?, sub_status = 'manual' WHERE id = ?", until.toISOString(), plan, a.id);
console.log(`${a.contact_name} (${a.email || a.phone}) : ${PLANS[plan].name} active jusqu'au ${until.toLocaleDateString("fr-FR")}.`);
