// Espace client : tous ses chantiers au même endroit, ajout par numéro de suivi, chantier confié à une entreprise ou à un proche.
(function () {
  "use strict";
  const { t, LOGO, ic, esc, prefs, themeToggle, installCard, installNudge, moneyPanel, versementForm, curLabel, upload, money, dShort, nf, plural, rel, api, toast, copy, healthChip, mapLink, billingCards, dialSelect, lang } = window.AF;
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  let me = null;
  let templates = null;
  const isMobile = () => window.matchMedia("(max-width: 760px)").matches;
  const inviteUrl = (code) => `${location.origin}/invitation/${code}`;
  const waLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
  const initials = (n) => n.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();

  const NAV = [["mes-chantiers", "Mes chantiers", "home"], ["ajouter", "Ajouter un chantier", "plus"], ["offre", "Mon offre", "card"], ["compte", "Compte", "user"]];
  const planLine = (c) => (c.status === "trial" ? plural(c.days_left, "Essai Plus : encore {n} jour", "Essai Plus : encore {n} jours") : c.status === "paid" ? t("Plus jusqu'au {date}", { date: dShort(c.until) }) : t("Offre gratuite"));

  function shell(section, body) {
    const on = (k) => k === section || (k === "mes-chantiers" && section === "chantier") || (k === "ajouter" && section === "nouveau");
    app.innerHTML = `<div class="shell">
      <aside class="side">
        <a class="logo" href="#mes-chantiers">${LOGO(24)} Archfield</a>
        <nav aria-label="${t("Menu")}">${NAV.map(([k, l, i]) => `<button type="button" data-go="${k}" ${on(k) ? 'aria-current="page"' : ""}>${ic(i, 17)} ${t(l)}</button>`).join("")}</nav>
        <div class="who">
          <div class="side-prefs">${prefs()}</div>
          <div class="plan-card"><b>${esc(me.contact_name)}</b><span>${planLine(me.client)}</span></div>
          <button type="button" class="logout" data-logout>${t("Se déconnecter")}</button>
        </div>
      </aside>
      <div class="content">
        <div class="mhead"><a class="logo" href="#mes-chantiers">${LOGO(30)} Archfield</a><span class="mhead-r">${themeToggle()}<a class="avatar" href="#compte" title="${esc(me.contact_name)}" style="text-decoration:none">${esc(initials(me.contact_name))}</a></span></div>
        <div class="content-in">${installNudge()}${body}</div>
      </div>
      <nav class="tabbar" aria-label="${t("Onglets")}">${NAV.map(([k, l, i]) => `<button type="button" data-go="${k}" ${on(k) ? 'aria-current="page"' : ""}>${ic(i, 24)}<span>${t(k === "ajouter" ? "Ajouter" : l)}</span></button>`).join("")}</nav>
    </div>`;
  }
  const loading = (s) => shell(s, `<p class="loading">${t("Chargement…")}</p>`);

  const managerLine = (s) => s.self_managed
    ? (s.invitations.length ? `<span class="chip wait">${t("Invitation envoyée")}</span>` : `<span class="chip idle">${t("Pas encore confié")}</span>`)
    : `<span class="mgr">${ic(s.manager.type === "pro" ? "tool" : "users", 15)} ${s.manager.type === "pro" ? t("{name} (entreprise)", { name: esc(s.manager.name) }) : t("{name} (proche)", { name: esc(s.manager.name) })}</span>`;

  /* ---------- Mes chantiers ---------- */
  async function pageSites() {
    loading("mes-chantiers");
    const { sites, plan } = await api("/api/client/sites");
    me.client = plan;
    const first = me.contact_name.split(" ")[0];
    const card = (s) => `<article class="card sp-card">
      <div class="sp-top"><div><h2>${esc(s.name)}</h2><p class="meta">${esc(s.location || "")}</p></div>${s.money.alert ? `<span class="chip warn">${t("Argent à vérifier")}</span>` : s.unseen ? `<span class="chip wait">${plural(s.unseen, "{n} nouveauté", "{n} nouveautés")}</span>` : s.self_managed ? "" : healthChip(s)}</div>
      <div class="sp-mgr">${managerLine(s)}</div>
      <span class="track"><span style="width:${s.progress}%"></span></span>
      ${s.money.paid ? `<p class="meta">${t("Versé : {paid} sur {budget} · travaux réalisés : {done} %", { paid: money(s.money.paid, s.money.currency), budget: s.money.budget ? money(s.money.budget, s.money.currency) : "—", done: s.progress })}</p>` : ""}
      <p class="meta">${s.progress} % · ${s.running ? t("Étape en cours : {step}", { step: esc(s.running.name) }) : s.toValidate ? t("Une étape attend votre validation") : t("Aucune étape en cours")}${s.last_update_at ? " · " + t("dernière mise à jour {when}", { when: rel(s.last_update_at).toLowerCase() }) : ""}</p>
      <div class="row-acts">${s.self_managed && !s.last_update_at ? "" : `<a class="btn primary" href="/c/${esc(s.client_token)}">${t("Voir le suivi")}</a>`}<a class="btn ghost" href="#chantier-${s.id}">${s.self_managed ? t("Confier ce chantier") : t("Gérer")}</a></div>
    </article>`;
    shell("mes-chantiers", `<div class="pagehead"><div><p class="sub">${t("Espace client")}</p><h1>${t("Bonjour {name}", { name: esc(first) })}</h1></div>
      <div class="acts"><a class="btn ghost" href="#ajouter">${ic("key", 15)} ${t("Ajouter avec un numéro de suivi")}</a><a class="btn primary" href="#nouveau">${ic("plus", 15)} ${t("Créer un chantier")}</a></div></div>
      ${sites.length ? `<div class="sites">${sites.map(card).join("")}</div>` : `<section class="card empty sp-empty">
        <h2>${t("Tous vos chantiers, au même endroit")}</h2>
        <p>${t("Votre artisan vous a donné un numéro de suivi ? Ajoutez-le pour suivre le chantier ici. Vous pouvez aussi créer votre chantier et le confier à une entreprise ou à un proche sur place.")}</p>
        <div class="row-acts"><a class="btn primary" href="#ajouter">${t("Ajouter avec un numéro de suivi")}</a><a class="btn ghost" href="#nouveau">${t("Créer un chantier")}</a></div></section>`}
      ${isMobile() && sites.length ? `<div class="row-acts"><a class="btn ghost" href="#ajouter">${t("Ajouter avec un numéro de suivi")}</a><a class="btn primary" href="#nouveau">${t("Créer un chantier")}</a></div>` : ""}`);
  }

  /* ---------- Ajouter avec un numéro de suivi ---------- */
  function pageAdd() {
    shell("ajouter", `<div class="sp-narrow">
      <div class="pagehead"><div><h1>${t("Ajouter un chantier")}</h1><p class="sub">${t("Saisissez le numéro de suivi donné par votre artisan, comme pour suivre un colis.")}</p></div></div>
      <form class="card card-p form sp-track" id="claim">
        <div class="field"><label for="cl-code">${t("Numéro de suivi")}</label><input id="cl-code" name="code" required placeholder="ARC-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
        <div class="error-box" hidden></div>
        <button class="btn primary" type="submit">${t("Ajouter à mon espace")}</button>
        <p class="muted" style="font-size:.84rem">${t("Le numéro figure dans le message de votre artisan, ou en haut de la page de suivi de votre chantier.")}</p>
      </form>
      <section class="card card-p sp-alt"><h2>${t("Votre chantier n'est pas encore sur Archfield ?")}</h2><p class="muted">${t("Créez-le vous-même, puis confiez-le à l'entreprise de votre choix ou à un proche sur place.")}</p><div><a class="btn" href="#nouveau">${t("Créer un chantier")}</a></div></section>
    </div>`);
    $("#cl-code").focus();
    $("#claim").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = e.target.querySelector(".error-box");
      try { const r = await api("/api/client/claim", { method: "POST", body: { code: $("#cl-code").value } }); toast(t("« {site} » est ajouté à votre espace.", { site: r.name })); location.hash = "mes-chantiers"; }
      catch (x) { err.textContent = x.message; err.hidden = false; }
    });
  }

  /* ---------- Créer un chantier ---------- */
  async function pageNew() {
    templates = templates || (await api("/api/templates"));
    shell("nouveau", `<div class="sp-narrow">
      <button type="button" class="back" data-go="mes-chantiers">${ic("left", 16)} ${t("Mes chantiers")}</button>
      <div class="pagehead"><div><h1>${t("Créer un chantier")}</h1><p class="sub">${t("Ensuite, vous le confierez à une entreprise ou à un proche sur place.")}</p></div></div>
      <form class="card card-p form" id="new-site">
        <div class="row2">
          <div class="field"><label for="ns-name">${t("Nom du chantier")}</label><input id="ns-name" name="name" required maxlength="120" placeholder="${t("Maison familiale")}"></div>
          <div class="field"><label for="ns-location">${t("Lieu")}</label><input id="ns-location" name="location" maxlength="120" placeholder="Thiès, Sénégal"></div>
        </div>
        <div class="field" style="max-width:360px"><label for="ns-currency">${t("Monnaie du chantier")}</label><select id="ns-currency" name="currency">
          <option value="XOF" ${me.currency === "XOF" || me.currency === "EUR" ? "selected" : ""}>${t("Franc CFA (Afrique de l'Ouest)")}</option><option value="XAF" ${me.currency === "XAF" ? "selected" : ""}>${t("Franc CFA (Afrique centrale)")}</option><option value="EUR">${t("Euro")}</option></select>
          <span class="hint">${t("Celle des devis et des paiements sur place.")}</span></div>
        <div class="field"><span class="fl">${t("Type de travaux")}</span><div class="seg-choice">
          <label><input type="radio" name="kind" value="ext" checked><b>${t("Construction")}</b><span>${t("Terrassement, fondations, murs, toiture…")}</span></label>
          <label><input type="radio" name="kind" value="int"><b>${t("Rénovation")}</b><span>${t("Démolition, plomberie, électricité…")}</span></label></div></div>
        <div class="field"><span class="fl">${t("Étapes et durées prévues (jours)")}</span><div class="step-rows" id="ns-steps"></div>
          <button type="button" class="btn ghost" id="ns-add" style="justify-self:start">${ic("plus", 14)} ${t("Ajouter une étape")}</button></div>
        <div class="error-box" hidden></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><a class="btn ghost" href="#mes-chantiers">${t("Annuler")}</a><button type="submit" class="btn primary">${t("Créer le chantier")}</button></div>
      </form></div>`);
    const rows = $("#ns-steps");
    const row = (name = "", d = "") => {
      const i = rows.children.length + 1;
      rows.insertAdjacentHTML("beforeend", `<div class="step-row"><span class="i">${i}</span><input aria-label="${t("Étape {i}", { i })}" maxlength="80" value="${esc(name)}" required><input aria-label="${t("Jours prévus, étape {i}", { i })}" type="number" min="0.5" max="365" step="0.5" value="${d}" required><button type="button" class="icon-btn" data-rm-row aria-label="${t("Retirer l'étape")}">${ic("x", 14)}</button></div>`);
    };
    const fill = (kind) => { rows.innerHTML = ""; templates[kind].forEach(([n, d]) => row(t(n), d)); };
    fill("ext");
    $("#new-site").addEventListener("change", (e) => { if (e.target.name === "kind") fill(e.target.value); });
    $("#ns-add").addEventListener("click", () => { row(); rows.lastElementChild.querySelector("input").focus(); });
    rows.addEventListener("click", (e) => { const b = e.target.closest("[data-rm-row]"); if (b && rows.children.length > 1) { b.parentElement.remove(); [...rows.children].forEach((r, i) => { r.querySelector(".i").textContent = i + 1; }); } });
    $("#new-site").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target), err = e.target.querySelector(".error-box");
      const body = { name: f.get("name"), location: f.get("location"), kind: f.get("kind"), currency: f.get("currency"), steps: [...rows.children].map((r) => { const [n, d] = r.querySelectorAll("input"); return { name: n.value, planned_days: Number(d.value) }; }) };
      try { const s = await api("/api/client/sites", { method: "POST", body }); toast(t("Chantier créé. Confiez-le maintenant à une entreprise ou à un proche.")); location.hash = "chantier-" + s.id; }
      catch (x) { err.textContent = x.message; err.hidden = false; }
    });
  }

  /* ---------- Un chantier : numéro de suivi, gestionnaire, invitation ---------- */
  async function pageSite(id) {
    loading("chantier");
    const { sites, plan } = await api("/api/client/sites");
    me.client = plan;
    const s = sites.find((x) => x.id === id);
    if (!s) return shell("chantier", `<div class="error-box">${t("Chantier introuvable.")}</div>`);
    const inv = s.invitations[0];
    const freeSlots = plan.slots - plan.used;
    let manage;
    if (inv) {
      const url = inviteUrl(inv.code);
      const who = inv.kind === "proche" ? t("à un proche") : t("à une entreprise");
      manage = `<section class="card card-p sp-invite"><h2>${t("Invitation en attente")}</h2>
        <p class="muted">${t("Vous avez confié ce chantier {who}. Envoyez-lui ce lien : il crée son compte (ou se connecte) et le chantier apparaît chez lui.", { who })}</p>
        <div class="sp-code"><span>${t("Code d'invitation")}</span><b>${esc(inv.code)}</b></div>
        <div class="link"><code>${esc(url)}</code><button type="button" class="btn ghost" data-copy="${esc(url)}">${t("Copier")}</button></div>
        <div class="row-acts"><a class="btn wa" target="_blank" rel="noopener" href="${waLink(t("Bonjour, je vous confie le suivi de mon chantier « {site} » sur Archfield. Créez votre accès ici : {url}", { site: s.name, url }))}">${t("Envoyer par WhatsApp")}</a><button type="button" class="btn ghost" data-cancel-invite="${s.id}">${t("Annuler l'invitation")}</button></div>
      </section>`;
    } else if (s.self_managed) {
      manage = `<section class="card card-p"><h2>${t("Confier ce chantier")}</h2><p class="muted">${t("Qui sera sur place pour publier l'avancement ?")}</p>
        <div class="sp-choices">
          <button type="button" class="sp-choice" data-invite="pro" data-site="${s.id}">${ic("tool", 22)}<b>${t("Une entreprise du BTP")}</b><span>${t("Elle s'inscrit avec son numéro d'entreprise (SIRET en France). Gratuit pour vous.")}</span></button>
          <button type="button" class="sp-choice" data-invite="proche" data-site="${s.id}" ${plan.plan === "free" ? "data-locked" : ""}>${ic("users", 22)}<b>${t("Un proche sur place")}</b><span>${plan.plan === "free" ? t("Avec l'offre Plus. Votre proche ne paie rien.") : plural(Math.max(0, freeSlots), "Votre proche ne paie rien. {n} place restante dans votre offre.", "Votre proche ne paie rien. {n} places restantes dans votre offre.")}</span></button>
        </div>
        <div class="field" style="max-width:360px"><label for="inv-name">${t("Son nom (facultatif)")}</label><input id="inv-name" maxlength="120" placeholder="${t("Ousmane Ndiaye")}"></div>
      </section>`;
    } else {
      manage = `<section class="card card-p"><h2>${t("Gestion du chantier")}</h2>
        <p>${managerLine(s)}</p>
        <p class="muted">${s.manager.type === "pro" ? t("L'entreprise publie l'avancement. Vous le suivez ici, gratuitement.") : t("Votre proche publie l'avancement. Son accès est inclus dans votre offre.")}</p>
        ${s.can_take_back ? "" : `<p class="muted">${t("L'entreprise a créé ce chantier : elle seule peut vous le rendre.")}</p>`}
        <div class="row-acts">${s.can_take_back ? `<button type="button" class="btn ghost" data-take-back="${s.id}">${t("Reprendre la main")}</button>` : ""}${s.manager.type === "pro" ? `<button type="button" class="btn ghost" data-remove="${s.id}">${t("Retirer de mon espace")}</button>` : ""}</div>
      </section>`;
    }
    // Chantier géré par le client lui-même : son équipe sur place (chef de chantier, tâcheron) publie pour lui.
    let teamHtml = "";
    if (s.self_managed) {
      const tm = await api(`/api/sites/${s.id}/team`).catch(() => null);
      if (tm) teamHtml = `<section class="card card-p sp-stack"><h2>${t("Votre équipe sur place")}</h2>
        <p class="muted">${t("Chef de chantier, tâcheron : ils envoient le rapport du jour, les photos et les dépenses depuis leur téléphone. Vous approuvez chaque dépense.")}</p>
        ${tm.members.length ? `<ul class="team">${tm.members.map((m) => `<li><div class="tm-h"><div><b>${esc(m.contact_name)}</b><span class="muted sm">${esc(m.phone || m.email || "")}</span></div><span class="chip idle">${m.role === "chef_chantier" ? t("Chef de chantier") : m.role === "chef_equipe" ? t("Chef d'équipe") : t("Personnalisé")}</span><button type="button" class="btn ghost" data-member-del="${m.id}">${t("Retirer")}</button></div></li>`).join("")}</ul>` : ""}
        ${tm.invites.map((i) => { const url = inviteUrl(i.code); return `<div class="sp-invite"><p><b>${esc(i.invitee_name)}</b> · ${t("invitation en attente")}</p><div class="link"><code>${esc(url)}</code><button type="button" class="btn ghost" data-copy="${esc(url)}">${t("Copier")}</button></div><div class="row-acts"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${/^\+/.test(i.invitee_contact) ? i.invitee_contact.replace(/\D/g, "") : ""}?text=${encodeURIComponent(t("Bonjour {who}, rejoignez le chantier « {site} » sur Archfield : {url}", { who: i.invitee_name.split(" ")[0], site: s.name, url }))}">${t("Envoyer par WhatsApp")}</a><button type="button" class="btn ghost" data-invite-del="${i.id}">${t("Annuler l'invitation")}</button></div></div>`; }).join("")}
        ${plan.plan === "free" ? `<p class="muted sm">${t("Avec l'offre Plus.")} <a href="#offre">${t("Voir l'offre Plus")}</a></p>` : `<form class="form" id="team-add"><div class="row2"><div class="field"><label for="tm-name">${t("Nom")}</label><input id="tm-name" name="name" required maxlength="120"></div>
          <div class="field"><label for="tm-contact">${t("Téléphone (WhatsApp) ou e-mail")}</label><input id="tm-contact" name="contact" required maxlength="200" placeholder="+229 01 97 00 00 00"></div></div>
          <div class="seg" role="group" aria-label="${t("Rôle")}"><label><input type="radio" name="role" value="chef_chantier" checked><span>${t("Chef de chantier")}</span></label><label><input type="radio" name="role" value="chef_equipe"><span>${t("Chef d'équipe")}</span></label></div>
          <div><button class="btn" type="submit">${t("Inviter")}</button></div></form>`}
      </section>`;
    }
    shell("chantier", `<div class="sp-narrow">
      <button type="button" class="back" data-go="mes-chantiers">${ic("left", 16)} ${t("Mes chantiers")}</button>
      <section class="card sitecard">
        <div class="t"><h1>${esc(s.name)}</h1><span class="pct">${s.progress} %</span></div>
        <p class="where">${esc(s.location || "")}</p>
        <span class="track"><span style="width:${s.progress}%"></span></span>
        <div class="sp-code"><span>${t("Numéro de suivi")}</span><b>${esc(s.tracking_code)}</b><button type="button" class="btn ghost" data-copy="${esc(s.tracking_code)}">${t("Copier")}</button></div>
        ${s.last_update_at || !s.self_managed ? `<a class="bigbtn" href="/c/${esc(s.client_token)}">${ic("eye", 22)} ${t("Voir le suivi du chantier")}</a>` : ""}
      </section>
      ${manage}
      ${teamHtml}
      <h2 class="section-t">${t("Argent du chantier")}</h2>
      ${moneyPanel(s.money, { me: me.id, forClient: true, review: s.self_managed })}
      ${plan.plan === "free" ? `<section class="card card-p sp-alt"><h2>${t("Suivez chaque versement avec l'offre Plus")}</h2><p class="muted">${t("Notez ce que vous envoyez, comparez-le aux travaux réalisés et soyez alerté si vous payez trop tôt.")}</p><div><a class="btn primary" href="#offre">${t("Voir l'offre Plus")}</a></div></section>` : versementForm(curLabel(s.money.currency))}
      <section class="card card-p sp-stack"><h2>${t("Visite de contrôle")}</h2>
        <p class="muted">${t("Vous ne pouvez pas aller sur le chantier ? Une personne de confiance s'y rend, vérifie l'avancement et vous envoie un compte rendu avec photos. Nous vous rappelons avec un prix avant toute visite.")}</p>
        ${s.visits.length ? `<ul class="m-sched">${s.visits.map((v) => `<li><span>${t("Demandée le {date}", { date: dShort(v.created_at) })}${v.wished_date ? " · " + t("souhaitée le {date}", { date: dShort(v.wished_date) }) : ""}</span><span class="chip wait">${t("Nous vous recontactons")}</span></li>`).join("")}</ul>` : ""}
        <form class="form" id="visit"><div class="row2"><div class="field"><label for="vi-date">${t("Date souhaitée (facultatif)")}</label><input id="vi-date" name="wished_date" type="date"></div>
          <div class="field"><label for="vi-phone">${t("Votre téléphone / WhatsApp")}</label><input id="vi-phone" name="phone" type="tel" maxlength="30" placeholder="+33 6 12 34 56 78"></div></div>
          <div class="field"><label for="vi-note">${t("Ce qu'il faut vérifier (facultatif)")}</label><textarea id="vi-note" name="note" maxlength="1000" placeholder="${t("Ex. : les murs sont-ils vraiment montés ? Combien de sacs de ciment sur place ?")}"></textarea></div>
          <div><button class="btn" type="submit">${t("Demander une visite")}</button></div></form></section>
      <section class="card card-p sp-stack"><h2>${t("Position du chantier")}</h2>
        <p class="muted">${!s.position ? t("Pas encore enregistrée : elle le sera à la première publication faite sur place, téléphone localisé.")
          : s.position.confirmed_at ? t("Enregistrée le {date} par {who} et confirmée par vous. Chaque photo publiée est comparée à cette position : si elle est prise ailleurs, vous le voyez dans le journal.", { date: dShort(s.position.set_at), who: esc(s.position.set_by) })
          : t("Enregistrée le {date} par {who}. Vérifiez sur la carte que c'est bien votre chantier, puis confirmez : les publications faites sur place seront alors « vérifiées ».", { date: dShort(s.position.set_at), who: esc(s.position.set_by) })}</p>
        ${s.position ? `<div class="row-acts">${s.position.confirmed_at ? "" : `<a class="btn ghost" href="${mapLink(s.position)}" target="_blank" rel="noopener">${t("Voir sur la carte")}</a><button type="button" class="btn primary" data-confirm-position="${s.id}">${t("C'est bien mon chantier")}</button>`}<button type="button" class="btn ghost" data-reset-position="${s.id}">${t("Effacer la position")}</button></div>` : ""}</section>
    </div>`);
    const ta = $("#team-add");
    if (ta) ta.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { const r = await api(`/api/sites/${s.id}/team`, { method: "POST", body: { name: ta.name.value, contact: ta.contact.value, role: new FormData(ta).get("role"), country: me.country } }); toast(r.added ? t("{who} fait maintenant partie de l'équipe.", { who: r.name }) : t("Invitation créée. Envoyez-lui le lien par WhatsApp.")); route(); } catch (x) { toast(x.message); }
    });
    const vf = $("#add-versement");
    if (vf) vf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(vf); fd.append("kind", "versement");
      try { await upload(`/api/sites/${s.id}/ledger`, fd); toast(t("Versement noté.")); route(); } catch (x) { toast(x.message); }
    });
    $("#visit").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api(`/api/client/sites/${s.id}/visits`, { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); toast(t("Demande envoyée. Nous vous recontactons sous 48 h avec un prix.")); route(); } catch (x) { toast(x.message); }
    });
  }

  /* ---------- Mon offre ---------- */
  async function pageOffer() {
    loading("offre");
    const [b, sitesData] = await Promise.all([api("/api/billing"), api("/api/client/sites")]);
    const c = me.client = sitesData.plan;
    shell("offre", `<div class="pagehead"><div><p class="sub">${planLine(c)}</p><h1>${t("Mon offre")}</h1></div></div>
      <p class="muted" style="max-width:62ch">${t("Suivre des chantiers gérés par des entreprises est toujours gratuit. L'offre Plus ajoute le suivi de votre argent, vos proches et votre équipe sur place, et les visites de contrôle.")}</p>
      <div class="sp-plans">
        <article class="card card-p sp-plan ${c.plan === "free" ? "current" : ""}"><div class="card-h" style="margin:0"><h3>${t("Gratuit")}</h3>${c.plan === "free" ? `<span class="chip ok">${t("Votre offre")}</span>` : ""}</div>
          <p class="sp-price">${b.region === "eu" ? "0 €" : "0 $"}</p><ul><li>${t("Chantiers illimités")}</li><li>${t("Photos vérifiées, étapes, devis et rapports")}</li><li>${t("Ajout par numéro de suivi")}</li></ul></article>
      </div>
      ${c.status === "trial" ? `<p class="okbox">${ic("check", 18)} ${plural(c.days_left, "Essai Plus en cours : encore {n} jour, sans carte bancaire.", "Essai Plus en cours : encore {n} jours, sans carte bancaire.")}</p>` : ""}
      ${billingCards(b, { current: c.status === "paid" ? "plus" : null })}
      ${c.status === "paid" && (b.card || b.mode === "test") ? `<div><button type="button" class="btn ghost" data-portal>${b.mode === "test" ? (b.cancel_at_end ? t("Reprendre l'abonnement") : t("Arrêter à la fin du mois")) : t("Gérer mon abonnement (carte, factures)")}</button></div>` : ""}
      <section class="card card-p"><h2>${t("Proches et équipe")}</h2><p>${t("{used} sur {slots} utilisés.", { used: c.used, slots: c.slots })}</p></section>`);
  }

  /* ---------- Compte ---------- */
  async function pageAccount() {
    if (!window.AF_CONFIG) window.AF_CONFIG = await api("/api/config", { authRedirect: false }).catch(() => ({ dial: [] }));
    shell("compte", `<div class="pagehead"><div><p class="sub">${esc([me.email, me.phone_pretty].filter(Boolean).join(" · "))}${me.google ? " · " + t("connecté avec Google") : ""}</p><h1>${t("Compte")}</h1></div></div>
      ${installCard()}
      <form class="card card-p form" id="phone-form" style="max-width:560px"><h2>${t("Téléphone")}</h2>
        ${me.phone ? `<p>${esc(me.phone_pretty)} ${me.phone_verified ? `<span class="chip ok">${t("Confirmé")}</span>` : `<span class="chip wait">${t("À confirmer")}</span> <a href="/inscription/confirmer">${t("Confirmer maintenant")}</a>`}</p>` : `<p class="muted" style="font-size:.86rem">${t("Pour vous connecter avec votre numéro et recevoir les codes par WhatsApp ou SMS.")}</p>`}
        <div class="ident"><label for="ph-num" class="sr-only">${t("Numéro de téléphone")}</label>${dialSelect("ph-dial", (window.AF_CONFIG && window.AF_CONFIG.dial) || [], me.country || undefined)}<input id="ph-num" name="phone" type="tel" required maxlength="30" autocomplete="tel"></div>
        <div><button class="btn" type="submit">${me.phone ? t("Changer de numéro") : t("Ajouter mon numéro")}</button></div></form>
      <section class="card card-p planbox"><h2>${t("Apparence et langue")}</h2><div>${prefs()}</div></section>
      <form class="card card-p form" id="profile" style="max-width:560px"><h2>${t("Vos informations")}</h2>
        <div class="row2"><div class="field"><label for="pf-contact">${t("Votre nom")}</label><input id="pf-contact" name="contact_name" required value="${esc(me.contact_name)}"></div>
        <div class="field"><label for="pf-city">${t("Ville")}</label><input id="pf-city" name="city" value="${esc(me.city || "")}"></div></div>
        <div><button class="btn" type="submit">${t("Enregistrer")}</button></div></form>
      <form class="card card-p form" id="password" style="max-width:560px"><h2>${me.has_password ? t("Mot de passe") : t("Ajouter un mot de passe")}</h2>
        <div class="row2">${me.has_password ? `<div class="field"><label for="pw-current">${t("Mot de passe actuel")}</label><input id="pw-current" name="current" type="password" required autocomplete="current-password"></div>` : ""}
        <div class="field"><label for="pw-new">${t("Nouveau mot de passe")}</label><input id="pw-new" name="password" type="password" required minlength="8" autocomplete="new-password"></div></div>
        <div><button class="btn" type="submit">${t("Enregistrer le mot de passe")}</button></div></form>
      <section class="card card-p planbox"><h2>${t("Sécurité")}</h2>
        <p class="muted" style="font-size:.86rem">${t("Téléphone perdu, ordinateur partagé ? Déconnectez tous vos autres appareils : il faudra s'y reconnecter avec le mot de passe.")}</p>
        <div><button type="button" class="btn ghost" data-logout-others>${t("Déconnecter mes autres appareils")}</button></div></section>
      <section class="card card-p planbox"><h2>${t("Vos données")}</h2><div class="row-acts"><a class="btn" href="/api/me/export" download>${t("Télécharger mes données")}</a><button type="button" class="btn ghost" data-cookies>${t("Gérer les cookies")}</button></div></section>
      <form class="card card-p form" id="delete-account" style="max-width:560px"><h2>${t("Supprimer le compte")}</h2>
        <p class="muted" style="font-size:.86rem">${t("Les chantiers que vous avez créés sont effacés. Ceux gérés par des entreprises restent chez elles.")}</p>
        <div class="field"><label for="del-password">${me.has_password ? t("Votre mot de passe, pour confirmer") : t("Votre adresse e-mail, pour confirmer")}</label><input id="del-password" name="password" type="${me.has_password ? "password" : "email"}" required></div>
        <div><button class="btn danger" type="submit">${t("Supprimer définitivement mon compte")}</button></div></form>
      <div><button type="button" class="btn ghost" data-logout>${t("Se déconnecter")}</button></div>`);
    const send = (id, fn) => $(id).addEventListener("submit", async (e) => { e.preventDefault(); try { await fn(Object.fromEntries(new FormData(e.target))); } catch (x) { toast(x.message); } });
    send("#phone-form", async (b) => { me = await api("/api/me/phone", { method: "POST", body: { phone: b.phone, dial: b.dial } }); location.href = "/inscription/confirmer?retour=compte"; });
    send("#profile", async (b) => { me = { ...me, ...(await api("/api/me", { method: "PATCH", body: { company: b.contact_name, ...b } })) }; toast(t("Profil enregistré.")); route(); });
    send("#password", async (b) => { await api("/api/me/password", { method: "POST", body: b }); me = await api("/api/me"); toast(t("Mot de passe enregistré. Vos autres appareils sont déconnectés.")); route(); });
    send("#delete-account", async (b) => { await api("/api/me", { method: "DELETE", body: b }); location.href = "/"; });
  }

  /* ---------- Routage et actions ---------- */
  async function route() {
    const h = location.hash.slice(1) || "mes-chantiers";
    try {
      const m = h.match(/^chantier-(\d+)$/);
      if (m) return await pageSite(Number(m[1]));
      await ({ "mes-chantiers": pageSites, ajouter: pageAdd, nouveau: pageNew, offre: pageOffer, compte: pageAccount }[h] || pageSites)();
    } catch (e) { shell(h, `<div class="error-box">${esc(e.message)}</div>`); }
  }
  async function act(fn, ok) { try { await fn(); if (ok) toast(ok); route(); } catch (e) { toast(e.message); } }

  function start(account) {
    me = account;
    window.addEventListener("hashchange", () => route().then(() => window.scrollTo(0, 0)));
    document.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const d = b.dataset;
      if (d.go) { if (location.hash === "#" + d.go) route(); else location.hash = d.go; }
      else if (d.copy) copy(d.copy, t("Copié."));
      else if (d.invite) {
        if (d.locked !== undefined) { toast(t("Confier un chantier à un proche demande l'offre Plus.")); location.hash = "offre"; return; }
        act(() => api(`/api/client/sites/${d.site}/invite`, { method: "POST", body: { kind: d.invite, name: $("#inv-name")?.value || "" } }), t("Invitation créée. Envoyez le lien."));
      }
      else if (d.cancelInvite) act(() => api(`/api/client/sites/${d.cancelInvite}/invite`, { method: "DELETE" }), t("Invitation annulée."));
      else if (d.takeBack || d.remove) {
        if (!b.dataset.armed) { b.dataset.armed = "1"; const label = b.textContent; b.textContent = d.takeBack ? t("Confirmer : il ne pourra plus publier") : t("Confirmer le retrait"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = label; } }, 5000); return; }
        if (d.takeBack) act(() => api(`/api/client/sites/${d.takeBack}/take-back`, { method: "POST" }), t("Vous gérez de nouveau ce chantier."));
        else { try { await api(`/api/client/sites/${d.remove}`, { method: "DELETE" }); toast(t("Chantier retiré de votre espace.")); location.hash = "mes-chantiers"; } catch (x) { toast(x.message); } }
      }
      else if (d.ledgerCancel) {
        if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("Confirmer l'annulation"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t("Annuler"); } }, 5000); return; }
        act(() => api(`/api/ledger/${d.ledgerCancel}/cancel`, { method: "POST", body: {} }), t("Ligne annulée. Elle reste visible, barrée."));
      }
      else if (d.confirmPosition) act(() => api(`/api/client/sites/${d.confirmPosition}/position/confirm`, { method: "POST" }), t("Position confirmée. Les photos prises sur place sont maintenant vérifiées."));
      else if (d.resetPosition) {
        if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("Confirmer : effacer la position"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t("Effacer la position"); } }, 5000); return; }
        act(() => api(`/api/client/sites/${d.resetPosition}/position/reset`, { method: "POST" }), t("Position effacée. La prochaine publication sur place l'enregistrera."));
      }
      else if (d.review) act(() => api(`/api/ledger/${d.review}/review`, { method: "POST", body: { decision: d.decision } }), d.decision === "approve" ? t("Dépense approuvée : elle compte dans le budget utilisé.") : t("Dépense refusée. Elle reste visible, barrée."));
      else if (d.memberDel) {
        if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("Confirmer : retirer du chantier"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = t("Retirer"); } }, 5000); return; }
        act(() => api(`/api/team/${d.memberDel}`, { method: "DELETE" }), t("Retiré du chantier : il n'y a plus accès."));
      }
      else if (d.inviteDel) act(() => api(`/api/team-invites/${d.inviteDel}`, { method: "DELETE" }), t("Invitation annulée."));
      else if (d.pay) { b.disabled = true; try { const r = await api("/api/billing/checkout", { method: "POST", body: { plan: d.pay, lang } }); location.href = r.url; } catch (x) { toast(x.message); b.disabled = false; } }
      else if (d.portal !== undefined) { try { const r = await api("/api/billing/portal", { method: "POST" }); if (r.url) location.href = r.url; else { toast(t("Abonnement mis à jour.")); route(); } } catch (x) { toast(x.message); } }
      else if (d.logoutOthers !== undefined) { try { const r = await api("/api/me/logout-others", { method: "POST" }); toast(plural(r.closed, "{n} autre appareil déconnecté.", "{n} autres appareils déconnectés.")); } catch (x) { toast(x.message); } }
      else if (d.logout !== undefined) { await api("/api/logout", { method: "POST" }); location.href = "/connexion"; }
    });
    route();
  }

  window.AFSpace = { start };
})();
