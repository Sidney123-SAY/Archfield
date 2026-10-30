// Page du client : lien privé, sans compte. Journal, étapes à valider, devis et factures, rapports du lundi.
(function () {
  "use strict";
  const { t, LOGO, ic, esc, prefs, footerLinks, dShort, dLong, nf, plural, api, toast, STATUS_CHIP, siteCard, journal, docsTable } = window.AF;
  const app = document.getElementById("app");
  const token = location.pathname.split("/").pop();
  const days = (n) => t("{n} j", { n: nf(n) });
  let tab = "journal";
  let s = null;
  const head = (right = "") => `<div class="chead"><span class="logo" style="color:var(--ink)">${LOGO(28)} Archfield</span><span class="chead-r">${prefs()}${right}</span></div>`;

  async function load() {
    try { s = await api("/api/c/" + encodeURIComponent(token), { authRedirect: false }); render(); }
    catch (e) { app.innerHTML = `${head()}<section class="card empty"><h2>${t("Lien indisponible")}</h2><p>${esc(e.message)}</p></section>`; }
  }

  function render() {
    document.title = s.name + " · Archfield";
    const cur = s.artisan.currency;
    const tabs = [["journal", "Journal"], ["etapes", "Étapes", s.toValidate], ["documents", "Devis et factures"], ["rapports", "Rapports du lundi"]];
    let body;
    if (tab === "journal") body = journal(s, s.updates, { forClient: true });
    else if (tab === "etapes") {
      body = `<section class="card card-p"><ol class="steps">${s.steps.map((e, i) => {
        const late = e.status === "en_cours" && e.actual_days - e.planned_days >= 1;
        const d = e.status === "validee" || e.status === "a_valider" ? t("{a} réalisés pour {p} prévus", { a: days(e.actual_days), p: days(e.planned_days) })
          : e.status === "en_cours" ? t("En cours depuis {a}, {p} prévus", { a: days(e.actual_days), p: days(e.planned_days) }) : t("{n} prévus", { n: days(e.planned_days) });
        return `<li class="${e.status}"><span class="dot">${e.status === "validee" ? "✓" : i + 1}</span><div class="sb"><div class="st"><h3>${esc(e.name)}</h3>${late ? `<span class="chip warn">${t("En retard")}</span>` : STATUS_CHIP[e.status]}</div><p class="sd">${d}</p>
          ${e.status === "a_valider" ? `<div class="validate"><span>${t("{company} indique que cette étape est terminée. Regardez les photos du journal, puis validez.", { company: esc(s.artisan.company) })}</span><button type="button" class="btn ok" data-validate="${e.id}">${t("Valider l'étape")}</button></div>` : ""}</div></li>`;
      }).join("")}</ol></section>`;
    } else if (tab === "documents") {
      const paid = s.documents.filter((d) => d.status === "payee").reduce((a, d) => a + d.amount, 0);
      const quoted = s.documents.filter((d) => d.kind === "devis" && d.status === "signe").reduce((a, d) => a + d.amount, 0);
      body = `<section class="card card-p">${docsTable(s.documents, cur)}${quoted ? `<p class="muted" style="font-size:.8rem;margin-top:10px">${t("Vous avez payé {a} % des devis signés, pour {b} % des travaux réalisés.", { a: Math.round((paid / quoted) * 100), b: s.progress })}</p>` : ""}</section>`;
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
    const rl = s.artisan.reliability;
    app.innerHTML = `
      ${head(`<span class="priv">${ic("lock", 14)} ${t("Lien privé")}</span>`)}
      ${siteCard(s, t("Réalisé par {company}", { company: s.artisan.company }))}
      ${rl.pct != null ? `<p class="muted" style="font-size:.8rem">${plural(rl.delivered, "{company} : {pct} % des étapes livrées dans les délais sur {n} chantier terminé avec Archfield.", "{company} : {pct} % des étapes livrées dans les délais sur {n} chantiers terminés avec Archfield.").replace("{company}", esc(s.artisan.company)).replace("{pct}", rl.pct)}</p>` : ""}
      <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${t(l)}${n ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>
      ${body}
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
