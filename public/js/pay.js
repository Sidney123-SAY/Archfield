// Paiement de test : utilisé quand Stripe n'est pas configuré (tests en local). Aucun argent ne bouge,
// aucune carte n'est demandée : un bouton confirme le paiement et active l'offre pour 30 jours.
(function () {
  "use strict";
  const { t, ic, esc, api, price, LOGO, toast } = window.AF;
  const box = document.getElementById("pay");
  const id = new URLSearchParams(location.search).get("session") || "";
  const PLAN = { plus: "Plus", demarrage: "Démarrage", pme: "PME", pro: "Pro" };
  api("/api/billing/test-session/" + encodeURIComponent(id), { authRedirect: false }).then((s) => {
    const back = s.plan === "plus" ? "/app#offre" : "/app#compte";
    box.innerHTML = `<a class="logo" href="/app">${LOGO(26)} Archfield</a>
      <section class="card card-p pay-card">
        <p class="pay-test">${ic("shield", 16)} ${t("Mode test : aucun paiement réel")}</p>
        <h1>${t("Abonnement {plan}", { plan: t(PLAN[s.plan] || s.plan) })}</h1>
        <p class="pay-amount">${price(s.amount, s.currency)} <small>${t("/ mois")}${s.currency === "eur" ? " " + t("TTC") : ""}</small></p>
        <p class="muted">${t("Pour {who}. En production, cette page est remplacée par la page de paiement sécurisée de Stripe (carte Visa, Mastercard…).", { who: esc(s.who) })}</p>
        ${s.completed ? `<p class="okbox">${ic("check", 18)} ${t("Paiement déjà confirmé.")}</p><a class="btn primary" href="${back}">${t("Retour à Archfield")}</a>`
          : `<button type="button" class="btn primary pay-go" id="go">${t("Simuler le paiement")}</button><a class="btn ghost" href="/app?paiement=annule${back.slice(4)}">${t("Annuler")}</a>`}
      </section>`;
    const go = document.getElementById("go");
    if (go) go.addEventListener("click", async () => {
      go.disabled = true;
      try { await api("/api/billing/test-complete", { method: "POST", body: { session: id } }); location.href = "/app?paiement=ok" + back.slice(4); }
      catch (e) { toast(e.message); go.disabled = false; }
    });
  }).catch((e) => { box.innerHTML = `<div class="error-box">${esc(e.message)}</div><a class="btn" href="/app">${t("Retour à Archfield")}</a>`; });
})();
