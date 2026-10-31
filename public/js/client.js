// Page du client : lien privé, sans compte. Journal, étapes à valider, devis et factures, rapports du lundi.
(function () {
  "use strict";
  const { t, LOGO, ic, esc, prefs, footerLinks, dShort, dLong, nf, plural, api, toast, money, STATUS_CHIP, siteCard, journal, docsTable, moneyPanel } = window.AF;
  const app = document.getElementById("app");
  const token = location.pathname.split("/").pop();
  const days = (n) => t("{n} j", { n: nf(n) });
  let tab = "journal";
  let s = null;
  let viewer = null; // compte client connecté, s'il y en a un
  api("/api/me", { authRedirect: false }).then((m) => { viewer = m; if (s) render(); }).catch(() => {});
  const head = (right = "") => `<div class="chead"><span class="logo" style="color:var(--ink)">${LOGO(28)} Archfield</span><span class="chead-r">${prefs()}${right}</span></div>`;

  async function load() {
    try { s = await api("/api/c/" + encodeURIComponent(token), { authRedirect: false }); render(); }
    catch (e) { app.innerHTML = `${head()}<section class="card empty"><h2>${t("Lien indisponible")}</h2><p>${esc(e.message)}</p></section>`; }
  }

  function render() {
    document.title = s.name + " · Archfield";
    const cur = s.artisan.currency;
    const isClient = viewer && viewer.account_type === "client";
    const tabs = [["journal", "Journal"], ["etapes", "Étapes", s.toValidate], ["argent", "Argent", s.money.alert ? "!" : 0], ["rapports", "Rapports du lundi"]];
    let body;
    if (tab === "journal") body = journal(s, s.updates, { forClient: true });
    else if (tab === "etapes") {
      body = `<section class="card card-p"><ol class="steps">${s.steps.map((e, i) => {
        const late = e.status === "en_cours" && e.actual_days - e.planned_days >= 1;
        const d = e.status === "validee" || e.status === "a_valider" ? t("{a} réalisés pour {p} prévus", { a: days(e.actual_days), p: days(e.planned_days) })
          : e.status === "en_cours" ? t("En cours depuis {a}, {p} prévus", { a: days(e.actual_days), p: days(e.planned_days) }) : t("{n} prévus", { n: days(e.planned_days) });
        return `<li class="${e.status}"><span class="dot">${e.status === "validee" ? "✓" : i + 1}</span><div class="sb"><div class="st"><h3>${esc(e.name)}</h3>${late ? `<span class="chip warn">${t("En retard")}</span>` : STATUS_CHIP[e.status]}</div><p class="sd">${d}${e.amount ? " · " + t("versement prévu à la validation : {n}", { n: money(e.amount, cur) }) : ""}</p>
          ${e.status === "a_valider" ? `<div class="validate"><span>${t("{company} indique que cette étape est terminée. Regardez les photos du journal, puis validez.", { company: esc(s.artisan.company) })}</span><button type="button" class="btn ok" data-validate="${e.id}">${t("Valider l'étape")}</button></div>` : ""}</div></li>`;
      }).join("")}</ol></section>`;
    } else if (tab === "argent") {
      body = `${moneyPanel(s.money, { forClient: true })}
        <h2 class="section-t">${t("Devis et factures")}</h2><section class="card card-p">${docsTable(s.documents, cur)}</section>
        ${isClient ? "" : `<p class="muted" style="font-size:.84rem">${t("Pour noter vos propres versements et être alerté si vous payez plus vite que les travaux avancent, créez votre espace (2 mois offerts).")} <a href="/inscription">${t("Créer mon espace")}</a></p>`}`;
    } else {
      body = s.reports.length ? s.reports.map((r) => {
        const d = r.data;
        return `<section class="card card-p report">
          <div class="mail"><span>${t("Rapport du {date}", { date: dLong(r.sent_at) })}</span><span>${t("Semaine du {a} au {b}", { a: dShort(r.period_start), b: dShort(r.period_end) })}</span></div>
          <div class="figs"><div><b>${d.progress} %</b><span>${t("des travaux réalisés")}</span></div><div><b>${d.updates.length}</b><span>${d.updates.length > 1 ? t("mises à jour") : t("mise à jour")}</span></div><div><b>${d.photos}</b><span>${t("photos datées")}</span></div></div>
          <ul>${d.updates.map((u) => `<li><span class="muted">${dShort(u.date)}</span> · ${esc(u.text)}</li>`).join("") || `<li>${t("Aucune mise à jour cette semaine.")}</li>`}</ul>
          <p>${d.drift ? `<span class="chip warn">${t("Dérive")}</span> ${t("{step} : {n} de retard.", { step: esc(d.running.name), n: days(d.running.delay) })}` : `<span class="chip ok">${t("Dans les temps")}</span>`}${d.next ? " " + t("Étape suivante : {step}.", { step: `<b>${esc(d.next)}</b>` }) : ""}</p>
        </section>`;
      }).join("") : `<section class="card empty"><h3>${t("Pas encore de rapport")}</h3><p>${t("Un rapport de la semaine arrive ici chaque lundi matin.")}</p></section>`;
    }
    app.innerHTML = `
      ${isClient ? `<a class="back" href="/app#mes-chantiers">${ic("left", 16)} ${t("Mes chantiers")}</a>` : ""}
      ${head(`<span class="priv">${ic("lock", 14)} ${t("Lien privé")}</span>`)}
      ${siteCard(s, t("Réalisé par {company}", { company: s.artisan.company }))}
      <p class="pos-info">${s.position ? `${ic("check", 14, "var(--vert)")} ${t("Position du chantier enregistrée le {date} par {who} : chaque photo y est comparée.", { date: dShort(s.position.set_at), who: esc(s.position.set_by) })}` : t("Position du chantier pas encore enregistrée : elle le sera à la première publication faite sur place.")}</p>
      <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${t(l)}${n ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>
      ${body}
      ${s.tracking_code && !isClient ? `<section class="card card-p cl-space"><div><p class="label">${t("Numéro de suivi")}</p><b class="cl-code">${esc(s.tracking_code)}</b></div>
        <p class="muted">${t("Vous suivez plusieurs chantiers ? Créez votre espace gratuit et ajoutez-les avec leur numéro de suivi : tout au même endroit, sans garder les liens.")}</p>
        <div class="row-acts"><a class="btn primary" href="/inscription">${t("Créer mon espace gratuit")}</a><a class="btn ghost" href="/connexion">${t("J'ai déjà un compte")}</a></div></section>` : ""}
      <p class="muted" style="font-size:.74rem;text-align:center">${t("Ce lien est personnel. Ne le partagez qu'avec les personnes qui suivent le chantier avec vous.")}</p>
      <div class="foot-tools">${footerLinks()}</div>`;
  }

  app.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; render(); }
    else if (b.dataset.validate) {
      b.disabled = true;
      try { await api(`/api/c/${encodeURIComponent(token)}/steps/${b.dataset.validate}/validate`, { method: "POST", authRedirect: false }); toast(t("Étape validée. Votre artisan est prévenu.")); await load(); }
      catch (err) { toast(err.message); b.disabled = false; }
    }
  });
  load();
})();
