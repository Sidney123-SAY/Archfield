// Page du client : lien privé, sans compte. Journal, étapes à valider, devis et factures, rapports du lundi.
(function () {
  "use strict";
  const { LOGO, ic, esc, dShort, dLong, nf, api, toast, STATUS_CHIP, siteCard, journal, docsTable } = window.AF;
  const app = document.getElementById("app");
  const token = location.pathname.split("/").pop();
  let tab = "journal";
  let s = null;

  async function load() {
    try { s = await api("/api/c/" + encodeURIComponent(token), { authRedirect: false }); render(); }
    catch (e) { app.innerHTML = `<div class="chead"><span class="logo" style="color:var(--encre)">${LOGO(28)} Archfield</span></div><section class="card empty"><h2>Lien indisponible</h2><p>${esc(e.message)}</p></section>`; }
  }

  function render() {
    document.title = s.name + " · Archfield";
    const cur = s.artisan.currency;
    const tabs = [["journal", "Journal"], ["etapes", "Étapes", s.toValidate], ["documents", "Devis et factures"], ["rapports", "Rapports du lundi"]];
    let body;
    if (tab === "journal") body = journal(s, s.updates, { forClient: true, who: "vous" });
    else if (tab === "etapes") {
      body = `<section class="card card-p"><ol class="steps">${s.steps.map((e, i) => {
        const late = e.status === "en_cours" && e.actual_days - e.planned_days >= 1;
        const d = e.status === "validee" || e.status === "a_valider" ? `${nf(e.actual_days)} j réalisés pour ${nf(e.planned_days)} prévus` : e.status === "en_cours" ? `En cours depuis ${nf(e.actual_days)} j, ${nf(e.planned_days)} prévus` : `${nf(e.planned_days)} j prévus`;
        return `<li class="${e.status}"><span class="dot">${e.status === "validee" ? "✓" : i + 1}</span><div class="sb"><div class="st"><h3>${esc(e.name)}</h3>${late ? '<span class="chip warn">En retard</span>' : STATUS_CHIP[e.status]}</div><p class="sd">${d}</p>
          ${e.status === "a_valider" ? `<div class="validate"><span>${esc(s.artisan.company)} indique que cette étape est terminée. Regardez les photos du journal, puis validez.</span><button type="button" class="btn ok" data-validate="${e.id}">Valider l'étape</button></div>` : ""}</div></li>`;
      }).join("")}</ol></section>`;
    } else if (tab === "documents") {
      const paid = s.documents.filter((d) => d.status === "payee").reduce((a, d) => a + d.amount, 0);
      const quoted = s.documents.filter((d) => d.kind === "devis" && d.status === "signe").reduce((a, d) => a + d.amount, 0);
      body = `<section class="card card-p">${docsTable(s.documents, cur)}${quoted ? `<p class="muted" style="font-size:.8rem;margin-top:10px">Vous avez payé ${Math.round((paid / quoted) * 100)} % des devis signés, pour ${s.progress} % des travaux réalisés.</p>` : ""}</section>`;
    } else {
      body = s.reports.length ? s.reports.map((r) => {
        const d = r.data;
        return `<section class="card card-p report">
          <div class="mail"><span>Rapport du ${dLong(r.sent_at)}</span><span>Semaine du ${dShort(r.period_start)} au ${dShort(r.period_end)}</span></div>
          <div class="figs"><div><b>${d.progress} %</b><span>des travaux réalisés</span></div><div><b>${d.updates.length}</b><span>mise${d.updates.length > 1 ? "s" : ""} à jour</span></div><div><b>${d.photos}</b><span>photos datées</span></div></div>
          <ul>${d.updates.map((u) => `<li><span class="muted">${dShort(u.date)}</span> · ${esc(u.text)}</li>`).join("") || "<li>Aucune mise à jour cette semaine.</li>"}</ul>
          <p>${d.drift ? `<span class="chip warn">Dérive</span> ${esc(d.running.name)} : ${nf(d.running.delay)} j de retard.` : '<span class="chip ok">Dans les temps</span>'}${d.next ? ` Étape suivante : <b>${esc(d.next)}</b>.` : ""}</p>
        </section>`;
      }).join("") : `<section class="card empty"><h3>Pas encore de rapport</h3><p>Un rapport de la semaine arrive ici chaque lundi matin.</p></section>`;
    }
    const rel_ = s.artisan.reliability;
    app.innerHTML = `
      <div class="chead"><span class="logo" style="color:var(--encre)">${LOGO(28)} Archfield</span><span class="priv">${ic("lock", 14)} Lien privé</span></div>
      ${siteCard(s, "Réalisé par " + s.artisan.company)}
      ${rel_.pct != null ? `<p class="muted" style="font-size:.8rem">${esc(s.artisan.company)} : ${rel_.pct} % des étapes livrées dans les délais sur ${rel_.delivered} chantier${rel_.delivered > 1 ? "s" : ""} terminé${rel_.delivered > 1 ? "s" : ""} avec Archfield.</p>` : ""}
      <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}${n ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>
      ${body}
      <p class="muted" style="font-size:.74rem;text-align:center">Ce lien est personnel. Ne le partagez qu'avec les personnes qui suivent le chantier avec vous.</p>`;
  }

  app.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; render(); }
    else if (b.dataset.validate) {
      b.disabled = true;
      try { await api(`/api/c/${encodeURIComponent(token)}/steps/${b.dataset.validate}/validate`, { method: "POST", authRedirect: false }); toast("Étape validée. Votre artisan est prévenu."); await load(); }
      catch (err) { toast(err.message); b.disabled = false; }
    }
  });
  load();
})();
