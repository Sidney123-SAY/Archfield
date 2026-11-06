// Espace d'administration : vue d'ensemble, comptes (offre activée à la main), visites, paiements,
// images de la page d'accueil (vraies photos de chantier, captures de l'application).
(function () {
  "use strict";
  const { t, ic, esc, api, toast, dShort, rel, LOGO, prefs, upload } = window.AF;
  const $ = (s) => document.querySelector(s);
  const app = $("#app");
  const TABS = [["comptes", "Comptes"], ["visites", "Visites de contrôle"], ["paiements", "Paiements"], ["images", "Images du site"]];
  const TYPE = { pro: "Entreprise", client: "Client", proche: "Proche", membre: "Équipe" };
  let tab = location.hash.slice(1) || "comptes", q = "", data = null;

  function shell(body) {
    app.innerHTML = `<div class="adm">
      <header class="adm-head"><a class="logo" href="/app">${LOGO(24)} Archfield</a><b>${t("Administration")}</b><span class="adm-prefs">${prefs()}</span><a class="btn ghost" href="/app">${t("Retour à l'application")}</a></header>
      <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${t(l)}</button>`).join("")}</nav>
      <main class="adm-main">${body}</main></div>`;
  }
  const planOf = (a) => {
    const now = Date.now();
    if (a.paid_until && Date.parse(a.paid_until) > now) return `<span class="chip ok">${esc(a.plan)} · ${dShort(a.paid_until)}</span>`;
    if (Date.parse(a.trial_ends_at) > now && (a.account_type === "pro" || a.account_type === "client")) return `<span class="chip wait">${t("Essai")} · ${dShort(a.trial_ends_at)}</span>`;
    return `<span class="chip idle">${t("Gratuit")}</span>`;
  };

  async function render() {
    try { data = await api("/api/admin/overview" + (q ? "?q=" + encodeURIComponent(q) : "")); }
    catch (e) { return shell(`<div class="error-box">${esc(e.message)}</div><p class="muted">${t("Cette page est réservée à l'équipe Archfield. Un administrateur est nommé avec la commande « npm run admin -- <e-mail ou téléphone> ».")}</p>`); }
    const c = data.counts;
    const kpis = `<div class="kpis"><div class="card kpi"><span class="k">${t("Comptes")}</span><span class="v">${c.accounts}</span><span class="s">${Object.entries(c.by_type).map(([k, n]) => `${t(TYPE[k] || k)} ${n}`).join(" · ")}</span></div>
      <div class="card kpi"><span class="k">${t("Chantiers en cours")}</span><span class="v">${c.sites}</span></div>
      <div class="card kpi"><span class="k">${t("Abonnés payants")}</span><span class="v">${c.paying}</span></div>
      <div class="card kpi"><span class="k">${t("Publications sur 7 jours")}</span><span class="v">${c.updates_7d}</span></div></div>`;
    let body = "";
    if (tab === "comptes") {
      const opts = Object.entries(data.plans).map(([k, p]) => `<option value="${k}" data-aud="${p.audience}">${esc(p.name)}</option>`).join("");
      body = `<form class="adm-search" id="search"><input type="search" name="q" value="${esc(q)}" placeholder="${t("Nom, e-mail ou téléphone")}" aria-label="${t("Rechercher un compte")}"><button class="btn" type="submit">${t("Rechercher")}</button></form>
        <div class="tbl-wrap"><table><thead><tr><th>${t("Compte")}</th><th>${t("Type")}</th><th>${t("Pays")}</th><th>${t("Chantiers")}</th><th>${t("Offre")}</th><th>${t("Créé")}</th><th>${t("Activer une offre")}</th></tr></thead><tbody>
        ${data.accounts.map((a) => `<tr><td><b>${esc(a.company !== a.contact_name ? a.company + " · " + a.contact_name : a.contact_name)}</b><br><span class="muted sm">${esc([a.email, a.phone].filter(Boolean).join(" · "))}${a.phone && !a.phone_verified_at ? " " + t("(non confirmé)") : ""}${a.is_admin ? " · admin" : ""}</span></td>
          <td>${t(TYPE[a.account_type] || a.account_type)}</td><td>${esc(a.country || "—")}</td><td class="num">${a.sites}</td><td>${planOf(a)}${a.sub_status ? `<br><span class="muted sm">${esc(a.sub_status)}${a.sub_currency ? " · " + esc(a.sub_currency.toUpperCase()) : ""}</span>` : ""}</td><td>${dShort(a.created_at)}</td>
          <td>${a.account_type === "pro" || a.account_type === "client" ? `<form class="adm-grant" data-grant="${a.id}"><select name="plan" aria-label="${t("Offre")}">${opts.replace(new RegExp(`data-aud="${a.account_type === "pro" ? "client" : "pro"}"`, "g"), "hidden disabled")}</select><input name="months" type="number" min="0" max="36" value="1" aria-label="${t("Mois")}"><button class="btn ghost" type="submit">${t("Activer")}</button></form>` : `<span class="muted sm">${t("ne paie pas")}</span>`}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">${t("Aucun compte.")}</td></tr>`}
        </tbody></table></div><p class="muted sm">${t("0 mois arrête l'offre. Utile quand un client paie par Wave, Orange Money ou virement.")}</p>`;
    } else if (tab === "visites") {
      body = data.visits.length ? `<div class="tbl-wrap"><table><thead><tr><th>${t("Demandée")}</th><th>${t("Chantier")}</th><th>${t("Client")}</th><th>${t("Souhaitée")}</th><th>${t("Précisions")}</th><th>${t("Statut")}</th></tr></thead><tbody>
        ${data.visits.map((v) => `<tr><td>${rel(v.created_at)}</td><td><b>${esc(v.site)}</b><br><span class="muted sm">${esc(v.location || "")} · ${esc(v.tracking_code)}</span></td><td>${esc(v.contact_name || "")}<br><span class="muted sm">${esc([v.phone || v.account_phone, v.email].filter(Boolean).join(" · "))}</span></td><td>${v.wished_date ? dShort(v.wished_date) : "—"}</td><td>${esc(v.note)}</td>
          <td><select data-visit="${v.id}" aria-label="${t("Statut")}">${[["demandee", "Demandée"], ["planifiee", "Planifiée"], ["faite", "Faite"], ["annulee", "Annulée"]].map(([k, l]) => `<option value="${k}" ${v.status === k ? "selected" : ""}>${t(l)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">${t("Aucune demande de visite.")}</p>`;
    } else if (tab === "paiements") {
      body = data.payments.length ? `<ul class="activity">${data.payments.map((p) => `<li><span><b>${esc(p.contact_name || "—")}</b> · ${esc(p.summary || p.type)}</span><small>${rel(p.created_at)} · ${esc(p.type)}</small></li>`).join("")}</ul>` : `<p class="muted">${t("Aucun paiement pour l'instant.")}</p>`;
    } else {
      const im = await api("/api/admin/images");
      const slot = (x, gallery) => `<form class="card card-p adm-img" data-img="${esc(x.slot)}">
          <div class="adm-thumb">${x.replaced || !gallery ? `<img src="${x.url}" alt="" loading="lazy">` : `<span class="muted">${t("Vide")}</span>`}</div>
          <b>${esc(x.slot)}</b>${x.replaced ? `<span class="chip ok">${t("Remplacée le {date}", { date: dShort(x.updated_at) })}</span>` : gallery ? "" : `<span class="chip idle">${t("Image d'origine")}</span>`}
          ${gallery ? `<input name="caption" maxlength="160" value="${esc(x.caption)}" placeholder="${t("Légende : Villa à Calavi, élévation des murs")}" aria-label="${t("Légende")}">` : ""}
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" aria-label="${t("Choisir une image")}">
          <div class="row-acts"><button class="btn" type="submit">${t("Enregistrer")}</button>${x.replaced ? `<button type="button" class="btn ghost" data-img-del="${esc(x.slot)}">${gallery ? t("Retirer") : t("Revenir à l'originale")}</button>` : ""}</div>
        </form>`;
      body = `<h2 class="section-t">${t("Photos de vrais chantiers")}</h2>
        <p class="muted">${t("Elles apparaissent sur la page d'accueil, dans la section « Sur de vrais chantiers », dès qu'il y en a une. Utilisez seulement des photos dont vous avez les droits (les vôtres, ou celles d'un client ou d'une entreprise d'accord par écrit).")}</p>
        <div class="adm-grid">${im.gallery.map((x) => slot(x, true)).join("")}</div>
        <h2 class="section-t">${t("Captures de l'application")}</h2>
        <p class="muted">${t("Images de la page d'accueil et de la page de connexion, en français et en anglais, en clair et en sombre. Une image remplacée est servie à la place de l'originale.")}</p>
        <div class="adm-grid">${im.screens.map((x) => slot(x, false)).join("")}</div>`;
    }
    shell(kpis + body);
    bind();
  }

  function bind() {
    $("#search")?.addEventListener("submit", (e) => { e.preventDefault(); q = new FormData(e.target).get("q"); render(); });
    document.querySelectorAll("[data-grant]").forEach((f) => f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(f));
      try { const r = await api(`/api/admin/accounts/${f.dataset.grant}/grant`, { method: "POST", body: { plan: b.plan, months: Number(b.months) } }); toast(Number(b.months) ? t("Offre active jusqu'au {date}.", { date: dShort(r.until) }) : t("Offre arrêtée.")); render(); } catch (x) { toast(x.message); }
    }));
    document.querySelectorAll("[data-visit]").forEach((sel) => sel.addEventListener("change", async () => {
      try { await api(`/api/admin/visits/${sel.dataset.visit}`, { method: "PATCH", body: { status: sel.value } }); toast(t("Statut enregistré.")); } catch (x) { toast(x.message); }
    }));
    document.querySelectorAll("[data-img]").forEach((f) => f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      if (!fd.get("image")?.size) fd.delete("image");
      try { await upload(`/api/admin/images/${encodeURIComponent(f.dataset.img)}`, fd); toast(t("Image enregistrée.")); render(); } catch (x) { toast(x.message); }
    }));
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; history.replaceState(null, "", "#" + tab); render(); }
    else if (b.dataset.imgDel) { try { await api(`/api/admin/images/${encodeURIComponent(b.dataset.imgDel)}`, { method: "DELETE" }); toast(t("Image retirée.")); render(); } catch (x) { toast(x.message); } }
  });
  render();
})();
