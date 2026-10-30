// Pays acceptés à l'inscription et numéro d'entreprise attendu pour chacun.
// En France, en Belgique et en Suisse, le numéro est obligatoire et vérifié (clé de contrôle).
// En Afrique de l'Ouest, beaucoup d'entreprises du BTP ne sont pas encore immatriculées : le numéro est facultatif.

const digits = (s) => String(s || "").replace(/[\s.\-/]/g, "");

function luhn(num) {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

// SIRET : 14 chiffres, clé de Luhn. Exception de La Poste (SIREN 356000000) : somme des chiffres multiple de 5.
function siret(v) {
  const n = digits(v);
  if (!/^\d{14}$/.test(n)) return null;
  if (n.startsWith("356000000")) return [...n].reduce((a, d) => a + Number(d), 0) % 5 === 0 ? n : null;
  return luhn(n) ? n : null;
}
// Numéro d'entreprise belge (BCE) : 10 chiffres, les 2 derniers = 97 - (8 premiers modulo 97).
function bce(v) {
  let n = digits(v).replace(/^BE/i, "");
  if (/^\d{9}$/.test(n)) n = "0" + n;
  if (!/^[01]\d{9}$/.test(n)) return null;
  return 97 - (Number(n.slice(0, 8)) % 97) === Number(n.slice(8)) ? n : null;
}
// IDE suisse : CHE + 9 chiffres, clé modulo 11 sur les 8 premiers.
function ide(v) {
  const n = digits(v).replace(/^CHE/i, "");
  if (!/^\d{9}$/.test(n)) return null;
  const w = [5, 4, 3, 2, 7, 6, 5, 4];
  const r = 11 - (w.reduce((a, x, i) => a + x * Number(n[i]), 0) % 11);
  const key = r === 11 ? 0 : r;
  return key !== 10 && key === Number(n[8]) ? "CHE" + n : null;
}
const loose = (min, max) => (v) => { const n = String(v || "").trim().toUpperCase(); return n.length >= min && n.length <= max && /^[A-Z0-9][A-Z0-9 .\-/]*$/.test(n) ? n : null; };

const COUNTRIES = {
  FR: { name: "France", market: "eu", id: "SIRET", hint: "14 chiffres, sur votre extrait Kbis ou avis de situation Insee", required: true, check: siret },
  BE: { name: "Belgique", market: "eu", id: "Numéro d'entreprise (BCE)", hint: "10 chiffres, ex. 0123 456 749", required: true, check: bce },
  CH: { name: "Suisse", market: "eu", id: "Numéro IDE", hint: "CHE suivi de 9 chiffres", required: true, check: ide },
  LU: { name: "Luxembourg", market: "eu", id: "Numéro RCS", hint: "ex. B123456", required: true, check: loose(4, 12) },
  SN: { name: "Sénégal", market: "af", id: "NINEA", hint: "Facultatif si l'entreprise n'est pas encore immatriculée", required: false, check: loose(7, 14) },
  CI: { name: "Côte d'Ivoire", market: "af", id: "RCCM ou compte contribuable", hint: "Facultatif", required: false, check: loose(5, 30) },
  ML: { name: "Mali", market: "af", id: "RCCM ou NIF", hint: "Facultatif", required: false, check: loose(5, 30) },
  BF: { name: "Burkina Faso", market: "af", id: "RCCM ou IFU", hint: "Facultatif", required: false, check: loose(5, 30) },
  BJ: { name: "Bénin", market: "af", id: "RCCM ou IFU", hint: "Facultatif", required: false, check: loose(5, 30) },
  TG: { name: "Togo", market: "af", id: "RCCM ou NIF", hint: "Facultatif", required: false, check: loose(5, 30) },
  NE: { name: "Niger", market: "af", id: "RCCM ou NIF", hint: "Facultatif", required: false, check: loose(5, 30) }
};

// Renvoie { country, market, company_id } ou une erreur lisible.
function checkCompany(country, rawId) {
  const c = COUNTRIES[country];
  if (!c) return { error: "Choisissez le pays de votre entreprise." };
  const raw = String(rawId || "").trim();
  if (!raw) return c.required ? { error: `Indiquez votre ${c.id} : il est obligatoire pour une entreprise en ${c.name}.` } : { country, market: c.market, company_id: "" };
  const id = c.check(raw);
  if (!id) return { error: `${c.id} invalide : vérifiez les chiffres (${c.hint}).` };
  return { country, market: c.market, company_id: id };
}

const publicCountries = () => Object.entries(COUNTRIES).map(([code, c]) => ({ code, name: c.name, market: c.market, id: c.id, hint: c.hint, required: c.required }));

module.exports = { COUNTRIES, checkCompany, publicCountries, siret, bce, ide };
