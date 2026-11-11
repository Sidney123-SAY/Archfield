// Application artisan : tableau de bord, chantiers, journal, photos, clients, compte.
(function () {
  "use strict";
  const { t, LOGO, ic, esc, prefs, themeToggle, installCard, installNudge, exifOf, position, moneyPanel, depenseForm, versementForm, curLabel, money, fmt, dShort, nf, cap, plural, rel, api, upload, shrink, toast, copy, STATUS_CHIP, healthChip, siteCard, journal, docsTable, outbox, dialSelect, lang } = window.AF;
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
  const planLabel = () => {
    if (me.account_type === "proche") return t("Accès offert par {who}", { who: esc((me.sponsors || []).join(", ") || "—") });
    const a = me.access || {};
    return a.status === "trial" ? plural(a.days_left, "Essai : encore {n} jour", "Essai : encore {n} jours") : a.status === "paid" ? t("Offre {plan}", { plan: t(window.AF.PLAN_NAME[a.plan] || "") }) : t("Sans abonnement");
  };
  const waLink = (phoneNumber, text) => `https://wa.me/${(phoneNumber || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
  const initials = (n) => n.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();

  function shell(section, body) {
    const sideOn = (k) => k === section || (k === "chantiers" && (section === "chantier" || section === "nouveau-chantier"));
    const tabOn = (k) => k === section || (k === "chantiers" && ["tableau-de-bord", "nouveau-chantier", "chantier", "clients"].includes(section));
    app.innerHTML = `<div class="shell">
      <aside class="side">
        <a class="logo" href="#tableau-de-bord">${LOGO(24)} Archfield</a>
        <nav aria-label="${t("Menu")}">${NAV.map(([k, l, i]) => `<button type="button" data-go="${k}" ${sideOn(k) ? 'aria-current="page"' : ""}>${ic(i, 17)} ${t(l)}</button>`).join("")}${me.admin ? `<a class="navlink" href="/admin">${ic("shield", 17)} ${t("Administration")}</a>` : ""}</nav>
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

  /* ---------- Tableau de bord du dirigeant ---------- */
  // En cinq secondes, ce qui demande une action : 4 chiffres, chantiers (avancement et budget côte à côte),
  // « À traiter aujourd'hui » et activité récente (idée reprise de SuiviBat).
  const totals = (o) => Object.entries(o || {}).map(([c, n]) => money(n, c)).join(" + ") || money(0, me.currency);
  const siteState = (s) => s.drift ? `<span class="chip warn">${ic("warn", 13)} ${t("En retard")}</span>` : s.watch.length ? `<span class="chip wait">${ic("eye", 13)} ${t("À surveiller")}</span>` : s.toValidate ? `<span class="chip wait">${t("À valider")}</span>` : `<span class="chip ok">${t("En cours")}</span>`;
  const bars = (s) => `<span class="dbars"><span class="dbar"><small>${t("Avancement")}</small><span class="t"><span style="width:${s.progress}%"></span></span><b class="num">${s.progress} %</b></span>
    <span class="dbar budget ${s.watch.includes("budget") ? "over" : ""}"><small>${t("Budget utilisé")}</small><span class="t"><span style="width:${Math.min(100, s.budget_pct || 0)}%"></span></span><b class="num">${s.budget_pct == null ? "—" : s.budget_pct + " %"}</b></span></span>`;
  const waTo = (phoneNumber, text) => `https://wa.me/${String(phoneNumber || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
  function todoItem(x) {
    if (x.kind === "reports") return `<li>${ic("doc", 20)}<div><b>${plural(x.n, "{n} rapport du jour à vérifier", "{n} rapports du jour à vérifier")}</b><span>${esc(x.site)}${x.who ? " · " + esc(x.who) : ""}</span></div><button type="button" class="btn ghost" data-open-site="${x.site_id}" data-tab="journal">${t("Vérifier")}</button></li>`;
    if (x.kind === "expenses") return `<li>${ic("money", 20)}<div><b>${plural(x.n, "{n} dépense en attente d'approbation", "{n} dépenses en attente d'approbation")}</b><span>${esc(x.site)} · ${money(x.amount, x.currency)}</span></div><button type="button" class="btn ghost" data-open-site="${x.site_id}" data-tab="argent">${t("Examiner")}</button></li>`;
    if (x.kind === "problem") return `<li class="hot">${ic("warn", 20)}<div><b>${t("Problème : {what}", { what: t(window.AF.PROBLEM[x.category] || "Autre") })}</b><span>${esc(x.site)}${x.who ? " · " + esc(x.who) : ""}${x.text ? " · " + esc(x.text.slice(0, 80)) : ""}</span></div><button type="button" class="btn ghost" data-open-site="${x.site_id}" data-tab="journal">${t("Voir")}</button></li>`;
    if (x.kind === "silence") return `<li class="hot">${ic("cal", 20)}<div><b>${t("{site} : aucun rapport depuis {n} jours", { site: esc(x.site), n: x.days })}</b><span>${x.chef ? esc(x.chef.name) : t("Personne dans l'équipe")}</span></div>${x.chef && x.chef.phone ? `<a class="btn ghost" target="_blank" rel="noopener" href="${waTo(x.chef.phone, t("Bonjour {who}, pouvez-vous envoyer le rapport du jour du chantier « {site} » sur Archfield ?", { who: x.chef.name.split(" ")[0], site: x.site }))}">${t("Relancer")}</a>` : `<button type="button" class="btn ghost" data-open-site="${x.site_id}" data-tab="equipe">${t("Équipe")}</button>`}</li>`;
    return `<li>${ic("warn", 20)}<div><b>${t("{site} : budget en avance sur les travaux", { site: esc(x.site) })}</b><span>${t("{b} % du budget utilisé pour {p} % d'avancement", { b: x.budget_pct, p: x.progress })}</span></div><button type="button" class="btn ghost" data-open-site="${x.site_id}" data-tab="argent">${t("Voir")}</button></li>`;
  }
  function activityItem(a) {
    const who = a.who ? `<b>${esc(a.who)}</b>` : `<b>${esc(me.contact_name)}</b>`;
    const txt = a.type === "rapport" ? t("{who} a transmis le rapport du jour", { who }) : a.type === "probleme" ? t("{who} a signalé un problème", { who })
      : a.type === "post" ? (a.photos ? t("{who} a ajouté {n} photos", { who, n: a.photos }) : t("{who} a envoyé un message", { who }))
      : a.type === "step_done" ? t("Étape terminée : {step}", { step: esc(a.step || "") }) : a.type === "step_validated" ? t("Étape validée par le client : {step}", { step: esc(a.step || "") })
      : a.type === "depense" ? t("{who} a déclaré une dépense de {amount}", { who, amount: money(a.amount, a.currency) }) : t("{who} a noté un versement de {amount}", { who, amount: money(a.amount, a.currency) });
    return `<li><span>${txt} · ${esc(a.site)}</span><small>${rel(a.at)}</small></li>`;
  }
  async function pageDashboard() {
    loading("tableau-de-bord");
    const d = await api("/api/boss");
    const hello = `<p class="sub">${cap(fmt(Date.now(), { weekday: "long", day: "numeric", month: "long" }))} · ${esc(me.company)}</p><h1>${t("Bonjour, {name}", { name: esc(me.contact_name.split(" ")[0]) })}</h1>`;
    if (!d.sites.length) {
      return shell("tableau-de-bord", `<div class="pagehead"><div>${hello}</div></div>
        ${!isPro() ? noSiteForProche() : ""}<section class="card empty" ${isPro() ? "" : "hidden"}><h2>${t("Créez votre premier chantier")}</h2><p>${t("Ajoutez le client et les étapes prévues. Archfield vous donne un lien privé à envoyer au client par WhatsApp ou par e-mail, sans compte à créer.")}</p><a class="btn primary" href="#nouveau-chantier">${ic("plus", 16)} ${t("Nouveau chantier")}</a></section>`);
    }
    const k = d.kpis;
    shell("tableau-de-bord", `
      <div class="pagehead"><div>${hello}</div>
        <div class="acts">${outboxCount ? "" : `<span class="pill ok">${ic("check", 15)} ${t("À jour · {h}", { h: window.AF.time(Date.now()) })}</span>`}${isPro() ? `<a class="btn primary" href="#nouveau-chantier">${ic("plus", 15)} ${t("Créer un chantier")}</a>` : ""}</div></div>
      <div class="kpis">
        <div class="card kpi"><span class="k">${ic("home", 15)} ${t("Chantiers en cours")}</span><span class="v">${k.active}</span><span class="s">${k.shared ? plural(k.shared, "dont {n} partagé avec vous", "dont {n} partagés avec vous") : t("gérés par vous")}</span></div>
        <div class="card kpi ${k.reports ? "attn" : ""}"><span class="k">${ic("doc", 15)} ${t("Rapports à vérifier")}</span><span class="v">${k.reports}</span><span class="s">${plural(k.reports_today, "{n} reçu aujourd'hui", "{n} reçus aujourd'hui")}</span></div>
        <div class="card kpi ${k.expenses ? "attn" : ""}"><span class="k">${ic("money", 15)} ${t("Dépenses en attente")}</span><span class="v">${k.expenses}</span><span class="s">${t("{amount} déclarés", { amount: totals(k.expenses_total) })}</span></div>
        <div class="card kpi ${k.watch ? "hot" : ""}"><span class="k">${ic("warn", 15)} ${t("Chantiers à surveiller")}</span><span class="v">${k.watch}</span><span class="s">${t("retard ou budget en avance")}</span></div>
      </div>
      <div class="boss">
        <section class="card card-p"><div class="card-h"><h2>${t("Vos chantiers")}</h2><a href="#chantiers">${t("Voir tous les chantiers")}</a></div>
          <div class="tbl-wrap tbl-desk"><table class="boss-t"><thead><tr><th>${t("Chantier")}</th><th>${t("Avancement et budget")}</th><th>${t("Statut et dernier rapport")}</th></tr></thead><tbody>
          ${d.sites.map((s) => `<tr class="click" data-site="${s.id}"><td><b>${esc(s.name)}</b><span class="muted sm">${esc([s.location.split(",")[0], s.chef?.name].filter(Boolean).join(" · "))}</span><span class="muted sm">${t("Budget {b}", { b: s.budget ? money(s.budget, s.currency) : "—" })}</span>${s.shared_by ? `<span class="chip idle sm">${t("Partagé par {who}", { who: esc(s.shared_by) })}</span>` : ""}</td><td>${bars(s)}</td><td>${siteState(s)}<span class="muted sm">${s.last_report_at ? rel(s.last_report_at) : t("Pas encore de rapport")}</span></td></tr>`).join("")}
          </tbody></table></div>
          <div class="mcards">${d.sites.map((s) => `<button type="button" class="mcard" data-site="${s.id}"><span class="l1"><b>${esc(s.name)}</b>${siteState(s)}</span>${bars(s)}<span class="l2">${esc(s.location.split(",")[0])} · ${s.last_report_at ? rel(s.last_report_at) : t("Pas encore de rapport")}</span></button>`).join("")}</div>
        </section>
        <div class="boss-side">
          <section class="card card-p"><h2>${t("À traiter aujourd'hui")}</h2>${d.todo.length ? `<ul class="todo">${d.todo.map(todoItem).join("")}</ul>` : `<p class="okbox">${ic("check", 18)} ${t("Rien à traiter. Tout est à jour.")}</p>`}</section>
          <section class="card card-p"><h2>${t("Activité récente")}</h2>${d.activity.length ? `<ul class="activity">${d.activity.map(activityItem).join("")}</ul>` : `<p class="muted">${t("Rien pour l'instant.")}</p>`}</section>
        </div>
      </div>`);
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

  /* ---------- Équipe d'un chantier ---------- */
  // Modèles de droits proposés à la création (Chef de chantier, Chef d'équipe), ajustables case par case.
  const PERMS = [["rapport", "Faire le rapport du jour", "Travaux, ouvriers présents, livraisons, météo"], ["photos", "Prendre des photos", "Avec la date et l'heure"], ["depenses", "Déclarer des dépenses", "Montant et photo du reçu, en attente de votre approbation"], ["probleme", "Signaler un problème", "Accident, panne, retard"], ["vocal", "Envoyer des messages vocaux", "2 minutes au plus chacun"], ["budget", "Voir le budget du chantier", "Montants et avancement"]];
  const ROLE_NAMES = { chef_chantier: "Chef de chantier", chef_equipe: "Chef d'équipe", perso: "Personnalisé" };
  const permBoxes = (perms, prefix) => `<div class="perms">${PERMS.map(([k, l, h]) => `<label class="perm"><input type="checkbox" name="${prefix}${k}" data-perm="${k}" ${perms[k] ? "checked" : ""}><span><b>${t(l)}</b><small>${t(h)}</small></span></label>`).join("")}</div>`;
  let teamCache = null;
  async function teamTab(s) {
    teamCache = await api(`/api/sites/${s.id}/team`);
    const { members, invites, roles } = teamCache;
    const inviteUrl = (code) => `${location.origin}/invitation/${code}`;
    return `<section class="card card-p"><h2>${t("Qui travaille sur ce chantier ?")}</h2>
        <p class="muted" style="font-size:.86rem">${t("Chacun voit seulement ce que vous l'autorisez à faire. Un bouton non autorisé n'apparaît pas chez lui.")}</p>
        ${members.length ? `<ul class="team">${members.map((m) => `<li><div class="tm-h"><span class="avatar sm">${esc(m.contact_name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase())}</span><div><b>${esc(m.contact_name)}</b><span class="muted sm">${esc([m.phone, m.email].filter(Boolean).join(" · "))}</span></div><span class="chip idle">${t(ROLE_NAMES[m.role] || "Personnalisé")}</span></div>
          <details><summary>${t("Modifier ses droits")}</summary><form class="form" data-member-form="${m.id}">${permBoxes(m.perms, "")}<div class="row-acts"><button class="btn" type="submit">${t("Enregistrer")}</button><button type="button" class="btn danger" data-member-del="${m.id}">${t("Retirer du chantier")}</button></div></form></details></li>`).join("")}</ul>` : `<p class="muted">${t("Personne pour l'instant. Invitez votre chef de chantier : il fera le rapport du jour depuis son téléphone.")}</p>`}
      </section>
      ${invites.length ? `<section class="card card-p"><h2>${t("Invitations en attente")}</h2><ul class="team">${invites.map((i) => {
        const url = inviteUrl(i.code), msg = t("Bonjour {who}, rejoignez le chantier « {site} » sur Archfield : {url}", { who: i.invitee_name.split(" ")[0], site: s.name, url });
        return `<li><div class="tm-h"><div><b>${esc(i.invitee_name)}</b><span class="muted sm">${esc(i.invitee_contact || "")} · ${t(ROLE_NAMES[i.role] || "Personnalisé")}</span></div></div>
          <div class="link"><code>${esc(url)}</code><button type="button" class="btn ghost" data-copy-text="${esc(url)}">${t("Copier")}</button></div>
          <div class="row-acts">${/^\+/.test(i.invitee_contact) ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(i.invitee_contact, msg)}">${t("Envoyer par WhatsApp")}</a>` : `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${t("Envoyer par WhatsApp")}</a>`}<button type="button" class="btn ghost" data-invite-del="${i.id}">${t("Annuler l'invitation")}</button></div></li>`;
      }).join("")}</ul></section>` : ""}
      <form class="card card-p form" id="team-add"><h2>${t("Inviter une personne")}</h2>
        <div class="row2"><div class="field"><label for="tm-name">${t("Nom")}</label><input id="tm-name" name="name" required maxlength="120" placeholder="Adjovi Hounkpè"></div>
        <div class="field"><label for="tm-contact">${t("Téléphone (WhatsApp) ou e-mail")}</label><input id="tm-contact" name="contact" required maxlength="200" placeholder="+229 01 97 00 00 00" autocomplete="off"><span class="hint">${t("Avec l'indicatif du pays. S'il a déjà un compte, il est ajouté tout de suite.")}</span></div></div>
        <div class="field"><span class="fl">${t("Que peut-il faire sur ce chantier ?")}</span>
          <div class="seg" role="group" aria-label="${t("Partir d'un modèle")}">${Object.keys(roles).map((r, i) => `<label><input type="radio" name="role" value="${r}" ${i === 0 ? "checked" : ""}><span>${t(ROLE_NAMES[r])}</span></label>`).join("")}<label><input type="radio" name="role" value="perso"><span>${t("Personnalisé")}</span></label></div>
          ${permBoxes(roles.chef_chantier, "")}<span class="hint">${t("Vous pourrez tout changer plus tard.")}</span></div>
        <div class="error-box" hidden></div>
        <div><button class="btn primary" type="submit">${t("Inviter")}</button></div></form>`;
  }
  function bindTeam(s) {
    const f = $("#team-add");
    if (!f) return;
    const boxes = () => [...f.querySelectorAll("[data-perm]")];
    f.addEventListener("change", (e) => {
      if (e.target.name === "role" && teamCache.roles[e.target.value]) boxes().forEach((b) => { b.checked = !!teamCache.roles[e.target.value][b.dataset.perm]; });
      else if (e.target.dataset.perm) f.querySelector('input[name="role"][value="perso"]').checked = true;
    });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const perms = Object.fromEntries(boxes().map((b) => [b.dataset.perm, b.checked]));
      const body = { name: f.name.value, contact: f.contact.value, role: new FormData(f).get("role"), perms, country: me.country };
      try {
        const r = await api(`/api/sites/${s.id}/team`, { method: "POST", body });
        toast(r.added ? t("{who} fait maintenant partie de l'équipe.", { who: r.name }) : t("Invitation créée. Envoyez-lui le lien par WhatsApp."));
        route();
      } catch (x) { const box = f.querySelector(".error-box"); box.textContent = x.message; box.hidden = false; }
    });
    app.querySelectorAll("[data-member-form]").forEach((mf) => mf.addEventListener("submit", (e) => {
      e.preventDefault();
      const perms = Object.fromEntries([...mf.querySelectorAll("[data-perm]")].map((b) => [b.dataset.perm, b.checked]));
      act(() => api(`/api/team/${mf.dataset.memberForm}`, { method: "PATCH", body: { role: "perso", perms } }), t("Droits enregistrés."));
    }));
  }

  /* ---------- Fiche chantier ---------- */
  async function pageSite(id) {
    loading("chantier");
    let s;
    try { s = await api("/api/sites/" + id); } catch (e) { return errorBox("chantier", e); }
    lastSiteId = s.id;
    try { localStorage.setItem("af-last-site", String(s.id)); } catch (e) {}
    const unchecked = s.updates.filter((u) => u.topic === "rapport" && !u.checked_at && u.author_id !== me.id).length;
    const tabs = [["journal", "Journal", unchecked], ["etapes", "Étapes", s.toValidate], ["argent", "Argent", s.money.alert ? "!" : s.money.pending_count], ...(me.account_type === "proche" ? [] : [["equipe", "Équipe", 0]]), ["partage", "Lien et rapports"]];
    const scur = curLabel(s.currency);
    let body = "";
    if (siteTab === "journal") body = `<div class="card-h"><h2 class="section-t" style="margin:0">${t("Journal du chantier")}</h2>${unchecked ? `<button type="button" class="btn ghost" data-check-all="${s.id}">${plural(unchecked, "Marquer {n} rapport vérifié", "Marquer les {n} rapports vérifiés")}</button>` : ""}</div>${journal(s, s.updates, { who: s.client_short, manage: { me: me.id } })}`;
    else if (siteTab === "equipe") body = await teamTab(s);
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
      body = `${moneyPanel(s.money, { me: me.id, review: true })}
        ${s.deliveries.length ? `<h2 class="section-t">${t("Livraisons reçues")}</h2><section class="card card-p"><ul class="m-sched">${s.deliveries.map((d) => `<li><span>${ic("truck", 15)} ${esc([d.quantity, d.label].filter(Boolean).join(" "))}</span><span class="muted">${dShort(d.created_at)}${d.author_name ? " · " + esc(d.author_name) : ""}</span></li>`).join("")}</ul></section>` : ""}
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
          <p class="muted" style="font-size:.86rem">${s.position ? t("Enregistrée le {date} par {who}, lors d'une publication sur place. Chaque photo est comparée à cette position.", { date: dShort(s.position.set_at), who: esc(s.position.set_by) }) + " " + (s.position.confirmed_at ? t("Confirmée par le client : vos publications faites sur place sont « vérifiées ».") : t("Pas encore confirmée par le client : vos publications restent « cohérentes » jusque-là.")) : t("Pas encore enregistrée : elle le sera à la prochaine publication faite sur le chantier, avec la localisation du téléphone activée.")}</p>
          ${s.position && s.can_reset_position ? `<div><button type="button" class="btn ghost" data-reset-position="${s.id}">${t("Effacer la position")}</button></div>` : ""}</section>
        <section class="card card-p share"><h2>${t("Lien privé du client")}</h2>
          <p class="muted" style="font-size:.86rem">${t("{who} ouvre ce lien sans créer de compte. Envoyez-le par WhatsApp, SMS ou e-mail.", { who: esc(s.client_name) })}</p>
          <div class="link"><code>${esc(url)}</code><button type="button" class="btn ghost" data-copy-link="${esc(s.client_token)}">${t("Copier")}</button></div>
          <div class="row-acts"><a class="btn wa" href="${waLink(s.client_phone, t("Bonjour {who}, suivez l'avancement de votre chantier ici : {url}", { who: s.client_short, url }))}" target="_blank" rel="noopener">${t("Envoyer par WhatsApp")}</a><a class="btn ghost" href="/c/${esc(s.client_token)}" target="_blank" rel="noopener">${t("Voir la page du client")}</a><button type="button" class="btn ghost" data-new-link>${t("Changer de lien")}</button></div>
          <p class="muted" style="font-size:.78rem">${t("Dernière visite du client : {when}.", { when: s.last_client_visit_at ? rel(s.last_client_visit_at).toLowerCase() : t("pas encore") })}</p></section>
        <section class="card card-p share"><div class="card-h" style="margin:0"><h2>${t("Rapports du lundi")}</h2><span class="row-acts"><a class="btn ghost" href="/api/sites/${s.id}/rapport.pdf" target="_blank" rel="noopener">${ic("doc", 15)} ${t("Rapport de la semaine (PDF)")}</a><button type="button" class="btn" data-send-report>${t("Envoyer un rapport maintenant")}</button></span></div>
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

    if (siteTab === "equipe") bindTeam(s);
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
  // Téléphone du compte : ajouté ou changé ici, confirmé par un code (WhatsApp ou SMS).
  const phoneCard = async () => {
    const cfg = window.AF_CONFIG || (window.AF_CONFIG = await api("/api/config", { authRedirect: false }).catch(() => ({ dial: [] })));
    return `<form class="card card-p form" id="phone-form" style="max-width:560px"><h2>${t("Téléphone")}</h2>
      ${me.phone ? `<p>${esc(me.phone_pretty)} ${me.phone_verified ? `<span class="chip ok">${t("Confirmé")}</span>` : `<span class="chip wait">${t("À confirmer")}</span> <a href="/inscription/confirmer">${t("Confirmer maintenant")}</a>`}</p>` : `<p class="muted" style="font-size:.86rem">${t("Pour vous connecter avec votre numéro et recevoir les codes par WhatsApp ou SMS.")}</p>`}
      <div class="ident"><label for="ph-num" class="sr-only">${t("Numéro de téléphone")}</label>${dialSelect("ph-dial", cfg.dial || [], me.country || undefined)}<input id="ph-num" name="phone" type="tel" required maxlength="30" placeholder="01 97 00 00 00" autocomplete="tel"></div>
      <div><button class="btn" type="submit">${me.phone ? t("Changer de numéro") : t("Ajouter mon numéro")}</button></div></form>`;
  };
  async function pageAccount() {
    loading("compte");
    const b = isPro() ? await api("/api/billing") : null;
    const c = b && b.current;
    const usage = c ? `<p class="muted sm">${t("Chantiers à vous en cours : {u} sur {l}", { u: c.used_sites, l: c.sites == null ? t("illimité") : c.sites })} · ${t("Équipe : {u} sur {l}", { u: c.used_members, l: c.members == null ? t("illimité") : c.members })}</p>` : "";
    const state = !c ? "" : c.status === "trial" ? t("Essai PME : encore {n} jours, sans carte bancaire.", { n: c.days_left }) : c.status === "paid" ? (b.cancel_at_end ? t("{plan} jusqu'au {date}, puis l'abonnement s'arrête.", { plan: t(window.AF.PLAN_NAME[c.plan]), date: dShort(c.until) }) : t("{plan} jusqu'au {date}, renouvelé chaque mois.", { plan: t(window.AF.PLAN_NAME[c.plan]), date: dShort(c.until) })) : t("Sans abonnement : un chantier à vous, sans équipe. Les chantiers que vos clients vous confient restent gratuits pour vous.");
    shell("compte", `<div class="pagehead"><div><p class="sub">${esc([me.email, me.phone_pretty].filter(Boolean).join(" · "))}${me.google ? " · " + t("connecté avec Google") : ""}</p><h1>${isPro() ? t("Abonnement et compte") : t("Compte")}</h1></div></div>
      ${isPro() ? "" : `<section class="card card-p planbox"><h2>${t("Votre accès")}</h2><p>${t("Votre accès est offert par {who}. Vous publiez l'avancement des chantiers qu'on vous confie, sans rien payer.", { who: esc((me.sponsors || []).join(", ") || "—") })}</p></section>`}
      ${isPro() ? `<section class="card card-p planbox" id="abonnement"><div class="card-h" style="margin:0"><h2>${t("Votre offre")}</h2><span class="chip ${c.status === "free" ? "idle" : "ok"}">${t(window.AF.PLAN_NAME[c.plan] || "Gratuit")}</span></div>
        <p>${state}</p>${usage}
        ${c.status === "paid" && (b.card || b.mode === "test") ? `<div><button type="button" class="btn ghost" data-portal>${b.mode === "test" ? (b.cancel_at_end ? t("Reprendre l'abonnement") : t("Arrêter à la fin du mois")) : t("Gérer mon abonnement (carte, factures)")}</button></div>` : ""}
        ${window.AF.billingCards(b, { current: c.status === "paid" ? c.plan : null })}
      </section>` : ""}
      ${await phoneCard()}
      ${installCard()}
      <section class="card card-p planbox"><h2>${t("Apparence et langue")}</h2><p class="muted" style="font-size:.86rem">${t("Soleil : thème clair. Lune : thème sombre. Écran : suit le réglage de votre téléphone ou de votre ordinateur.")}</p><div>${prefs()}</div></section>
      <form class="card card-p form" id="profile" style="max-width:560px"><h2>${isPro() ? t("Votre entreprise") : t("Vos informations")}</h2>
        ${isPro() ? `<div class="field"><label for="pf-company">${t("Nom de l'entreprise")}</label><input id="pf-company" name="company" required value="${esc(me.company)}"></div>` : ""}
        ${me.company_id ? `<p class="muted" style="font-size:.8rem">${t("Numéro d'entreprise : {id}", { id: esc(me.company_id) })}</p>` : ""}
        <div class="row2"><div class="field"><label for="pf-contact">${t("Votre nom")}</label><input id="pf-contact" name="contact_name" required value="${esc(me.contact_name)}"></div>
        <div class="field"><label for="pf-city">${t("Ville")}</label><input id="pf-city" name="city" value="${esc(me.city)}"></div></div>
        <div><button class="btn" type="submit">${t("Enregistrer")}</button></div></form>
      <form class="card card-p form" id="password" style="max-width:560px"><h2>${me.has_password ? t("Mot de passe") : t("Ajouter un mot de passe")}</h2>
        ${me.has_password ? "" : `<p class="muted" style="font-size:.86rem">${me.google || me.apple ? t("Vous vous connectez avec Google. Un mot de passe vous permet aussi de vous connecter avec votre e-mail.") : t("Vous vous connectez avec un code reçu par WhatsApp ou SMS. Un mot de passe est facultatif.")}</p>`}
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
        <div class="field"><label for="del-password">${me.has_password ? t("Votre mot de passe, pour confirmer") : me.email ? t("Votre adresse e-mail, pour confirmer") : t("Votre numéro de téléphone, pour confirmer")}</label><input id="del-password" name="password" type="${me.has_password ? "password" : me.email ? "email" : "tel"}" required autocomplete="${me.has_password ? "current-password" : "off"}"></div>
        <div><button class="btn danger" type="submit">${t("Supprimer définitivement mon compte")}</button></div></form>
      <div><button type="button" class="btn ghost" data-logout>${t("Se déconnecter")}</button></div>`);
    $("#phone-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { me = await api("/api/me/phone", { method: "POST", body: { phone: $("#ph-num").value, dial: $("#ph-dial").value } }); location.href = "/inscription/confirmer?retour=compte"; } catch (err) { toast(err.message); }
    });
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
  let outboxCount = 0;
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
    const before = outboxCount;
    const r = await outbox.flush();
    outboxCount = r.left;
    r.refused.forEach((m) => toast(t("Une publication en attente a été refusée : {msg}", { msg: m })));
    if (r.sent) toast(plural(r.sent, "{n} publication en attente est partie.", "{n} publications en attente sont parties."));
    else if (manual && outboxCount) toast(t("Toujours pas de réseau. Nouvel essai automatique dès qu'il revient."));
    if (r.sent || before !== outboxCount) route();
  }
  window.addEventListener("online", () => { if (me && me.account_type !== "client" && me.account_type !== "membre") flushOutbox(); });

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
            : r.verify === "coherent" ? `<p class="proof part">${ic("check", 16)} ${t("Publication cohérente : elle deviendra « vérifiée » quand le client aura confirmé la position du chantier.")}</p>`
            : r.verify === "warning" ? `<p class="proof warn">${ic("warn", 16)} ${t("Le client verra « À vérifier » : photo ancienne ou prise loin du chantier.")}</p>`
            : `<p class="proof part">${ic("eye", 16)} ${t("Vérification partielle : activez la localisation et prenez les photos sur place.")}</p>`;
          finish(t("Publié en {n} s", { n: Math.max(1, Math.round((Date.now() - t0) / 1000)) }), `${proof}<p class="muted">${r.notified ? t("{who} a reçu un e-mail avec le lien.", { who: esc(site.client_short) }) : t("{who} le voit sur son lien privé.", { who: esc(site.client_name) })} ${t("Vous pouvez aussi envoyer le lien sur WhatsApp.")}</p>`);
        } catch (err) {
          if (!err.offline) { st.textContent = err.message; btn.disabled = false; return; }
          // Pas de réseau : la publication attend sur le téléphone.
          try { await outbox.add({ ...item, label: t("Mise à jour") }); } catch (x) { st.textContent = err.message; btn.disabled = false; return; }
          outboxCount = await outbox.count();
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
  const otherSpace = () => !me || me.account_type === "client" || me.account_type === "membre";
  window.addEventListener("hashchange", () => { if (otherSpace()) return; if (!$("#composer").hidden && !$("#cmp-done-title")) closeComposer(); if (!/^#chantier-/.test(location.hash)) siteTab = "journal"; route().then(() => window.scrollTo(0, 0)); });

  let pendingNewLink = false;
  document.addEventListener("click", async (e) => {
    if (otherSpace()) return;
    const b = e.target.closest("button, tr[data-site]");
    if (!b) return;
    const d = b.dataset;
    if (d.go) { if (location.hash === "#" + d.go) route(); else location.hash = d.go; }
    else if (d.openSite) { siteTab = d.tab || "journal"; if (location.hash === "#chantier-" + d.openSite) route(); else location.hash = "chantier-" + d.openSite; }
    else if (d.site) location.hash = "chantier-" + d.site;
    else if (d.check) act(() => api(`/api/updates/${d.check}/check`, { method: "POST" }), t("Rapport vérifié."));
    else if (d.checkAll) act(() => api(`/api/sites/${d.checkAll}/check-all`, { method: "POST" }), t("Rapports vérifiés."));
    else if (d.share) act(() => api(`/api/updates/${d.share}/share`, { method: "POST", body: { share: true } }), t("Le client le voit maintenant sur son suivi."));
    else if (d.unshare) act(() => api(`/api/updates/${d.unshare}/share`, { method: "POST", body: { share: false } }), t("Caché au client. L'équipe le voit toujours."));
    else if (d.resolve) act(() => api(`/api/updates/${d.resolve}/resolve`, { method: "POST" }), t("Problème mis à jour."));
    else if (d.review) act(() => api(`/api/ledger/${d.review}/review`, { method: "POST", body: { decision: d.decision } }), d.decision === "approve" ? t("Dépense approuvée : elle compte dans le budget utilisé.") : t("Dépense refusée. Elle reste visible, barrée."));
    else if (d.memberDel) {
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("Confirmer : retirer du chantier"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t("Retirer du chantier"); } }, 5000); return; }
      act(() => api(`/api/team/${d.memberDel}`, { method: "DELETE" }), t("Retiré du chantier : il n'y a plus accès."));
    }
    else if (d.inviteDel) act(() => api(`/api/team-invites/${d.inviteDel}`, { method: "DELETE" }), t("Invitation annulée."));
    else if (d.pay) { b.disabled = true; try { const r = await api("/api/billing/checkout", { method: "POST", body: { plan: d.pay, lang } }); location.href = r.url; } catch (err) { toast(err.message); b.disabled = false; } }
    else if (d.portal !== undefined) { try { const r = await api("/api/billing/portal", { method: "POST" }); if (r.url) location.href = r.url; else { toast(t("Abonnement mis à jour.")); me = await api("/api/me"); route(); } } catch (err) { toast(err.message); } }
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
    // Inscrit avec son numéro : il le confirme d'abord (code par WhatsApp ou SMS).
    if (me.phone && !me.phone_verified && !me.email && location.hash !== "#compte") { location.href = "/inscription/confirmer"; return; }
    const q = new URLSearchParams(location.search);
    if (q.get("paiement")) { toast(q.get("paiement") === "ok" ? t("Paiement reçu : votre offre est active. Merci !") : t("Paiement annulé : rien n'a été débité.")); history.replaceState(null, "", location.pathname + location.hash); }
    if (me.account_type === "client") return window.AFSpace.start(me);
    if (me.account_type === "membre") return window.AFTerrain.start(me);
    outboxCount = await outbox.count();
    route();
    if (outboxCount && navigator.onLine) flushOutbox();
  })();
})();
