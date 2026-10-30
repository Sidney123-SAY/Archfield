// Outils partagés par les pages Archfield : appels API, formats, icônes, photos.
(function () {
  "use strict";

  const LOGO = (s, dark) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 27V15a9 9 0 0 1 18 0v12" fill="none" stroke="#C2410C" stroke-width="4"/><rect x="11" y="21" width="2.6" height="6" fill="${dark ? "#fff" : "#14263D"}"/><rect x="14.7" y="18" width="2.6" height="9" fill="${dark ? "#fff" : "#14263D"}"/><rect x="18.4" y="15" width="2.6" height="12" fill="${dark ? "#fff" : "#14263D"}"/><rect x="3" y="27" width="26" height="2.4" rx="1" fill="${dark ? "#fff" : "#14263D"}"/></svg>`;
  const I = {
    dash: '<path d="M3 15h12M5 12V8M9 12V4M13 12V9" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    home: '<path d="M3 8.5 9 3.5l6 5V15H11v-4H7v4H3z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
    list: '<path d="M3 5h12M3 9h12M3 13h8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    users: '<circle cx="7" cy="6.5" r="2.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2.5 15c.5-2.6 2.2-4 4.5-4s4 1.4 4.5 4M12 4.3a2.4 2.4 0 0 1 0 4.5M13.5 11c1.2.5 2 1.8 2.3 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
    card: '<rect x="2.5" y="4" width="13" height="10" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2.5 7.5h13" stroke="currentColor" stroke-width="1.5"/>',
    photo: '<rect x="2.5" y="3.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="m3.5 13 3.5-4 3 3 2-2 3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/>',
    user: '<circle cx="9" cy="6" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M3.5 16c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
    cam: '<path d="M2.5 6h3l1.4-2h4.2L12.5 6h3v9h-13z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="9" cy="10.2" r="2.6" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    warn: '<path d="M9 2.5 16 15H2z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><path d="M9 7v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="12.7" r=".9" fill="currentColor"/>',
    eye: '<path d="M1.5 9S4.2 4 9 4s7.5 5 7.5 5-2.7 5-7.5 5S1.5 9 1.5 9z" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="9" cy="9" r="2.2" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    check: '<circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="m5.8 9.2 2.2 2.2 4.2-4.6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    cal: '<rect x="2.5" y="3.5" width="13" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2.5 7.5h13M6 2v3M12 2v3" stroke="currentColor" stroke-width="1.5"/>',
    lock: '<rect x="3.5" y="8" width="11" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M6 8V5.8a3 3 0 0 1 6 0V8" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    plus: '<path d="M9 3.5v11M3.5 9h11" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    x: '<path d="m4.5 4.5 9 9M13.5 4.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    left: '<path d="M11 4 6 9l5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const ic = (n, s = 18, color = "currentColor") => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" aria-hidden="true" style="color:${color}">${I[n]}</svg>`;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (d, o) => new Intl.DateTimeFormat("fr-FR", o).format(new Date(d));
  const time = (d) => fmt(d, { hour: "2-digit", minute: "2-digit" });
  const dShort = (d) => fmt(d, { day: "2-digit", month: "2-digit", year: "numeric" });
  const dLong = (d) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
  const nf = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);
  const money = (n, cur) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur || "EUR", maximumFractionDigits: 0 }).format(n);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function rel(d) {
    const x = new Date(d), today = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
    if (x.toDateString() === today.toDateString()) return "Aujourd'hui, " + time(d);
    if (x.toDateString() === y.toDateString()) return "Hier, " + time(d);
    return fmt(d, { day: "numeric", month: "short", year: x.getFullYear() === today.getFullYear() ? undefined : "numeric" }) + ", " + time(d);
  }

  async function api(path, opts = {}) {
    const init = { method: opts.method || "GET", headers: {}, credentials: "same-origin" };
    if (opts.form) init.body = opts.form;
    else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers["Content-Type"] = "application/json"; }
    let res;
    try { res = await fetch(path, init); } catch (e) { throw new Error("Pas de connexion. Vérifiez votre réseau puis réessayez."); }
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
    if (res.status === 401 && opts.authRedirect !== false) { location.href = "/connexion"; throw new Error("Session expirée."); }
    if (!res.ok) throw new Error(data?.error || "Erreur " + res.status);
    return data;
  }

  // Envoi avec progression (XMLHttpRequest), utile pour les photos sur une connexion lente.
  function upload(path, form, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", path);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      x.onload = () => {
        let data = null; try { data = JSON.parse(x.responseText); } catch (e) {}
        if (x.status === 401) { location.href = "/connexion"; return reject(new Error("Session expirée.")); }
        x.status < 300 ? resolve(data) : reject(new Error(data?.error || "Erreur " + x.status));
      };
      x.onerror = () => reject(new Error("L'envoi a échoué. Vérifiez votre réseau puis réessayez."));
      x.send(form);
    });
  }

  // Réduit une photo à 1600 px de large en JPEG avant l'envoi : quelques centaines de Ko au lieu de plusieurs Mo.
  async function shrink(file, max = 1600, quality = 0.8) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", quality));
      return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch (e) { return file; }
  }

  let toastT = null;
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4000);
  }
  async function copy(text, ok) {
    try { await navigator.clipboard.writeText(text); toast(ok); }
    catch (e) { window.prompt ? window.prompt("Copiez ce texte :", text) : toast(text); }
  }

  const STATUS_CHIP = {
    validee: '<span class="chip ok">Validée</span>', a_valider: '<span class="chip wait">À valider</span>',
    en_cours: '<span class="chip idle">En cours</span>', a_venir: '<span class="chip idle">À venir</span>'
  };
  const healthChip = (s) => (s.drift ? '<span class="chip warn">Dérive</span>' : '<span class="chip ok">Dans les temps</span>');

  // Carte de chantier (en-tête du journal, côté artisan et côté client).
  function siteCard(s, sub) {
    const r = s.running;
    return `<section class="card sitecard">
      <div class="t"><h1>${esc(s.name)}</h1><span class="pct">${s.progress} %</span></div>
      <p class="where">${esc([s.location, sub].filter(Boolean).join(" · "))}</p>
      <span class="track"><span style="width:${s.progress}%"></span></span>
      <p class="stage">${s.status === "delivered" ? "Chantier livré" : r ? `Étape ${s.runningIndex + 1} sur ${s.steps.length} : ${esc(r.name.toLowerCase())}` : s.toValidate ? "Étape terminée, en attente de validation" : "Aucune étape en cours"}</p>
      ${r && s.delay >= 1 ? `<div class="warnbox">${ic("warn", 18)} ${esc(r.name)} : ${nf(s.delay)} jour${s.delay >= 2 ? "s" : ""} de retard sur le prévu</div>` : r ? `<div class="okbox">${ic("check", 18)} Dans les temps</div>` : ""}
    </section>`;
  }

  // Entrées du journal. who = « vous » côté client, prénom du client côté artisan.
  function journal(s, updates, { forClient, who, onValidate } = {}) {
    if (!updates.length) return `<div class="card empty"><h3>Pas encore de mise à jour</h3><p>${forClient ? "Les photos et messages de votre artisan apparaîtront ici." : "Publiez la première mise à jour : quelques photos et une phrase suffisent."}</p></div>`;
    const stepById = Object.fromEntries(s.steps.map((x) => [x.id, x]));
    return updates.map((u) => {
      const st = stepById[u.step_id];
      if (u.kind === "step_done") {
        const waiting = st && st.status === "a_valider";
        return `<div class="card sys">${ic("check", 22, waiting ? "var(--orange)" : "var(--vert)")}<span>${esc(u.step_name || "Étape")} terminé · ${waiting ? "en attente de validation par " + esc(who) : "le " + dShort(u.created_at)}</span>${forClient && waiting ? `<button type="button" class="btn ok" data-validate="${st.id}">Valider</button>` : ""}</div>`;
      }
      if (u.kind === "step_validated") return `<div class="card sys">${ic("check", 22, "var(--vert)")}<span>${esc(u.step_name || "Étape")} validé par ${esc(who)} · ${rel(u.created_at)}</span></div>`;
      return `<article class="card entry">
        <div class="eh"><span>${rel(u.created_at)}</span><span>${esc(u.step_name || "")}</span></div>
        <p>${esc(u.text)}</p>
        ${u.photos.length ? `<div class="photos">${u.photos.map((p) => `<a class="photo" href="${p.url}" target="_blank" rel="noopener"><img loading="lazy" alt="Photo du chantier${u.step_name ? ", " + esc(u.step_name) : ""}" src="${p.url}"><span class="stamp">${dShort(p.taken_at)} ${time(p.taken_at)}</span></a>`).join("")}</div>` : ""}
        ${forClient ? "" : `<div class="eh">${u.seen_at ? `<span class="vu">${ic("eye", 17)} Vu par ${esc(who)} à ${time(u.seen_at)}${new Date(u.seen_at).toDateString() !== new Date().toDateString() ? " le " + dShort(u.seen_at) : ""}</span>` : `<span class="vu no">${ic("eye", 17)} Pas encore vu par ${esc(who)}</span>`}<button type="button" class="del" data-del-update="${u.id}">Supprimer</button></div>`}
      </article>`;
    }).join("");
  }

  function docsTable(docs, currency, { editable } = {}) {
    if (!docs.length) return `<p class="muted">Aucun devis ni facture pour l'instant.</p>`;
    const sum = (f) => docs.filter(f).reduce((a, d) => a + d.amount, 0);
    const devis = sum((d) => d.kind === "devis" && d.status === "signe"), paye = sum((d) => d.status === "payee"), du = sum((d) => d.status === "a_regler");
    const chip = { signe: '<span class="chip idle">Signé</span>', en_attente: '<span class="chip wait">À signer</span>', payee: '<span class="chip ok">Payée</span>', a_regler: '<span class="chip warn">À régler</span>' };
    return `<div class="tbl-wrap"><table>
      <thead><tr><th>Date</th><th>Document</th><th>Objet</th><th class="r">Montant</th><th>Statut</th>${editable ? "<th></th>" : ""}</tr></thead>
      <tbody>${docs.map((d) => `<tr><td class="num">${dShort(d.doc_date)}</td><td>${d.kind === "devis" ? "Devis" : "Facture"} · ${esc(d.ref)}</td><td>${esc(d.label)}</td><td class="r">${money(d.amount, currency)}</td><td>${chip[d.status]}</td>${editable ? `<td>${d.status === "a_regler" ? `<button type="button" class="btn ghost" data-doc-paid="${d.id}">Marquer payée</button>` : d.status === "en_attente" ? `<button type="button" class="btn ghost" data-doc-signed="${d.id}">Marquer signé</button>` : ""} <button type="button" class="btn ghost" data-doc-del="${d.id}" aria-label="Supprimer">${ic("x", 14)}</button></td>` : ""}</tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">Total des devis signés</td><td class="r">${money(devis, currency)}</td><td colspan="${editable ? 2 : 1}"></td></tr>
      <tr><td colspan="3" class="muted">Payé · reste à régler</td><td class="r">${money(paye, currency)} · ${money(du, currency)}</td><td colspan="${editable ? 2 : 1}"></td></tr></tfoot>
    </table></div>`;
  }

  window.AF = { LOGO, ic, esc, fmt, time, dShort, dLong, nf, money, cap, rel, api, upload, shrink, toast, copy, STATUS_CHIP, healthChip, siteCard, journal, docsTable };
})();
