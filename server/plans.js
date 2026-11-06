// Offres et prix. Deux payeurs : le client protège son argent (Plus), l'entreprise pilote ses chantiers et son équipe.
//
// Prix par mois, en centimes. En Europe (UE, Suisse, Royaume-Uni…), le prix est en euros, TVA comprise.
// Ailleurs (Afrique, Amérique…), il est en dollars américains, taxes locales en plus s'il y en a.
// Pour changer un prix : modifiez ce fichier, redémarrez le serveur. Les abonnements déjà payés gardent leur prix.
const PLANS = {
  plus: { audience: "client", name: "Archfield Plus", eur: 999, usd: 999, proches: 5 },
  demarrage: { audience: "pro", name: "Archfield Démarrage", eur: 1500, usd: 1700, sites: 3, members: 3 },
  pme: { audience: "pro", name: "Archfield PME", eur: 3900, usd: 4500, sites: 10, members: 15 },
  pro: { audience: "pro", name: "Archfield Pro", eur: 7900, usd: 8900, sites: null, members: null }
};
// Entreprise sans abonnement : un chantier à elle, sans équipe. Les chantiers confiés par un client restent illimités.
const PRO_FREE = { sites: 1, members: 0 };
// Pendant l'essai de deux mois, une entreprise a les limites de l'offre PME.
const PRO_TRIAL_PLAN = "pme";

// Europe : prix en euros TTC. Liste des pays (code ISO) qui paient en euros.
const EUROPE = new Set("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK IS LI NO CH GB MC AD SM VA".split(" "));
const regionOf = (country, market) => (country ? (EUROPE.has(String(country).toUpperCase()) ? "eu" : "world") : market === "eu" ? "eu" : "world");
const currencyOf = (region) => (region === "eu" ? "eur" : "usd");
// Indication en francs CFA pour les clients d'Afrique de l'Ouest et centrale (le débit réel est en dollars).
const USD_XOF = Number(process.env.USD_XOF) || 600;

function priceOf(planId, region) {
  const p = PLANS[planId];
  if (!p) return null;
  const currency = currencyOf(region);
  const amount = p[currency];
  return { plan: planId, currency, amount, tax: currency === "eur" ? "inclusive" : "exclusive", fcfa: currency === "usd" ? Math.round((amount / 100) * USD_XOF / 100) * 100 : null };
}
const publicPlans = () => Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, sites: v.sites ?? null, members: v.members ?? null }]));

module.exports = { PLANS, PRO_FREE, PRO_TRIAL_PLAN, EUROPE, regionOf, currencyOf, priceOf, publicPlans, USD_XOF };
