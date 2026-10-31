// Application artisan : tableau de bord, chantiers, journal, photos, clients, compte.
(function () {
  "use strict";
  const { t, LOGO, ic, esc, prefs, themeToggle, installCard, installNudge, exifOf, position, moneyPanel, depenseForm, versementForm, curLabel, money, fmt, dShort, nf, cap, plural, rel, api, upload, shrink, toast, copy, STATUS_CHIP, healthChip, siteCard, journal, docsTable } = window.AF;
  const $ = (s, el) => (el || document).querySelector(s);
  const app = $("#app");

  let me = null;
  let templates = null;
  let lastSiteId = null;
  let siteTab = "journal";
  const isMobile = () => window.matchMedia("(max-width: 760px)").matches;
  const clientUrl = (tok) => `${location.origin}/c/${tok}`;
  const siteLabel = (s) => [s.name, s.location.split(",")[0]].filter(Boolean).join(" — ");
  const days = (n) => t("{n} j", { n: nf(n) });
  const cur = () => curLabel(me.currency);

  /* ---------- Coquille ---------- */
  const NAV = [["tableau-de-bord", "Tableau de bord", "dash"], ["chantiers", "Chantiers", "home"], ["journal", "Journal", "list"], ["clients", "Clients", "users"], ["compte", "Compte", "user"]];
  const TABS = [["chantiers", "Chantiers", "home"], ["journal", "Journal", "list"], ["photos", "Photos", "photo"], ["compte", "Compte", "user"]];
  const isPro = () => me.account_type === "pro";
  const planLabel = () => (me.account_type === "proche" ? t("Accès offert par {who}", { who: esc((me.sponsors || []).join(", ") || "—") }) : t("Gratuit pour les entreprises"));
  const waLink = (phoneNumber, text) => `https://wa.me/${(phoneNumber || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
  const initials = (n) => n.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();

  function shell(section, body) {
    const sideOn = (k) => k === section || (k === "journal" && section === "chantier") || (k === "chantiers" && section === "nouveau-chantier");
    const tabOn = (k) => k === section || (k === "chantiers" && ["tableau-de-bord", "nouveau-chantier", "clients"].includes(section)) || (k === "journal" && section === "chantier");
    app.innerHTML = `<div class="shell">
      <aside class="side">
        <a class="logo" href="#tableau-de-bord">${LOGO(24)} Archfield</a>
        <nav aria-label="${t("Menu")}">${NAV.map(([k, l, i]) => `<button type="button" data-go="${k}" ${sideOn(k) ? 'aria-current="page"' : ""}>${ic(i, 17)} ${t(l)}</button>`).join("")}</nav>
        <div class="who">
          <div class="side-prefs">${prefs()}</div>
          <div class="plan-card"><b>${esc(me.company)}</b><span>${planLabel()}</span></div>
          <button type="button" class="logout" data-logout>${t("Se déconnecter")}</button>
        </div>
      </aside>
      <div class="content">
        <div class="mhead"><a class="logo" href="#journal">${LOGO(30)} Archfield</a><span class="mhead-r">${themeToggle()}<a class="avatar" href="#compte" title="${esc(me.contact_name)}" style="text-decoration:none">${esc(initials(me.contact_name))}</a></span></div>
        <div class="content-in">${installNudge()}${outboxBar()}${body}</div>
      </div>
      <nav class="tabbar" aria-label="${t("Onglets")}">${TABS.map(([k, l, i]) => `<button type="button" data-go="${k}" ${tabOn(k) ? 'aria-current="page"' : ""}>${ic(i, 24)}<span>${t(l)}</span></button>`).join("")}</nav>
    </div>`;
  }
  const loading = (section) => shell(section, `<p class="loading">${t("Chargement…")}</p>`);
  const errorBox = (section, e) => shell(section, `<div class="error-box">${esc(e.message)}</div>`);

  /* ---------- Tableau de bord ---------- */
  async function pageDashboard() {
    loading("tableau-de-bord");
    const d = await api("/api/dashboard");
    const sub = `${esc(me.company)}${me.city ? " · " + esc(me.city) : ""}`;
    if (!d.sites.length && d.reliability.delivered === 0) {
      return shell("tableau-de-bord", `<div class="pagehead"><div><p class="sub">${sub}</p><h1>${t("Tableau de bord")}</h1></div></div>
        ${!isPro() ? noSiteForProche() : ""}<section class="card empty" ${isPro() ? "" : "hidden"}><h2>${t("Créez votre premier chantier")}</h2><p>${t("Ajoutez le client et les étapes prévues. Archfield vous donne un lien privé à envoyer au client par WhatsApp ou par e-mail, sans compte à créer.")}</p><a class="btn primary" href="#nouveau-chantier">${ic("plus", 16)} ${t("Nouveau chantier")}</a></section>`);
    }
    const ecart = (s) => (s.running ? (s.delay > 0 ? "+" : "") + days(Math.max(0, s.delay)) : "—");
    const k = d.kpis;
    shell("tableau-de-bord", `
      <div class="pagehead"><div><p class="sub">${sub}</p><h1>${t("Tableau de bord")}</h1></div>
        <div class="acts"><span class="pill">${ic("cal", 15)} ${cap(fmt(Date.now(), { month: "long", year: "numeric" }))}</span>${isPro() ? `<a class="btn primary" href="#nouveau-chantier">${ic("plus", 15)} ${t("Nouveau chantier")}</a>` : ""}</div></div>
      <div class="kpis">
        <div class="card kpi"><span class="k">${t("Chantiers actifs")}</span><span class="v">${k.active}</span><span class="s">${t("{n} en démarrage", { n: k.starting })}</span></div>
        <div class="card kpi"><span class="k">${t("Alertes de dérive")}</span><span class="v ${k.alerts ? "warn" : ""}">${k.alerts}</span><span class="s">${t("Étapes à plus de 20 % du prévu")}</span></div>
        <div class="card kpi"><span class="k">${t("Retard moyen")}</span><span class="v">+${days(k.avgDelay)}</span><span class="s">${t("Par étape en cours")}</span></div>
        <div class="card kpi"><span class="k">${t("Rapports lus par les clients")}</span><span class="v">${k.reportsRead == null ? "—" : k.reportsRead + " %"}</span><span class="s">${t("Sur les 4 dernières semaines")}</span></div>
      </div>
      ${d.alerts.map((a) => `<div class="banner">${ic("warn", 18)}<div><b>${t("{site} : {step} dérape", { site: esc(a.site) + (a.location ? " — " + esc(a.location.split(",")[0]) : ""), step: esc(a.step.toLowerCase()) })}</b><br>${t("{actual} jours au lieu de {planned} prévus, soit {pct} % de plus. Prévenez {who} avant le rapport de lundi.", { actual: nf(a.actual), planned: nf(a.planned), pct: a.overPct, who: esc(a.client_short) })}</div><button type="button" class="btn" data-publish="${a.site_id}">${t("Prévenir")}</button></div>`).join("")}
      <section class="card card-p"><div class="card-h"><h2>${t("Chantiers en cours")}</h2></div>
        ${d.sites.length ? `<div class="tbl-wrap tbl-desk"><table><thead><tr><th>${t("Chantier")}</th><th>${t("Client")}</th><th>${t("Avancement")}</th><th>${t("Étape en cours")}</th><th>${t("Écart")}</th><th>${t("Statut")}</th></tr></thead><tbody>
        ${d.sites.map((s) => `<tr class="click" data-site="${s.id}"><td><b>${esc(siteLabel(s))}</b></td><td>${esc(s.client_name)}</td><td><span class="mini"><span class="t"><span style="width:${s.progress}%"></span></span><span class="num">${s.progress} %</span></span></td><td>${s.running ? esc(s.running.name) : s.toValidate ? t("À valider") : "—"}</td><td class="num">${ecart(s)}</td><td>${healthChip(s)}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="mcards">${d.sites.map((s) => `<button type="button" class="mcard" data-site="${s.id}"><span class="l1"><b>${esc(siteLabel(s))}</b>${healthChip(s)}</span><span class="track"><span style="width:${s.progress}%"></span></span><span class="l2">${esc(s.client_name)} · ${s.progress} % · ${s.running ? esc(s.running.name) + " (" + ecart(s) + ")" : "—"}</span></button>`).join("")}</div>`
        : `<p class="muted">${t("Aucun chantier en cours.")} <a href="#nouveau-chantier">${t("Créer un chantier")}</a></p>`}
      </section>`);
  }

  /* ---------- Liste des chantiers ---------- */
  async function pageSites() {
    loading("chantiers");
    const [active, delivered] = await Promise.all([api("/api/sites"), api("/api/sites?status=delivered")]);
    const card = (s) => `<div class="card card-p site">
      <div class="top"><div><h2>${esc(siteLabel(s))}</h2><p class="meta">${esc(s.client_name)}${s.client_city ? " · " + t("suit depuis {city}", { city: esc(s.client_city) }) : ""}</p></div>${s.status === "delivered" ? `<span class="chip ok">${t("Livré")}</span>` : healthChip(s)}</div>
      <span class="track"><span style="width:${s.progress}%"></span></span>
      <p class="meta">${s.progress} % · ${s.status === "delivered" ? t("livré le {date}", { date: dShort(s.delivered_at) }) : s.running ? t("Étape en cours : {step}", { step: esc(s.running.name) }) : s.toValidate ? t("Étape à valider par le client") : t("Aucune étape en cours")}${s.last_update_at ? " · " + t("dernière mise à jour {when}", { when: rel(s.last_update_at).toLowerCase() }) : ""}</p>
      <div class="row-acts"><a class="btn ghost" href="#chantier-${s.id}">${t("Ouvrir")}</a>${s.status === "active" ? `<button type="button" class="btn ghost" data-copy-link="${esc(s.client_token)}">${t("Copier le lien client")}</button><button type="button" class="btn primary" data-publish="${s.id}">${ic("cam", 15)} ${t("Mise à jour")}</button>` : ""}</div>
    </div>`;
    shell("chantiers", `<div class="pagehead"><div><p class="sub">${t("{a} en cours · {d}", { a: active.length, d: plural(delivered.length, "{n} livré", "{n} livrés") })}</p><h1>${t("Chantiers")}</h1></div>
      ${isPro() ? `<div class="acts"><a class="btn primary" href="#nouveau-chantier">${ic("plus", 15)} ${t("Nouveau chantier")}</a></div>` : ""}</div>
      ${isMobile() && isPro() ? `<a class="btn primary" href="#nouveau-chantier">${ic("plus", 15)} ${t("Nouveau chantier")}</a>` : ""}
      ${active.length ? `<div class="sites">${active.map(card).join("")}</div>` : isPro() ? `<section class="card empty"><h2>${t("Aucun chantier en cours")}</h2><p>${t("Créez un chantier pour obtenir le lien privé de votre client.")}</p><a class="btn primary" href="#nouveau-chantier">${t("Nouveau chantier")}</a></section>` : noSiteForProche()}
      ${delivered.length ? `<h2 class="section-t">${t("Chantiers livrés")}</h2><div class="sites">${delivered.map(card).join("")}</div>` : ""}`);
  }

  // Un proche ne crée pas de chantier : il gère ceux qu'on lui confie par invitation.
  const noSiteForProche = () => `<section class="card empty"><h2>${t("Pas encore de chantier")}</h2><p>${t("Le chantier qu'on vous confie apparaîtra ici dès que vous aurez accepté l'invitation.")}</p></section>`;

  /* ---------- Nouveau chantier ---------- */
  async function pageNewSite() {
    if (!isPro()) { history.replaceState(null, "", "#chantiers"); return pageSites(); }
    templates = templates || (await api("/api/templates"));
    const kind0 = me.market === "af" ? "ext" : "int";
    const af = me.market === "af";
    shell("nouveau-chantier", `<button type="button" class="back" data-go="chantiers">${ic("left", 16)} ${t("Chantiers")}</button>
      <div class="pagehead"><div><h1>${t("Nouveau chantier")}</h1><p class="sub">${t("Le client recevra un lien privé, sans compte à créer.")}</p></div></div>
      <form class="card card-p form" id="new-site" style="max-width:720px">
        <div class="row2">
          <div class="field"><label for="ns-name">${t("Nom du chantier")}</label><input id="ns-name" name="name" required maxlength="120" placeholder="${af ? "Villa Ndiaye" : t("Appartement T3")}"></div>
          <div class="field"><label for="ns-location">${t("Lieu")}</label><input id="ns-location" name="location" maxlength="120" placeholder="${af ? "Saly, Sénégal" : "Lyon 3e"}"></div>
        </div>
        <div class="field"><span class="fl">${t("Type de travaux")}</span><div class="seg-choice">
          <label><input type="radio" name="kind" value="ext" ${kind0 === "ext" ? "checked" : ""}><b>${t("Construction")}</b><span>${t("Terrassement, fondations, murs, toiture…")}</span></label>
          <label><input type="radio" name="kind" value="int" ${kind0 === "int" ? "checked" : ""}><b>${t("Rénovation")}</b><span>${t("Démolition, plomberie, électricité…")}</span></label></div></div>
        <div class="row2">
          <div class="field"><label for="ns-client">${t("Client")}</label><input id="ns-client" name="client_name" required maxlength="120" placeholder="Awa Ndiaye"></div>
          <div class="field"><label for="ns-short">${t("Comment l'appeler")}</label><input id="ns-short" name="client_short" maxlength="60" placeholder="${t("Awa, Mme Benali…")}"><span class="hint">${t("Utilisé dans les messages : « Vu par Awa ».")}</span></div>
        </div>
        <div class="row2">
          <div class="field"><label for="ns-email">${t("E-mail du client")}</label><input id="ns-email" name="client_email" type="email" maxlength="200" placeholder="${t("pour le rapport du lundi")}"></div>
          <div class="field"><label for="ns-phone">${t("WhatsApp du client")}</label><input id="ns-phone" name="client_phone" type="tel" maxlength="30" placeholder="+221 77 123 45 67" autocomplete="off"><span class="hint">${t("Avec l'indicatif du pays.")}</span></div>
        </div>
        <div class="field" style="max-width:360px"><label for="ns-city">${t("Ville du client")}</label><input id="ns-city" name="client_city" maxlength="120" placeholder="Paris"></div>
        <div class="field" style="max-width:260px"><label for="ns-budget">${t("Montant du devis ({cur})", { cur: cur() })}</label><input id="ns-budget" name="budget" type="number" min="0" step="1" inputmode="numeric"></div>
        <div class="field"><span class="fl">${t("Étapes et durées prévues (jours)")}</span><div class="step-rows" id="ns-steps"></div>
          <button type="button" class="btn ghost" id="ns-add" style="justify-self:start">${ic("plus", 14)} ${t("Ajouter une étape")}</button></div>
        <label class="check"><input type="checkbox" name="start_now" checked><span>${t("La première étape commence aujourd'hui")}</span></label>
        <div class="error-box" id="ns-err" hidden></div>
        <div class="acts" style="display:flex;gap:8px;justify-content:flex-end"><a class="btn ghost" href="#chantiers">${t("Annuler")}</a><button type="submit" class="btn primary">${t("Créer le chantier")}</button></div>
      </form>`);
    const rows = $("#ns-steps");
    const row = (name = "", d = "") => {
      const i = rows.children.length + 1;
      rows.insertAdjacentHTML("beforeend", `<div class="step-row"><span class="i">${i}</span><input aria-label="${t("Étape {i}", { i })}" maxlength="80" value="${esc(name)}" required><input aria-label="${t("Jours prévus, étape {i}", { i })}" type="number" min="0.5" max="365" step="0.5" value="${d}" required><button type="button" class="icon-btn" data-rm-row aria-label="${t("Retirer l'étape")}">${ic("x", 14)}</button></div>`);
    };
    const fill = (kind) => { rows.innerHTML = ""; templates[kind].forEach(([n, d]) => row(t(n), d)); };
    fill(kind0);
    const renumber = () => [...rows.children].forEach((r, i) => { r.querySelector(".i").textContent = i + 1; });
    $("#new-site").addEventListener("change", (e) => { if (e.target.name === "kind") fill(e.target.value); });
    $("#ns-add").addEventListener("click", () => { row(); rows.lastElementChild.querySelector("input").focus(); });
    rows.addEventListener("click", (e) => { const b = e.target.closest("[data-rm-row]"); if (b && rows.children.length > 1) { b.parentElement.remove(); renumber(); } });
    $("#new-site").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), btn = e.target.querySelector("[type=submit]");
      const body = Object.fromEntries(["name", "location", "kind", "client_name", "client_short", "client_email", "client_phone", "client_city", "budget"].map((k) => [k, f.get(k) || ""]));
      body.start_now = f.get("start_now") === "on";
      body.steps = [...rows.children].map((r) => { const [n, d] = r.querySelectorAll("input"); return { name: n.value, planned_days: Number(d.value) }; });
      btn.disabled = true;
      try {
        const s = await api("/api/sites", { method: "POST", body });
        siteTab = "partage";
        location.hash = "chantier-" + s.id;
        toast(t("Chantier créé. Envoyez le lien privé à votre client."));
      } catch (err) { const box = $("#ns-err"); box.textContent = err.message; box.hidden = false; btn.disabled = false; }
    });
  }

  /* ---------- Fiche chantier ---------- */
  async function pageSite(id) {
    loading("chantier");
    let s;
    try { s = await api("/api/sites/" + id); } catch (e) { return errorBox("chantier", e); }
    lastSiteId = s.id;
    try { localStorage.setItem("af-last-site", String(s.id)); } catch (e) {}
    const tabs = [["journal", "Journal"], ["etapes", "Étapes", s.toValidate], ["argent", "Argent", s.money.alert ? "!" : 0], ["partage", "Lien et rapports"]];
    const scur = curLabel(s.currency);
    let body = "";
    if (siteTab === "journal") body = `<h2 class="section-t">${t("Journal du chantier")}</h2>${journal(s, s.updates, { who: s.client_short })}`;
    else if (siteTab === "etapes") {
      const running = s.steps.some((x) => x.status === "en_cours");
      body = `<section class="card card-p"><ul class="manage">${s.steps.map((st, i) => {
        const late = st.status === "en_cours" && st.actual_days - st.planned_days >= 1;
        const meta = st.status === "a_venir" ? t("{n} prévus", { n: days(st.planned_days) })
          : st.status === "en_cours" ? t("Commencée le {date} · {a} sur {p} prévus", { date: dShort(st.started_at), a: days(st.actual_days), p: days(st.planned_days) })
          : t("{a} réalisés pour {p} prévus", { a: days(st.actual_days), p: days(st.planned_days) }) + (st.validated_at ? " · " + t("validée le {date}", { date: dShort(st.validated_at) }) : "");
        const amount = s.status === "delivered" || st.validated_at ? (st.amount ? `<span class="muted" style="font-size:.78rem">${t("Versement prévu : {n}", { n: money(st.amount, s.currency) })}</span>` : "")
          : `<label class="sr" style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem;color:var(--muted)">${t("Versement prévu")} <input type="number" min="0" step="1" value="${st.amount || ""}" placeholder="0" data-step-amount="${st.id}" style="width:7.5rem;border:1px solid var(--line);border-radius:8px;padding:5px 6px;background:var(--surface)" aria-label="${t("Versement prévu à la validation de {step}", { step: esc(st.name) })}"> ${scur}</label>`;
        const acts = s.status === "delivered" ? "" : st.status === "a_venir" ? `${running ? "" : `<button type="button" class="btn ghost" data-step-action="start" data-step="${st.id}">${t("Démarrer")}</button>`}<label class="sr" style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem;color:var(--muted)">${t("Prévu")} <input type="number" min="0.5" step="0.5" value="${st.planned_days}" data-step-days="${st.id}" style="width:4.5rem;border:1px solid var(--line);border-radius:8px;padding:5px 6px;background:var(--surface)" aria-label="${t("Jours prévus pour {step}", { step: esc(st.name) })}"> ${t("j")}</label><button type="button" class="btn ghost" data-step-del="${st.id}" aria-label="${t("Supprimer {step}", { step: esc(st.name) })}">${ic("x", 14)}</button>`
          : st.status === "en_cours" ? `<button type="button" class="btn" data-step-action="finish" data-step="${st.id}">${t("Terminer : demander la validation")}</button>`
          : st.status === "a_valider" ? `<span class="chip wait">${t("En attente du client")}</span><button type="button" class="btn ghost" data-step-action="reopen" data-step="${st.id}">${t("Rouvrir")}</button>` : "";
        return `<li class="${st.status}"><span class="pos">${st.status === "validee" ? "✓" : i + 1}</span><div><b>${esc(st.name)}</b> ${late ? `<span class="chip warn">${t("En retard")}</span>` : STATUS_CHIP[st.status]}<div class="meta">${meta}</div></div><div class="acts">${acts}${amount}</div></li>`;
      }).join("")}</ul>
      ${s.status === "active" ? `<form class="inline-add" id="add-step"><input name="name" required maxlength="80" placeholder="${t("Nouvelle étape")}" aria-label="${t("Nom de la nouvelle étape")}"><input name="days" type="number" min="0.5" step="0.5" required placeholder="${t("Jours")}" aria-label="${t("Jours prévus")}"><button class="btn" type="submit">${t("Ajouter")}</button></form>` : ""}</section>`;
    } else if (siteTab === "argent") {
      body = `${moneyPanel(s.money, { me: me.id })}
        ${depenseForm(scur)}
        ${s.owner ? "" : versementForm(scur, { received: true })}
        <h2 class="section-t">${t("Devis et factures")}</h2>
        <section class="card card-p">${docsTable(s.documents, s.currency, { editable: true })}</section>
        <form class="card card-p form" id="add-doc"><h2>${t("Ajouter un devis ou une facture")}</h2>
          <div class="row2"><div class="field"><label for="doc-kind">${t("Type")}</label><select id="doc-kind" name="kind"><option value="facture">${t("Facture")}</option><option value="devis">${t("Devis")}</option></select></div>
          <div class="field"><label for="doc-status">${t("Statut")}</label><select id="doc-status" name="status"><option value="a_regler">${t("À régler")}</option><option value="payee">${t("Payée")}</option></select></div></div>
          <div class="row2"><div class="field"><label for="doc-ref">${t("Référence")}</label><input id="doc-ref" name="ref" required maxlength="40" placeholder="F-2026-012"></div>
          <div class="field"><label for="doc-date">${t("Date")}</label><input id="doc-date" name="doc_date" type="date" required value="${new Date().toISOString().slice(0, 10)}"></div></div>
          <div class="field"><label for="doc-label">${t("Objet")}</label><input id="doc-label" name="label" required maxlength="160" placeholder="${t("Situation : fondations")}"></div>
          <div class="field" style="max-width:260px"><label for="doc-amount">${t("Montant ({cur})", { cur: scur })}</label><input id="doc-amount" name="amount" type="number" min="0" required inputmode="numeric"></div>
          <div><button class="btn primary" type="submit">${t("Ajouter")}</button></div></form>`;
    } else {
      const url = clientUrl(s.client_token);
      body = `<section class="card card-p share"><h2>${t("Numéro de suivi")}</h2>
          <div class="sp-code"><b>${esc(s.tracking_code)}</b><button type="button" class="btn ghost" data-copy-text="${esc(s.tracking_code)}">${t("Copier")}</button></div>
          <p class="muted" style="font-size:.86rem">${s.owner ? t("Ce chantier est dans l'espace client de {who}.", { who: esc(s.owner) }) : t("Votre client peut créer son espace gratuit sur Archfield et y ajouter ce chantier avec ce numéro : il retrouve tous ses chantiers au même endroit.")}</p></section>
        <section class="card card-p share"><h2>${t("Position du chantier")}</h2>
          <p class="muted" style="font-size:.86rem">${s.position ? t("Enregistrée le {date} par {who}, lors d'une publication sur place. Chaque photo est comparée à cette position.", { date: dShort(s.position.set_at), who: esc(s.position.set_by) }) : t("Pas encore enregistrée : elle le sera à la prochaine publication faite sur le chantier, avec la localisation du téléphone activée.")}</p>
          ${s.position && s.can_reset_position ? `<div><button type="button" class="btn ghost" data-reset-position="${s.id}">${t("Effacer la position")}</button></div>` : ""}</section>
        <section class="card card-p share"><h2>${t("Lien privé du client")}</h2>
          <p class="muted" style="font-size:.86rem">${t("{who} ouvre ce lien sans créer de compte. Envoyez-le par WhatsApp, SMS ou e-mail.", { who: esc(s.client_name) })}</p>
          <div class="link"><code>${esc(url)}</code><button type="button" class="btn ghost" data-copy-link="${esc(s.client_token)}">${t("Copier")}</button></div>
          <div class="row-acts"><a class="btn wa" href="${waLink(s.client_phone, t("Bonjour {who}, suivez l'avancement de votre chantier ici : {url}", { who: s.client_short, url }))}" target="_blank" rel="noopener">${t("Envoyer par WhatsApp")}</a><a class="btn ghost" href="/c/${esc(s.client_token)}" target="_blank" rel="noopener">${t("Voir la page du client")}</a><button type="button" class="btn ghost" data-new-link>${t("Changer de lien")}</button></div>
          <p class="muted" style="font-size:.78rem">${t("Dernière visite du client : {when}.", { when: s.last_client_visit_at ? rel(s.last_client_visit_at).toLowerCase() : t("pas encore") })}</p></section>
        <section class="card card-p share"><div class="card-h" style="margin:0"><h2>${t("Rapports du lundi")}</h2><button type="button" class="btn" data-send-report>${t("Envoyer un rapport maintenant")}</button></div>
          <p class="muted" style="font-size:.86rem">${s.client_email ? t("Un rapport part automatiquement chaque lundi matin à {email}. Il est toujours visible sur le lien privé.", { email: esc(s.client_email) }) : t("Un rapport part automatiquement chaque lundi matin. Ajoutez l'e-mail du client pour qu'il le reçoive aussi par e-mail. Il est toujours visible sur le lien privé.")}</p>
          ${s.reports.length ? `<div class="tbl-wrap"><table><thead><tr><th>${t("Semaine")}</th><th>${t("Envoyé")}</th><th>${t("Lu par le client")}</th></tr></thead><tbody>${s.reports.map((r) => `<tr><td>${t("{a} au {b}", { a: dShort(r.period_start), b: dShort(r.period_end) })}</td><td>${rel(r.sent_at)}${r.emailed ? " · " + t("e-mail") : ""}</td><td>${r.opened_at ? `<span class="chip ok">${t("Lu {when}", { when: rel(r.opened_at).toLowerCase() })}</span>` : `<span class="chip idle">${t("Pas encore")}</span>`}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">${t("Aucun rapport envoyé pour l'instant.")}</p>`}</section>
        <form class="card card-p form" id="edit-client"><h2>${t("Client")}</h2>
          <div class="row2"><div class="field"><label for="ec-name">${t("Nom")}</label><input id="ec-name" name="client_name" required value="${esc(s.client_name)}"></div><div class="field"><label for="ec-short">${t("Comment l'appeler")}</label><input id="ec-short" name="client_short" required value="${esc(s.client_short)}"></div></div>
          <div class="row2"><div class="field"><label for="ec-email">${t("E-mail")}</label><input id="ec-email" name="client_email" type="email" value="${esc(s.client_email)}"><span class="hint">${t("Pour les e-mails de mise à jour et le rapport du lundi.")}</span></div><div class="field"><label for="ec-phone">WhatsApp</label><input id="ec-phone" name="client_phone" type="tel" value="${esc(s.client_phone)}" placeholder="+33 6 12 34 56 78"></div></div>
          <div class="field" style="max-width:360px"><label for="ec-city">${t("Ville")}</label><input id="ec-city" name="client_city" value="${esc(s.client_city)}"></div>
          <div><button class="btn" type="submit">${t("Enregistrer")}</button></div></form>
        ${s.status === "active" ? `<section class="card card-p share"><h2>${t("Fin de chantier")}</h2><p class="muted" style="font-size:.86rem">${t("Quand toutes les étapes sont validées par le client, marquez le chantier comme livré. Il compte alors dans votre indice de fiabilité.")}</p><div><button type="button" class="btn" data-deliver>${t("Marquer comme livré")}</button></div></section>` : ""}
        ${s.owner ? `<section class="card card-p share"><h2>${t("Ne plus gérer ce chantier")}</h2><p class="muted" style="font-size:.86rem">${t("Le chantier appartient à {who} : il lui revient, avec tout son journal. Vous n'y aurez plus accès.", { who: esc(s.owner) })}</p><div><button type="button" class="btn danger" data-release="${s.id}">${t("Rendre le chantier à {who}", { who: esc(s.owner) })}</button></div></section>`
          : `<section class="card card-p share"><h2>${t("Supprimer le chantier")}</h2><p class="muted" style="font-size:.86rem">${t("Le journal, les photos, les documents et les rapports sont effacés définitivement, et le lien du client cesse de marcher.")}</p><div><button type="button" class="btn danger" data-del-site="${s.id}">${t("Supprimer ce chantier")}</button></div></section>`}`;
    }
    shell("chantier", `<div class="phone" style="max-width:${siteTab === "journal" ? 560 : 760}px">
      <button type="button" class="back" data-go="chantiers">${ic("left", 16)} ${t("Chantiers")}</button>
      ${siteCard(s, t("Client : {who}", { who: s.client_name }))}
      ${s.status === "active" ? `<button type="button" class="bigbtn" data-publish="${s.id}">${ic("cam", 22)} ${t("Nouvelle mise à jour")}</button>` : ""}
      <div class="tabs" role="tablist">${tabs.map(([k, l, n]) => `<button type="button" role="tab" data-site-tab="${k}" aria-selected="${siteTab === k}">${t(l)}${n ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>
      ${body}</div>`);

    const addStep = $("#add-step");
    if (addStep) addStep.addEventListener("submit", (e) => { e.preventDefault(); const f = new FormData(addStep); act(() => api(`/api/sites/${s.id}/steps`, { method: "POST", body: { name: f.get("name"), planned_days: Number(f.get("days")) } }), t("Étape ajoutée.")); });
    const addDoc = $("#add-doc");
    if (addDoc) {
      addDoc.kind.addEventListener("change", () => { addDoc.status.innerHTML = addDoc.kind.value === "devis" ? `<option value="signe">${t("Signé")}</option><option value="en_attente">${t("À signer")}</option>` : `<option value="a_regler">${t("À régler")}</option><option value="payee">${t("Payée")}</option>`; });
      addDoc.addEventListener("submit", (e) => { e.preventDefault(); act(() => api(`/api/sites/${s.id}/documents`, { method: "POST", body: Object.fromEntries(new FormData(addDoc)) }), t("Document ajouté. Le client le voit sur son lien.")); });
    }
    // Argent : dépense avec photo du reçu, versement reçu.
    const sendLedger = (form, kind, ok) => form && form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form), btn = form.querySelector("[type=submit]");
      fd.append("kind", kind);
      const receipt = fd.get("receipt");
      if (receipt && receipt.size) fd.set("receipt", await shrink(receipt), "recu.jpg"); else fd.delete("receipt");
      btn.disabled = true;
      try { await upload(`/api/sites/${s.id}/ledger`, fd); toast(ok); route(); } catch (err) { toast(err.message); btn.disabled = false; }
    });
    sendLedger($("#add-depense"), "depense", t("Dépense ajoutée. Le propriétaire la voit avec le reçu."));
    sendLedger($("#add-versement"), "versement", t("Versement noté."));
    app.querySelectorAll("[data-step-amount]").forEach((inp) => inp.addEventListener("change", () => act(() => api(`/api/steps/${inp.dataset.stepAmount}/amount`, { method: "PATCH", body: { amount: Number(inp.value) || 0 } }), t("Versement prévu enregistré."))));
    const ec = $("#edit-client");
    if (ec) ec.addEventListener("submit", (e) => { e.preventDefault(); act(() => api(`/api/sites/${s.id}`, { method: "PATCH", body: Object.fromEntries(new FormData(ec)) }), t("Client enregistré.")); });
    app.querySelectorAll("[data-step-days]").forEach((inp) => inp.addEventListener("change", () => act(() => api("/api/steps/" + inp.dataset.stepDays, { method: "PATCH", body: { planned_days: Number(inp.value) } }), t("Durée prévue enregistrée."))));
  }

  async function act(fn, ok) {
    try { await fn(); if (ok) toast(ok); route(); } catch (e) { toast(e.message); }
  }

  /* ---------- Journal (dernier chantier ouvert) ---------- */
  async function pageJournal() {
    if (!lastSiteId) { try { lastSiteId = Number(localStorage.getItem("af-last-site")) || null; } catch (e) {} }
    const sites = await api("/api/sites");
    const pick = sites.find((s) => s.id === lastSiteId) || sites.sort((a, b) => String(b.last_update_at || "").localeCompare(String(a.last_update_at || "")))[0];
    if (!pick) return shell("journal", isPro() ? `<section class="card empty"><h2>${t("Pas encore de chantier")}</h2><p>${t("Créez un chantier pour publier votre première mise à jour.")}</p><a class="btn primary" href="#nouveau-chantier">${t("Nouveau chantier")}</a></section>` : noSiteForProche());
    siteTab = "journal";
    history.replaceState(null, "", "#chantier-" + pick.id);
    return pageSite(pick.id);
  }

  /* ---------- Photos ---------- */
  async function pagePhotos() {
    loading("photos");
    const sites = await api("/api/sites?status=all");
    if (!sites.length) return shell("photos", `<section class="card empty"><h2>${t("Aucune photo")}</h2><p>${t("Les photos de vos mises à jour apparaîtront ici.")}</p></section>`);
    if (!sites.some((s) => s.id === lastSiteId)) lastSiteId = sites[0].id;
    const photos = await api("/api/photos?site_id=" + lastSiteId);
    shell("photos", `<div class="pagehead"><div><p class="sub">${plural(photos.length, "{n} photo datée", "{n} photos datées")}</p><h1>${t("Photos")}</h1></div></div>
      <div class="picker" role="group" aria-label="${t("Chantier")}">${sites.map((s) => `<button type="button" data-pick="${s.id}" aria-pressed="${s.id === lastSiteId}">${esc(siteLabel(s))}</button>`).join("")}</div>
      <div class="gallery">${photos.map((p) => `<a class="photo" href="${p.url}" target="_blank" rel="noopener"><img loading="lazy" alt="${t("Photo du chantier")}${p.step_name ? ", " + esc(p.step_name) : ""}" src="${p.url}"><span class="stamp">${dShort(p.taken_at)}${p.step_name ? " · " + esc(p.step_name) : ""}</span></a>`).join("") || `<p class="muted">${t("Aucune photo pour ce chantier.")}</p>`}</div>`);
  }

  /* ---------- Clients ---------- */
  async function pageClients() {
    loading("clients");
    const sites = await api("/api/sites?status=all");
    shell("clients", `<div class="pagehead"><div><p class="sub">${t("Accès par lien privé, sans compte")}</p><h1>${t("Clients")}</h1></div></div>
      <section class="card card-p">${sites.length ? `<div class="tbl-wrap"><table><thead><tr><th>${t("Client")}</th><th>${t("Chantier")}</th><th>${t("Suit depuis")}</th><th>${t("Dernière visite")}</th><th class="r">${t("Rapports lus")}</th><th></th></tr></thead><tbody>
      ${sites.map((s) => `<tr><td><b>${esc(s.client_name)}</b>${s.client_email ? `<br><span class="muted" style="font-size:.76rem">${esc(s.client_email)}</span>` : ""}</td><td><a href="#chantier-${s.id}">${esc(siteLabel(s))}</a></td><td>${esc(s.client_city || "—")}</td><td>${s.last_client_visit_at ? rel(s.last_client_visit_at) : t("Pas encore")}</td><td class="r">${s.reports_opened}/${s.reports_sent}</td><td><button type="button" class="btn ghost" data-copy-link="${esc(s.client_token)}">${t("Copier le lien")}</button></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">${t("Vos clients apparaîtront ici dès votre premier chantier.")}</p>`}</section>`);
  }

  /* ---------- Compte et abonnement ---------- */
  async function pageAccount() {
    shell("compte", `<div class="pagehead"><div><p class="sub">${esc(me.email)}${me.google ? " · " + t("connecté avec Google") : ""}</p><h1>${isPro() ? t("Abonnement et compte") : t("Compte")}</h1></div></div>
      ${isPro() ? "" : `<section class="card card-p planbox"><h2>${t("Votre accès")}</h2><p>${t("Votre accès est offert par {who}. Vous publiez l'avancement des chantiers qu'on vous confie, sans rien payer.", { who: esc((me.sponsors || []).join(", ") || "—") })}</p></section>`}
      <section class="card card-p planbox" ${isPro() ? "" : "hidden"}>
        <div class="card-h" style="margin:0"><h2>Archfield</h2><span class="chip ok">${t("Gratuit")}</span></div>
        <p>${t("Archfield est gratuit pour les entreprises : chantiers et clients illimités. Plus vos clients voient le chantier avancer et l'argent bien utilisé, plus ils vous font confiance et vous recommandent.")}</p>
        <ul><li>${t("Un lien privé par client, sans compte")}</li><li>${t("Photos vérifiées : date et lieu de prise de vue")}</li><li>${t("Devis, versements et dépenses au même endroit")}</li><li>${t("Rapport automatique chaque lundi")}</li></ul>
      </section>
      ${installCard()}
      <section class="card card-p planbox"><h2>${t("Apparence et langue")}</h2><p class="muted" style="font-size:.86rem">${t("Soleil : thème clair. Lune : thème sombre. Écran : suit le réglage de votre téléphone ou de votre ordinateur.")}</p><div>${prefs()}</div></section>
      <form class="card card-p form" id="profile" style="max-width:560px"><h2>${isPro() ? t("Votre entreprise") : t("Vos informations")}</h2>
        ${isPro() ? `<div class="field"><label for="pf-company">${t("Nom de l'entreprise")}</label><input id="pf-company" name="company" required value="${esc(me.company)}"></div>` : ""}
        ${me.company_id ? `<p class="muted" style="font-size:.8rem">${t("Numéro d'entreprise : {id}", { id: esc(me.company_id) })}</p>` : ""}
        <div class="row2"><div class="field"><label for="pf-contact">${t("Votre nom")}</label><input id="pf-contact" name="contact_name" required value="${esc(me.contact_name)}"></div>
        <div class="field"><label for="pf-city">${t("Ville")}</label><input id="pf-city" name="city" value="${esc(me.city)}"></div></div>
        <div><button class="btn" type="submit">${t("Enregistrer")}</button></div></form>
      <form class="card card-p form" id="password" style="max-width:560px"><h2>${me.has_password ? t("Mot de passe") : t("Ajouter un mot de passe")}</h2>
        ${me.has_password ? "" : `<p class="muted" style="font-size:.86rem">${t("Vous vous connectez avec Google. Un mot de passe vous permet aussi de vous connecter avec votre e-mail.")}</p>`}
        <div class="row2">${me.has_password ? `<div class="field"><label for="pw-current">${t("Mot de passe actuel")}</label><input id="pw-current" name="current" type="password" required autocomplete="current-password"></div>` : ""}
        <div class="field"><label for="pw-new">${t("Nouveau mot de passe")}</label><input id="pw-new" name="password" type="password" required minlength="8" autocomplete="new-password"></div></div>
        <div><button class="btn" type="submit">${me.has_password ? t("Changer le mot de passe") : t("Enregistrer le mot de passe")}</button></div></form>
      <section class="card card-p planbox"><h2>${t("Sécurité")}</h2>
        <p class="muted" style="font-size:.86rem">${t("Téléphone perdu, ordinateur partagé ? Déconnectez tous vos autres appareils : il faudra s'y reconnecter avec le mot de passe.")}</p>
        <div><button type="button" class="btn ghost" data-logout-others>${t("Déconnecter mes autres appareils")}</button></div></section>
      <section class="card card-p planbox"><h2>${t("Vos données")}</h2>
        <p class="muted" style="font-size:.86rem">${t("Téléchargez toutes les données de votre compte : chantiers, étapes, journal, documents et rapports.")} <a href="/confidentialite" target="_blank" rel="noopener">${t("Politique de confidentialité")}</a></p>
        <div class="row-acts"><a class="btn" href="/api/me/export" download>${t("Télécharger mes données")}</a><button type="button" class="btn ghost" data-cookies>${t("Gérer les cookies")}</button></div></section>
      <form class="card card-p form" id="delete-account" style="max-width:560px"><h2>${t("Supprimer le compte")}</h2>
        <p class="muted" style="font-size:.86rem">${isPro() ? t("Tous vos chantiers, photos et documents sont effacés définitivement, et les liens de vos clients cessent de marcher. Téléchargez vos données avant.") : t("Les chantiers qu'on vous a confiés reviennent à leur propriétaire, avec tout leur journal.")}</p>
        <div class="field"><label for="del-password">${me.has_password ? t("Votre mot de passe, pour confirmer") : t("Votre adresse e-mail, pour confirmer")}</label><input id="del-password" name="password" type="${me.has_password ? "password" : "email"}" required autocomplete="${me.has_password ? "current-password" : "off"}"></div>
        <div><button class="btn danger" type="submit">${t("Supprimer définitivement mon compte")}</button></div></form>
      <div><button type="button" class="btn ghost" data-logout>${t("Se déconnecter")}</button></div>`);
    $("#profile").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { me = await api("/api/me", { method: "PATCH", body: Object.fromEntries(new FormData(e.target)) }); toast(t("Profil enregistré.")); route(); } catch (err) { toast(err.message); }
    });
    $("#password").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api("/api/me/password", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); me = await api("/api/me"); toast(t("Mot de passe enregistré. Vos autres appareils sont déconnectés.")); route(); } catch (err) { toast(err.message); }
    });
    $("#delete-account").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api("/api/me", { method: "DELETE", body: Object.fromEntries(new FormData(e.target)) }); location.href = "/"; } catch (err) { toast(err.message); }
    });
  }

  /* ---------- Publications en attente de réseau (chantier sans couverture) ---------- */
  // Sans réseau, la publication (texte, photos, position) est gardée sur le téléphone et part dès que le réseau revient.
  const idb = () => new Promise((resolve, reject) => {
    const r = indexedDB.open("archfield", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  const store = async (mode, fn) => { const db = await idb(); return new Promise((resolve, reject) => { const q = fn(db.transaction("outbox", mode).objectStore("outbox")); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }); };
  const outboxAll = () => store("readonly", (o) => o.getAll()).catch(() => []);
  const outboxAdd = (item) => store("readwrite", (o) => o.add(item));
  const outboxDel = (id) => store("readwrite", (o) => o.delete(id)).catch(() => {});
  let outboxCount = 0, flushing = false;
  const outboxBar = () => (outboxCount ? `<div class="outbox">${ic("warn", 18)}<span>${plural(outboxCount, "{n} publication attend le réseau pour partir.", "{n} publications attendent le réseau pour partir.")}</span><button type="button" class="btn ghost" data-outbox-retry>${t("Réessayer")}</button></div>` : "");
  function updateForm(it) {
    const form = new FormData();
    form.append("text", it.text); form.append("step_id", it.stepId || ""); form.append("done", it.done ? "1" : "0");
    form.append("meta", JSON.stringify(it.photos.map((p) => p.meta)));
    if (it.pos) { form.append("lat", it.pos.lat); form.append("lng", it.pos.lng); form.append("accuracy", it.pos.accuracy); }
    it.photos.forEach((p) => form.append("photos", p.file, p.name));
    return form;
  }
  async function flushOutbox(manual) {
    if (flushing) return;
    flushing = true;
    let sent = 0;
    try {
      for (const it of await outboxAll()) {
        try { await upload(`/api/sites/${it.siteId}/updates`, updateForm(it)); await outboxDel(it.id); sent++; }
        catch (e) { if (e.offline) break; await outboxDel(it.id); toast(t("Une publication en attente a été refusée : {msg}", { msg: e.message })); }
      }
    } finally { flushing = false; }
    const before = outboxCount;
    outboxCount = (await outboxAll()).length;
    if (sent) toast(plural(sent, "{n} publication en attente est partie.", "{n} publications en attente sont parties."));
    else if (manual && outboxCount) toast(t("Toujours pas de réseau. Nouvel essai automatique dès qu'il revient."));
    if (sent || before !== outboxCount) route();
  }
  window.addEventListener("online", () => flushOutbox());

  /* ---------- Nouvelle mise à jour ---------- */
  // Photos prises sur place (appareil photo) ou choisies dans la galerie. La date de prise de vue et la position
  // sont lues dans chaque photo avant qu'elle soit allégée, et la position du téléphone est demandée à l'ouverture :
  // le serveur s'en sert pour dire au client si la publication est vérifiée.
  let timer = null, t0 = 0, files = [], pos = null, posAsked = null;
  async function openComposer(siteId) {
    const sites = await api("/api/sites");
    if (!sites.length) return toast(t("Créez d'abord un chantier."));
    const s = sites.find((x) => x.id === Number(siteId)) || sites[0];
    t0 = Date.now(); files = []; pos = null;
    posAsked = position().then((p) => { pos = p; showPos(); return p; });
    const ov = $("#composer");
    const showPos = () => { const el = $("#cmp-pos"); if (el) el.innerHTML = pos ? `${ic("check", 14, "var(--vert)")} ${t("Position enregistrée (à {n} m près)", { n: Math.round(pos.accuracy) })}` : `${ic("warn", 14, "var(--orange)")} ${window.isSecureContext ? t("Position indisponible : activez la localisation pour que vos photos soient vérifiées.") : t("Position indisponible sur cette adresse (il faut le site en HTTPS).")}`; };
    const render = (site) => {
      const run = site.steps.findIndex((x) => x.status === "en_cours");
      const firstOpen = site.steps.findIndex((x) => x.status !== "validee" && x.status !== "a_valider");
      ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="cmp-title"><form id="cmp-form">
        <div class="sh"><h2 id="cmp-title">${t("Nouvelle mise à jour")}</h2><span class="timer" id="cmp-timer">0 s</span></div>
        <div class="field"><label for="cmp-site">${t("Chantier")}</label><select id="cmp-site">${sites.map((x) => `<option value="${x.id}" ${x.id === site.id ? "selected" : ""}>${esc(siteLabel(x))} · ${esc(x.client_name)}</option>`).join("")}</select></div>
        <div class="field"><label for="cmp-step">${t("Étape")}</label><select id="cmp-step">${run < 0 && firstOpen < 0 ? `<option value="" selected>${t("Aucune étape")}</option>` : ""}${site.steps.map((x, i) => `<option value="${x.id}" ${i === (run >= 0 ? run : firstOpen) ? "selected" : ""} ${x.status === "validee" ? "disabled" : ""}>${i + 1}. ${esc(x.name)}${x.status === "validee" ? ` (${t("validée")})` : x.status === "a_valider" ? ` (${t("à valider")})` : ""}</option>`).join("")}</select></div>
        <div class="field"><span class="fl">${t("Photos")}</span>
          <div class="photo-pick">
            <label class="drop" for="cmp-camera"><input id="cmp-camera" type="file" accept="image/*" capture="environment">${ic("cam", 22)}<b>${t("Prendre une photo")}</b><span style="font-size:.72rem">${t("Recommandé : vérifiée sur place")}</span></label>
            <label class="drop" for="cmp-photos"><input id="cmp-photos" type="file" accept="image/*" multiple>${ic("photo", 22)}<b>${t("Galerie")}</b><span style="font-size:.72rem">${t("Photos de moins de 3 jours")}</span></label>
          </div>
          <div class="thumbs" id="cmp-thumbs"></div>
          <p class="pos-info" id="cmp-pos">${t("Recherche de la position du téléphone…")}</p></div>
        <div class="field"><label for="cmp-text">${t("Une phrase pour {who}", { who: esc(site.client_short) })}</label>
          <textarea id="cmp-text" maxlength="500" required placeholder="${t("Ex. : Murs de la chambre montés, on coule le chaînage samedi.")}"></textarea></div>
        <label class="check"><input type="checkbox" id="cmp-done"><span>${t("Étape terminée : demander à {who} de la valider", { who: esc(site.client_short) })}</span></label>
        <p class="upload-state" id="cmp-state" hidden></p>
        <div class="acts"><button type="button" class="btn ghost" id="cmp-cancel">${t("Annuler")}</button><button type="submit" class="btn primary" id="cmp-send">${t("Publier")}</button></div>
      </form></div>`;
      ov.hidden = false;
      if (pos || !posAsked) showPos(); else posAsked.then(showPos);
      $("#cmp-site").addEventListener("change", (e) => { const txt = $("#cmp-text").value; render(sites.find((x) => x.id === Number(e.target.value))); $("#cmp-text").value = txt; drawThumbs(); });
      const add = async (e) => {
        const picked = Array.from(e.target.files || []).slice(0, 10 - files.length);
        e.target.value = "";
        if (!picked.length) return toast(t("10 photos au maximum par mise à jour."));
        $("#cmp-state").hidden = false; $("#cmp-state").textContent = t("Préparation des photos…");
        for (const f of picked) files.push({ meta: await exifOf(f), file: await shrink(f), name: f.name.replace(/\.\w+$/, "") + ".jpg" });
        drawThumbs();
      };
      $("#cmp-camera").addEventListener("change", add);
      $("#cmp-photos").addEventListener("change", add);
      $("#cmp-cancel").addEventListener("click", closeComposer);
      $("#cmp-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = $("#cmp-text").value.trim();
        if (!text) return;
        const btn = $("#cmp-send"), st = $("#cmp-state");
        btn.disabled = true; st.hidden = false; st.textContent = t("Envoi…");
        await posAsked;
        const item = { siteId: site.id, siteName: site.name, text, stepId: $("#cmp-step").value, done: $("#cmp-done").checked, pos, photos: files.map((p) => ({ file: p.file, name: p.file.name || p.name, meta: p.meta })), at: new Date().toISOString() };
        const finish = (title, body) => {
          clearInterval(timer);
          lastSiteId = site.id; siteTab = "journal";
          if (location.hash === "#chantier-" + site.id) route(); else location.hash = "chantier-" + site.id;
          const msg = t("Bonjour {who}, nouvelle mise à jour sur votre chantier : « {text} » Les photos : {url}", { who: site.client_short, text, url: clientUrl(site.client_token) });
          ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="cmp-done-title"><div class="done">
            <span class="ok-ic">${ic("check", 44)}</span><h2 id="cmp-done-title">${title}</h2>${body}
            <div class="row-acts"><a class="btn wa" href="${waLink(site.client_phone, msg)}" target="_blank" rel="noopener">${t("Prévenir sur WhatsApp")}</a><button type="button" class="btn ghost" id="cmp-close">${t("Fermer")}</button></div>
          </div></div>`;
          ov.hidden = false;
          $("#cmp-close").addEventListener("click", closeComposer);
        };
        try {
          const r = await upload(`/api/sites/${site.id}/updates`, updateForm(item), (p) => { st.textContent = t("Envoi… {pct} %", { pct: Math.round(p * 100) }); });
          const proof = r.verify === "verified" ? `<p class="proof ok">${ic("check", 16)} ${t("Publication vérifiée : photos récentes, prises sur le chantier.")}</p>`
            : r.verify === "warning" ? `<p class="proof warn">${ic("warn", 16)} ${t("Le client verra « À vérifier » : photo ancienne ou prise loin du chantier.")}</p>`
            : `<p class="proof part">${ic("eye", 16)} ${t("Vérification partielle : activez la localisation et prenez les photos sur place.")}</p>`;
          finish(t("Publié en {n} s", { n: Math.max(1, Math.round((Date.now() - t0) / 1000)) }), `${proof}<p class="muted">${r.notified ? t("{who} a reçu un e-mail avec le lien.", { who: esc(site.client_short) }) : t("{who} le voit sur son lien privé.", { who: esc(site.client_name) })} ${t("Vous pouvez aussi envoyer le lien sur WhatsApp.")}</p>`);
        } catch (err) {
          if (!err.offline) { st.textContent = err.message; btn.disabled = false; return; }
          // Pas de réseau : la publication attend sur le téléphone.
          try { await outboxAdd(item); } catch (x) { st.textContent = err.message; btn.disabled = false; return; }
          outboxCount = (await outboxAll()).length;
          finish(t("Enregistrée, sans réseau"), `<p class="muted">${t("Votre publication est gardée sur ce téléphone. Elle partira toute seule dès que le réseau revient, avec la date et le lieu des photos.")}</p>`);
        }
      });
      $("#cmp-text").focus();
    };
    const drawThumbs = () => {
      const th = $("#cmp-thumbs");
      if (!th) return;
      th.innerHTML = files.map((f, i) => `<img alt="${t("Photo {i}", { i: i + 1 })}" src="${URL.createObjectURL(f.file)}">`).join("");
      const kb = Math.round(files.reduce((a, f) => a + f.file.size, 0) / 1024);
      const st = $("#cmp-state");
      if (files.length) { st.hidden = false; st.textContent = t("{photos} · {size} à envoyer", { photos: plural(files.length, "{n} photo", "{n} photos"), size: kb > 1024 ? t("{n} Mo", { n: nf(kb / 1024) }) : t("{n} Ko", { n: kb }) }); }
    };
    render(s);
    clearInterval(timer);
    timer = setInterval(() => { const el = $("#cmp-timer"); if (el) el.textContent = Math.round((Date.now() - t0) / 1000) + " s"; }, 500);
  }
  function closeComposer() { clearInterval(timer); $("#composer").hidden = true; $("#composer").innerHTML = ""; files = []; }

  /* ---------- Routage ---------- */
  async function route() {
    const h = location.hash.slice(1) || (isMobile() ? "journal" : "tableau-de-bord");
    try {
      const m = h.match(/^chantier-(\d+)$/);
      if (m) return await pageSite(Number(m[1]));
      const pages = { "tableau-de-bord": pageDashboard, chantiers: pageSites, "nouveau-chantier": pageNewSite, journal: pageJournal, photos: pagePhotos, clients: pageClients, compte: pageAccount };
      await (pages[h] || pageDashboard)();
    } catch (e) { errorBox(h, e); }
  }
  window.addEventListener("hashchange", () => { if (!me || me.account_type === "client") return; if (!$("#composer").hidden && !$("#cmp-done-title")) closeComposer(); if (!/^#chantier-/.test(location.hash)) siteTab = "journal"; route().then(() => window.scrollTo(0, 0)); });

  let pendingNewLink = false;
  document.addEventListener("click", async (e) => {
    if (!me || me.account_type === "client") return;
    const b = e.target.closest("button, tr[data-site]");
    if (!b) return;
    const d = b.dataset;
    if (d.go) { if (location.hash === "#" + d.go) route(); else location.hash = d.go; }
    else if (d.site) location.hash = "chantier-" + d.site;
    else if (d.publish !== undefined) openComposer(d.publish);
    else if (d.siteTab) { siteTab = d.siteTab; route(); }
    else if (d.pick) { lastSiteId = Number(d.pick); route(); }
    else if (d.copyText) copy(d.copyText, t("Copié."));
    else if (d.release) {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("Confirmer : je ne gère plus ce chantier"); setTimeout(() => { if (b.isConnected) delete b.dataset.armed; }, 5000); return; }
      try { await api(`/api/sites/${d.release}/release`, { method: "POST" }); toast(t("Chantier rendu à son propriétaire.")); location.hash = "chantiers"; } catch (err) { toast(err.message); }
    }
    else if (d.copyLink) copy(clientUrl(d.copyLink), t("Lien copié. Envoyez-le au client par WhatsApp ou par e-mail."));
    else if (d.stepAction) act(() => api("/api/steps/" + d.step, { method: "PATCH", body: { action: d.stepAction } }), t({ start: "Étape démarrée.", finish: "Étape terminée. Le client est invité à la valider.", reopen: "Étape rouverte." }[d.stepAction]));
    else if (d.stepDel) act(() => api("/api/steps/" + d.stepDel, { method: "DELETE" }), t("Étape supprimée."));
    else if (d.delUpdate) {
      if (b.dataset.armed) act(() => api("/api/updates/" + d.delUpdate, { method: "DELETE" }), t("Mise à jour supprimée."));
      else { b.dataset.armed = "1"; b.textContent = t("Confirmer la suppression"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t("Supprimer"); } }, 4000); }
    }
    else if (d.docPaid) act(() => api("/api/documents/" + d.docPaid, { method: "PATCH", body: { status: "payee" } }), t("Facture marquée payée."));
    else if (d.docSigned) act(() => api("/api/documents/" + d.docSigned, { method: "PATCH", body: { status: "signe" } }), t("Devis marqué signé."));
    else if (d.docDel !== undefined) act(() => api("/api/documents/" + d.docDel, { method: "DELETE" }), t("Document supprimé."));
    else if (d.sendReport !== undefined) act(() => api(`/api/sites/${lastSiteId}/report`, { method: "POST" }), t("Rapport envoyé. Le client le voit sur son lien."));
    else if (d.delSite) {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("Confirmer : tout effacer définitivement"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t("Supprimer ce chantier"); } }, 5000); }
      else { try { await api("/api/sites/" + d.delSite, { method: "DELETE" }); lastSiteId = null; try { localStorage.removeItem("af-last-site"); } catch (err) {} toast(t("Chantier supprimé.")); location.hash = "chantiers"; } catch (err) { toast(err.message); } }
    }
    else if (d.deliver !== undefined) act(() => api(`/api/sites/${lastSiteId}/deliver`, { method: "POST" }), t("Chantier livré. Bravo !"));
    else if (d.newLink !== undefined) {
      if (!pendingNewLink) { pendingNewLink = true; b.textContent = t("Confirmer : l'ancien lien cessera de marcher"); setTimeout(() => { pendingNewLink = false; if (b.isConnected) b.textContent = t("Changer de lien"); }, 5000); }
      else { pendingNewLink = false; act(() => api(`/api/sites/${lastSiteId}/new-link`, { method: "POST" }), t("Nouveau lien créé. Envoyez-le au client.")); }
    }
    else if (d.ledgerCancel) {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("Confirmer l'annulation"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t("Annuler"); } }, 5000); return; }
      act(() => api(`/api/ledger/${d.ledgerCancel}/cancel`, { method: "POST", body: {} }), t("Ligne annulée. Elle reste visible, barrée."));
    }
    else if (d.resetPosition) {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("Confirmer : effacer la position"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t("Effacer la position"); } }, 5000); return; }
      act(() => api(`/api/sites/${d.resetPosition}/position/reset`, { method: "POST" }), t("Position effacée. La prochaine publication sur place l'enregistrera."));
    }
    else if (d.logoutOthers !== undefined) { try { const r = await api("/api/me/logout-others", { method: "POST" }); toast(plural(r.closed, "{n} autre appareil déconnecté.", "{n} autres appareils déconnectés.")); } catch (err) { toast(err.message); } }
    else if (d.outboxRetry !== undefined) flushOutbox(true);
    else if (d.logout !== undefined) { await api("/api/logout", { method: "POST" }); location.href = "/connexion"; }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#composer").hidden) closeComposer(); });
  $("#composer").addEventListener("click", (e) => { if (e.target.id === "composer") closeComposer(); });

  (async () => {
    try { me = await api("/api/me"); }
    catch (e) {
      // Pas de réseau (ou serveur injoignable) : on le dit au lieu de rester sur « Chargement… ».
      if (!/\/connexion$/.test(location.pathname)) app.innerHTML = `<main class="offline"><img src="/favicon.svg" alt="" width="64" height="64"><h1>${t("Pas de connexion")}</h1><p>${esc(e.message)}</p><a class="btn primary" href="">${t("Réessayer")}</a></main>`;
      return;
    }
    // Invitation acceptée après une connexion (Google ou e-mail) qui a ramené ici.
    let code = null;
    try { code = sessionStorage.getItem("af-invite"); sessionStorage.removeItem("af-invite"); } catch (e) {}
    if (code) { try { await api(`/api/invitations/${code}/accept`, { method: "POST" }); me = await api("/api/me"); toast(t("Invitation acceptée : le chantier est dans votre liste.")); } catch (e) { toast(e.message); } }
    if (me.account_type === "client") return window.AFSpace.start(me);
    outboxCount = (await outboxAll()).length;
    route();
    if (outboxCount && navigator.onLine) flushOutbox();
  })();
})();
