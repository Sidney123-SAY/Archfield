// Outils partagés par les pages Archfield : langue, thème, cookies, appels API, formats, icônes, photos.
(function () {
  "use strict";

  /* ---------- Langue ---------- */
  // Le texte français sert de clé ; window.AF_EN (i18n-en.js) donne la traduction anglaise.
  const LANGS = { fr: "Français", en: "English" };
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  const lang = (() => { const s = store.get("af-lang"); if (LANGS[s]) return s; return /^fr\b/i.test(navigator.language || "fr") ? "fr" : "en"; })();
  const EN = window.AF_EN || {};
  const LOCALE = lang === "en" ? "en-GB" : "fr-FR";
  document.documentElement.lang = lang;
  function t(s, vars) {
    let out = lang === "en" && EN[s] !== undefined ? EN[s] : s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return out;
  }
  // Messages venus du serveur (en français) : traduction exacte, ou par modèle « … {champ} … ».
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const TEMPLATES = Object.keys(EN).filter((k) => /\{\w+\}/.test(k)).map((k) => ({ k, re: new RegExp("^" + escRe(k).replace(/\\\{(\w+)\\\}/g, "(?<$1>.+?)") + "$") }));
  function tr(msg) {
    if (lang !== "en" || !msg) return msg;
    if (EN[msg] !== undefined) return EN[msg];
    for (const x of TEMPLATES) {
      const m = msg.match(x.re);
      if (m) return t(x.k, Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, EN[v] !== undefined ? EN[v] : v])));
    }
    return msg;
  }
  // Pages HTML fixes : data-i18n traduit le contenu, data-i18n-ph le placeholder, data-i18n-label l'aria-label.
  function translatePage(root = document) {
    if (lang === "fr") return;
    root.querySelectorAll("[data-i18n]").forEach((el) => { const k = el.dataset.i18n || el.innerHTML.trim().replace(/\s+/g, " "); if (EN[k] !== undefined) el.innerHTML = EN[k]; });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.getAttribute("placeholder")); });
    root.querySelectorAll("[data-i18n-label]").forEach((el) => { el.setAttribute("aria-label", t(el.getAttribute("aria-label"))); });
    root.querySelectorAll("[data-i18n-alt]").forEach((el) => { el.alt = t(el.getAttribute("alt")); });
    if (document.title) document.title = document.title.split(" · ").map((p) => t(p)).join(" · ");
  }
  function setLang(l) { store.set("af-lang", l); location.reload(); }
  const langSelect = (id = "lang") => `<label class="lang-pick"><span class="sr-only">${t("Langue")}</span><select id="${id}" data-lang-select aria-label="${t("Langue")}">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === lang ? "selected" : ""}>${v}</option>`).join("")}</select></label>`;
  document.addEventListener("change", (e) => { if (e.target.matches("[data-lang-select]")) setLang(e.target.value); });

  /* ---------- Icônes ---------- */
  // Arche orange, barres et socle dans la couleur du texte qui l'entoure (encre en clair, blanc en sombre).
  const LOGO = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 27V15a9 9 0 0 1 18 0v12" fill="none" stroke="#C2410C" stroke-width="4"/><g fill="currentColor"><rect x="11" y="21" width="2.6" height="6"/><rect x="14.7" y="18" width="2.6" height="9"/><rect x="18.4" y="15" width="2.6" height="12"/><rect x="3" y="27" width="26" height="2.4" rx="1"/></g></svg>`;
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
    left: '<path d="M11 4 6 9l5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tool: '<path d="M10.5 3.5 14.5 7.5M12.5 5.5 4 14l-1.5-1.5L11 4M9 2.5h4.5V7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    globe: '<circle cx="9" cy="9" r="6.8" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2.4 9h13.2M9 2.2c2 2.1 2.9 4.3 2.9 6.8S11 13.7 9 15.8C7 13.7 6.1 11.5 6.1 9S7 4.3 9 2.2z" stroke="currentColor" stroke-width="1.4" fill="none"/>',
    phone: '<rect x="5" y="1.8" width="8" height="14.4" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 13.6h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    key: '<circle cx="6" cy="9" r="3.2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9.2 9H16M13.5 9v2.5M15.8 9v1.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    sun: '<circle cx="9" cy="9" r="3.2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M9 1.8v1.8M9 14.4v1.8M1.8 9h1.8M14.4 9h1.8M3.9 3.9l1.3 1.3M12.8 12.8l1.3 1.3M3.9 14.1l1.3-1.3M12.8 5.2l1.3-1.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    moon: '<path d="M14.8 11.2A6.5 6.5 0 0 1 6.8 3.2a6.5 6.5 0 1 0 8 8z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
    screen: '<rect x="2" y="3" width="14" height="9.5" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M6.5 15.5h5M9 12.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    google: '<path d="M16.5 9.2c0-.6-.1-1.2-.2-1.7H9v3.3h4.2a3.6 3.6 0 0 1-1.6 2.4v2h2.6c1.5-1.4 2.3-3.4 2.3-6z" fill="#4285F4"/><path d="M9 17c2.2 0 4-.7 5.3-1.9l-2.6-2c-.7.5-1.6.8-2.7.8-2.1 0-3.8-1.4-4.5-3.3H1.8v2.1A8 8 0 0 0 9 17z" fill="#34A853"/><path d="M4.5 10.6a4.8 4.8 0 0 1 0-3.2V5.3H1.8a8 8 0 0 0 0 7.4l2.7-2.1z" fill="#FBBC05"/><path d="M9 4.2c1.2 0 2.3.4 3.1 1.2l2.3-2.3A8 8 0 0 0 1.8 5.3l2.7 2.1C5.2 5.6 6.9 4.2 9 4.2z" fill="#EA4335"/>'
  };
  const ic = (n, s = 18, color = "currentColor") => `<svg width="${s}" height="${s}" viewBox="0 0 18 18" aria-hidden="true" style="color:${color}">${I[n]}</svg>`;

  /* ---------- Thème : clair (soleil), sombre (lune), ou celui du système ---------- */
  function getTheme() { return store.get("af-theme") || "system"; }
  function setTheme(v) {
    store.set("af-theme", v === "system" ? null : v);
    v === "system" ? document.documentElement.removeAttribute("data-theme") : document.documentElement.setAttribute("data-theme", v);
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === v)));
  }
  const themeToggle = () => `<div class="theme-toggle" role="group" aria-label="${t("Apparence")}">${[["light", "sun", "Thème clair"], ["dark", "moon", "Thème sombre"], ["system", "screen", "Comme le système"]].map(([k, i, l]) => `<button type="button" data-theme-set="${k}" aria-pressed="${getTheme() === k}" title="${t(l)}" aria-label="${t(l)}">${ic(i, 16)}</button>`).join("")}</div>`;
  const prefs = () => `<div class="prefs">${langSelect()}${themeToggle()}</div>`;
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-theme-set]"); if (b) setTheme(b.dataset.themeSet); });

  /* ---------- Cookies ---------- */
  // Aujourd'hui : un cookie de connexion (indispensable) et des préférences locales. La mesure d'audience
  // n'est chargée que si consent().analytics vaut true : rien n'est déposé avant l'accord.
  // Le choix est gardé 6 mois (durée recommandée par la CNIL), puis le bandeau revient.
  const CONSENT_DAYS = 182;
  function consent() {
    try {
      const c = JSON.parse(store.get("af-consent"));
      return c && c.date && Date.now() - Date.parse(c.date) < CONSENT_DAYS * 864e5 ? c : null;
    } catch (e) { return null; }
  }
  function saveConsent(analytics) {
    store.set("af-consent", JSON.stringify({ necessary: true, analytics: !!analytics, date: new Date().toISOString(), version: 1 }));
    document.getElementById("cookie-banner")?.remove();
    document.dispatchEvent(new CustomEvent("af:consent", { detail: consent() }));
  }
  function cookieBanner(detailed) {
    document.getElementById("cookie-banner")?.remove();
    const c = consent();
    const el = document.createElement("section");
    el.id = "cookie-banner"; el.className = "cookie-banner"; el.setAttribute("role", "dialog"); el.setAttribute("aria-labelledby", "cookie-title");
    el.innerHTML = `<div class="cb-in">
      <div class="cb-body">
        <span class="cb-mark" aria-hidden="true">${LOGO(40)}</span>
        <h2 id="cookie-title">${t("Les cookies")}</h2>
        <p>${t("Archfield utilise un cookie indispensable pour vous garder connecté, et garde vos préférences (langue, thème) sur cet appareil. Avec votre accord, nous mesurerons aussi l'audience du site pour l'améliorer.")}</p>
        <p>${t("Refuser ne change rien à votre accès à Archfield, et vous pouvez changer d'avis quand vous voulez avec le lien « Gérer les cookies » en bas de page.")}</p>
        ${detailed ? `<div class="cb-detail">
          <label class="cb-row"><span><b>${t("Indispensables")}</b><br><span class="muted">${t("Connexion à votre compte, sécurité, préférences de langue et de thème.")}</span></span><input type="checkbox" checked disabled aria-label="${t("Indispensables, toujours actifs")}"></label>
          <label class="cb-row"><span><b>${t("Mesure d'audience")}</b><br><span class="muted">${t("Statistiques anonymes de visite pour améliorer le site.")}</span></span><input type="checkbox" id="cb-analytics" ${c && c.analytics ? "checked" : ""}></label>
        </div>` : ""}
        <p class="cb-links"><a href="/confidentialite">${t("Lire la politique de confidentialité")}</a><a href="/confidentialite#cookies">${t("Déclaration de cookies")}</a></p>
      </div>
      <div class="cb-acts">
        <button type="button" data-cookies-refuse>${t("Tout refuser")}</button>
        ${detailed ? `<button type="button" data-cookies-save>${t("Enregistrer")}</button>` : `<button type="button" data-cookies-custom>${t("Paramètres")}</button>`}
        <button type="button" class="cb-accept" data-cookies-accept>${t("Tout accepter")}</button>
      </div></div>`;
    document.body.appendChild(el);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cookies-accept],[data-cookies-refuse],[data-cookies-custom],[data-cookies-save],[data-cookies]");
    if (!b) return;
    if (b.matches("[data-cookies]")) { e.preventDefault(); cookieBanner(true); }
    else if (b.matches("[data-cookies-accept]")) saveConsent(true);
    else if (b.matches("[data-cookies-refuse]")) saveConsent(false);
    else if (b.matches("[data-cookies-custom]")) cookieBanner(true);
    else saveConsent(document.getElementById("cb-analytics")?.checked);
  });
  const footerLinks = () => `<nav class="foot-links" aria-label="${t("Informations")}"><a href="/a-propos">${t("À propos")}</a><a href="/confidentialite">${t("Confidentialité")}</a><a href="/mentions-legales">${t("Mentions légales")}</a><a href="#" data-cookies>${t("Gérer les cookies")}</a></nav>`;
  document.addEventListener("DOMContentLoaded", () => {
    translatePage();
    document.querySelectorAll("[data-prefs]").forEach((el) => { el.innerHTML = prefs(); });
    document.querySelectorAll("[data-footer-links]").forEach((el) => { el.innerHTML = footerLinks(); });
    if (!consent()) cookieBanner(false);
  });

  /* ---------- Application installée (écran d'accueil du téléphone) ---------- */
  // Le service worker ne marche qu'en HTTPS (ou sur localhost) : sur http://192.168…, le site reste un site.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
  window.addEventListener("appinstalled", () => { installPrompt = null; document.querySelectorAll(".install, .install-nudge").forEach((el) => el.remove()); });
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installSteps = () => isIOS()
    ? `<ol class="install-steps"><li>${t("Ouvrez Archfield dans Safari.")}</li><li>${t("Touchez le bouton Partager (le carré avec une flèche).")}</li><li>${t("Choisissez « Sur l'écran d'accueil », puis « Ajouter ».")}</li></ol>`
    : `<ol class="install-steps"><li>${t("Ouvrez le menu du navigateur (les trois points en haut à droite).")}</li><li>${t("Choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».")}</li></ol>`;
  // Carte de la page Compte. Rien quand l'application est déjà installée.
  const installCard = () => standalone() ? "" : `<section class="card card-p planbox install"><h2>${t("Application mobile")}</h2>
    <p class="muted" style="font-size:.86rem">${t("Installez Archfield sur votre téléphone : une icône sur l'écran d'accueil, en plein écran, sans passer par un store.")}</p>
    <div><button type="button" class="btn primary" data-install>${ic("phone", 15)} ${t("Installer l'application")}</button></div><div data-install-steps hidden>${installSteps()}</div></section>`;
  // Petit rappel en haut de l'application, sur téléphone, tant qu'il n'est pas fermé.
  const installNudge = () => standalone() || store.get("af-install-nudge") || location.hash === "#compte" || !window.matchMedia("(max-width: 760px)").matches ? ""
    : `<div class="install-nudge"><img src="/icons/icon-192.png" alt="" width="40" height="40"><span>${t("Ajoutez Archfield à votre écran d'accueil pour l'ouvrir comme une application.")}</span><button type="button" class="btn ghost" data-install>${t("Installer")}</button><button type="button" class="icon-btn" data-install-close aria-label="${t("Fermer")}">${ic("x", 14)}</button></div>`;
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-install-close]")) { store.set("af-install-nudge", "1"); e.target.closest(".install-nudge").remove(); return; }
    const b = e.target.closest("[data-install]");
    if (!b) return;
    if (installPrompt) { installPrompt.prompt(); const r = await installPrompt.userChoice; if (r.outcome === "accepted") installPrompt = null; return; }
    // Pas d'installation directe (iPhone, Firefox…) : on montre la marche à suivre.
    const box = b.closest(".install")?.querySelector("[data-install-steps]");
    if (box) box.hidden = !box.hidden;
    else { location.hash = "compte"; setTimeout(() => document.querySelector("[data-install-steps]")?.removeAttribute("hidden"), 400); }
  });

  /* ---------- Formats ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (d, o) => new Intl.DateTimeFormat(LOCALE, o).format(new Date(d));
  const time = (d) => fmt(d, { hour: "2-digit", minute: "2-digit" });
  const dShort = (d) => fmt(d, { day: "2-digit", month: "2-digit", year: "numeric" });
  const dLong = (d) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
  const nf = (n) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(n);
  const money = (n, cur) => new Intl.NumberFormat(LOCALE, { style: "currency", currency: cur || "EUR", maximumFractionDigits: 0 }).format(n);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = (n, one, many) => t(n > 1 ? many : one, { n: nf(n) });
  function rel(d) {
    const x = new Date(d), today = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
    if (x.toDateString() === today.toDateString()) return t("Aujourd'hui, {h}", { h: time(d) });
    if (x.toDateString() === y.toDateString()) return t("Hier, {h}", { h: time(d) });
    return fmt(d, { day: "numeric", month: "short", year: x.getFullYear() === today.getFullYear() ? undefined : "numeric" }) + ", " + time(d);
  }

  /* ---------- Réseau ---------- */
  async function api(path, opts = {}) {
    const init = { method: opts.method || "GET", headers: {}, credentials: "same-origin" };
    if (opts.form) init.body = opts.form;
    else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers["Content-Type"] = "application/json"; }
    let res;
    try { res = await fetch(path, init); } catch (e) { throw new Error(t("Pas de connexion. Vérifiez votre réseau puis réessayez.")); }
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
    if (res.status === 401 && opts.authRedirect !== false) { location.href = "/connexion"; throw new Error(t("Session expirée.")); }
    if (!res.ok) throw new Error(tr(data?.error) || t("Erreur {n}", { n: res.status }));
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
        if (x.status === 401) { location.href = "/connexion"; return reject(new Error(t("Session expirée."))); }
        x.status < 300 ? resolve(data) : reject(new Error(tr(data?.error) || t("Erreur {n}", { n: x.status })));
      };
      x.onerror = () => { const e = new Error(t("L'envoi a échoué. Vérifiez votre réseau puis réessayez.")); e.offline = true; reject(e); };
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

  // Date de prise de vue et position GPS inscrites par le téléphone dans une photo JPEG (EXIF).
  // Lues avant la réduction de la photo, qui les efface. Renvoie { shot_at, lat, lng } (null si absent).
  async function exifOf(file) {
    const out = { shot_at: null, lat: null, lng: null };
    if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return out;
    try {
      const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
      if (v.getUint16(0) !== 0xffd8) return out;
      let o = 2;
      while (o + 4 < v.byteLength) {
        const marker = v.getUint16(o), size = v.getUint16(o + 2);
        if (marker === 0xffe1 && v.getUint32(o + 4) === 0x45786966) { readTiff(v, o + 10, out); break; }
        if ((marker & 0xff00) !== 0xff00) break;
        o += 2 + size;
      }
    } catch (e) {}
    return out;
  }
  function readTiff(v, t, out) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = (x) => v.getUint16(x, le), u32 = (x) => v.getUint32(x, le);
    const str = (off, n) => { let r = ""; for (let i = 0; i < n - 1; i++) r += String.fromCharCode(v.getUint8(off + i)); return r; };
    const rat = (off) => u32(off) / (u32(off + 4) || 1);
    const ifd = (start) => { const tags = {}; const n = u16(start); for (let i = 0; i < n; i++) { const e = start + 2 + i * 12; tags[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 }; } return tags; };
    const ptr = (tag) => t + u32(tag.at);
    const ifd0 = ifd(t + u32(t + 4));
    if (ifd0[0x8769]) {
      const ex = ifd(ptr(ifd0[0x8769]));
      const d = ex[0x9003] || ex[0x9004];
      const m = d && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(str(ptr(d), d.count));
      if (m) out.shot_at = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString();
    }
    if (ifd0[0x8825]) {
      const g = ifd(ptr(ifd0[0x8825]));
      const deg = (tag) => { const a = ptr(tag); return rat(a) + rat(a + 8) / 60 + rat(a + 16) / 3600; };
      if (g[2] && g[4]) {
        const lat = deg(g[2]) * (String.fromCharCode(v.getUint8(g[1].at)) === "S" ? -1 : 1);
        const lng = deg(g[4]) * (String.fromCharCode(v.getUint8(g[3].at)) === "W" ? -1 : 1);
        if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) { out.lat = lat; out.lng = lng; }
      }
    }
  }
  // Position du téléphone au moment de publier (HTTPS obligatoire). null si refusée ou indisponible.
  function position(timeout = 10000) {
    return new Promise((resolve) => {
      if (!navigator.geolocation || !window.isSecureContext) return resolve(null);
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout, maximumAge: 60000 });
    });
  }

  let toastT = null;
  function toast(msg) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 4000);
  }
  // Copie dans le presse-papiers. Sans HTTPS (site ouvert par http://192.168… sur un téléphone), l'API moderne
  // n'existe pas : on passe par l'ancienne méthode, puis on affiche le texte à copier à la main en dernier recours.
  async function copy(text, ok) {
    try { await navigator.clipboard.writeText(text); return toast(ok); } catch (e) {}
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let done = false;
    try { done = document.execCommand("copy"); } catch (e) {}
    ta.remove();
    toast(done ? ok : t("Copiez ce texte : {text}", { text }));
  }

  /* ---------- Morceaux d'interface communs à l'artisan et au client ---------- */
  const STATUS_CHIP = {
    validee: `<span class="chip ok">${t("Validée")}</span>`, a_valider: `<span class="chip wait">${t("À valider")}</span>`,
    en_cours: `<span class="chip idle">${t("En cours")}</span>`, a_venir: `<span class="chip idle">${t("À venir")}</span>`
  };
  const healthChip = (s) => (s.drift ? `<span class="chip warn">${t("Dérive")}</span>` : `<span class="chip ok">${t("Dans les temps")}</span>`);

  // Carte de chantier (en-tête du journal, côté artisan et côté client).
  function siteCard(s, sub) {
    const r = s.running;
    return `<section class="card sitecard">
      <div class="t"><h1>${esc(s.name)}</h1><span class="pct">${s.progress} %</span></div>
      <p class="where">${esc([s.location, sub].filter(Boolean).join(" · "))}</p>
      <span class="track"><span style="width:${s.progress}%"></span></span>
      <p class="stage">${s.status === "delivered" ? t("Chantier livré") : r ? t("Étape {i} sur {n} : {name}", { i: s.runningIndex + 1, n: s.steps.length, name: esc(r.name.toLowerCase()) }) : s.toValidate ? t("Étape terminée, en attente de validation") : t("Aucune étape en cours")}</p>
      ${r && s.delay >= 1 ? `<div class="warnbox">${ic("warn", 18)} ${t("{step} : {n} de retard sur le prévu", { step: esc(r.name), n: plural(s.delay, "{n} jour", "{n} jours") })}</div>` : r ? `<div class="okbox">${ic("check", 18)} ${t("Dans les temps")}</div>` : ""}
    </section>`;
  }

  // Entrées du journal. who = « vous » côté client, prénom du client côté artisan.
  function journal(s, updates, { forClient, who } = {}) {
    if (!updates.length) return `<div class="card empty"><h3>${t("Pas encore de mise à jour")}</h3><p>${forClient ? t("Les photos et messages de votre artisan apparaîtront ici.") : t("Publiez la première mise à jour : quelques photos et une phrase suffisent.")}</p></div>`;
    const stepById = Object.fromEntries(s.steps.map((x) => [x.id, x]));
    return updates.map((u) => {
      const st = stepById[u.step_id];
      const step = esc(u.step_name || t("Étape"));
      if (u.kind === "step_done") {
        const waiting = st && st.status === "a_valider";
        return `<div class="card sys">${ic("check", 22, waiting ? "var(--orange)" : "var(--vert)")}<span>${waiting ? (forClient ? t("{step} terminé · en attente de votre validation", { step }) : t("{step} terminé · en attente de validation par {who}", { step, who: esc(who) })) : t("{step} terminé · le {date}", { step, date: dShort(u.created_at) })}</span>${forClient && waiting ? `<button type="button" class="btn ok" data-validate="${st.id}">${t("Valider")}</button>` : ""}</div>`;
      }
      if (u.kind === "step_validated") return `<div class="card sys">${ic("check", 22, "var(--vert)")}<span>${forClient ? t("{step} validé par vous · {date}", { step, date: rel(u.created_at) }) : t("{step} validé par {who} · {date}", { step, who: esc(who), date: rel(u.created_at) })}</span></div>`;
      const proof = verifyBadge(u);
      const seen = u.seen_at ? (new Date(u.seen_at).toDateString() !== new Date().toDateString() ? t("Vu par {who} le {date} à {h}", { who: esc(who), date: dShort(u.seen_at), h: time(u.seen_at) }) : t("Vu par {who} à {h}", { who: esc(who), h: time(u.seen_at) })) : t("Pas encore vu par {who}", { who: esc(who) });
      return `<article class="card entry">
        <div class="eh"><span>${rel(u.created_at)}</span><span>${esc(u.step_name || "")}</span></div>
        <p>${esc(u.text)}</p>
        ${u.photos.length ? `<div class="photos">${u.photos.map((p) => { const d = p.shot_at || p.taken_at; return `<a class="photo" href="${p.url}" target="_blank" rel="noopener"><img loading="lazy" alt="${t("Photo du chantier")}${u.step_name ? ", " + esc(u.step_name) : ""}" src="${p.url}"><span class="stamp">${dShort(d)} ${time(d)}</span></a>`; }).join("")}</div>` : ""}
        ${proof}
        ${forClient ? "" : `<div class="eh"><span class="vu ${u.seen_at ? "" : "no"}">${ic("eye", 17)} ${seen}</span><button type="button" class="del" data-del-update="${u.id}">${t("Supprimer")}</button></div>`}
      </article>`;
    }).join("");
  }

  // Preuve d'une publication : prise sur le chantier, récente ? (voir server/verify.js)
  function verifyBadge(u) {
    if (!u.verify) return "";
    const n = u.verify_note || {};
    const km = (m) => (m >= 1000 ? t("{n} km", { n: nf(Math.round(m / 100) / 10) }) : t("{n} m", { n: m }));
    const why = [];
    if (n.position === "far") why.push(t("publiée à {d} du chantier", { d: km(n.distance) }));
    if (n.photos === "old") why.push(t("photo prise le {date}", { date: dShort(n.old_shot_at) }));
    if (n.photos === "far") why.push(t("photo prise à {d} du chantier", { d: km(n.photo_distance) }));
    if (u.verify === "warning") return `<p class="proof warn">${ic("warn", 16)} ${t("À vérifier : {why}", { why: why.join(", ") })}</p>`;
    if (u.verify === "verified") return `<p class="proof ok">${ic("check", 16)} ${n.position === "origin" ? t("Photos récentes · position du chantier enregistrée ici") : n.photos === "none" ? t("Publié depuis le chantier") : t("Vérifiée : photos récentes, prises sur le chantier")}</p>`;
    const miss = [];
    if (n.position === "unknown") miss.push(t("position du téléphone inconnue"));
    if (n.photos === "unknown") miss.push(t("date des photos inconnue"));
    return `<p class="proof part">${ic("eye", 16)} ${t("Vérification partielle : {why}", { why: miss.join(", ") })}</p>`;
  }

  /* ---------- Argent du chantier ---------- */
  const CATEGORY = { materiaux: "Matériaux", main_oeuvre: "Main-d'œuvre", transport: "Transport", autre: "Autre" };
  const METHOD = { wave: "Wave", orange_money: "Orange Money", mtn_momo: "MTN MoMo", virement: "Virement", especes: "Espèces", autre: "Autre" };
  // Résumé (budget, versé, dépensé, avancement), alerte, échéancier et lignes. me : id du compte (bouton « Annuler »).
  function moneyPanel(m, { me, forClient } = {}) {
    const cur = m.currency, pct = (n) => (m.budget ? Math.min(100, Math.round((n / m.budget) * 100)) : 0);
    const line = (e) => `<li class="ml ${e.kind} ${e.cancelled_at ? "cancelled" : ""}">
        <span class="ml-ic">${ic(e.kind === "versement" ? "card" : "tool", 16)}</span>
        <div class="ml-main">
          <div class="ml-top"><b>${e.kind === "versement" ? t("Versement") + (e.category ? " · " + t(METHOD[e.category] || "Autre") : "") : esc(e.label) + " · " + t(CATEGORY[e.category] || "Autre")}</b><span class="ml-amt">${e.kind === "versement" ? "+" : "−"}${money(e.amount, cur)}</span></div>
          <span class="muted">${dShort(e.entry_date)} · ${t("noté par {who}", { who: esc(e.created_by_name) })}${e.kind === "versement" && e.label ? " · " + esc(e.label) : ""}</span>
          ${e.cancelled_at ? `<span class="ml-cancel">${t("Annulée le {date} par {who}", { date: dShort(e.cancelled_at), who: esc(e.cancelled_by_name) })}${e.cancel_reason ? " : " + esc(e.cancel_reason) : ""}</span>` : ""}
          ${e.receipt_url || (!e.cancelled_at && me && e.created_by === me) ? `<div class="ml-foot">${e.receipt_url ? `<a class="ml-receipt" href="${e.receipt_url}" target="_blank" rel="noopener"><img src="${e.receipt_url}" alt="${t("Reçu")}" loading="lazy"></a>` : "<span></span>"}${!e.cancelled_at && me && e.created_by === me ? `<button type="button" class="btn ghost ml-x" data-ledger-cancel="${e.id}">${t("Annuler")}</button>` : ""}</div>` : ""}
        </div>
      </li>`;
    const vers = m.entries.filter((e) => e.kind === "versement"), deps = m.entries.filter((e) => e.kind === "depense");
    return `<section class="card card-p money">
      <div class="m-figs">
        <div><span>${t("Budget")}</span><b>${m.budget ? money(m.budget, cur) : "—"}</b><small>${m.budget_from === "devis" ? t("devis signés") : m.budget_from ? t("estimation") : t("ajoutez un devis")}</small></div>
        <div><span>${t("Versé")}</span><b>${money(m.paid, cur)}</b><small>${m.paid_pct != null ? t("{n} % du budget", { n: m.paid_pct }) : ""}</small></div>
        <div><span>${t("Dépenses justifiées")}</span><b>${money(m.spent, cur)}</b><small>${m.paid ? t("{n} % de l'argent versé", { n: Math.round((m.spent / m.paid) * 100) }) : ""}</small></div>
        <div><span>${t("Travaux réalisés")}</span><b>${m.progress} %</b><small>${t("d'après les étapes")}</small></div>
      </div>
      <div class="m-bars" aria-hidden="true"><span class="lbl">${t("Versé")}</span><span class="bar"><i class="paid" style="width:${pct(m.paid)}%"></i></span><span class="lbl">${t("Réalisé")}</span><span class="bar"><i class="done" style="width:${m.progress}%"></i></span></div>
      ${m.alert ? `<div class="warnbox">${ic("warn", 18)} ${t("Attention : {paid} % du budget est déjà versé pour {done} % des travaux réalisés.", { paid: m.paid_pct, done: m.progress })} ${forClient ? t("Avant le prochain versement, demandez où en est le chantier.") : ""}</div>` : m.paid ? `<div class="okbox">${ic("check", 18)} ${t("Les versements suivent l'avancement des travaux.")}</div>` : ""}
      ${m.unjustified > 0 ? `<p class="muted m-note">${t("{n} versés ne sont pas encore justifiés par une dépense avec reçu.", { n: money(m.unjustified, cur) })}</p>` : ""}
      ${m.schedule.length ? `<h3>${t("Échéancier")}</h3><ul class="m-sched">${m.schedule.map((x) => `<li><span>${esc(x.name)}</span><b>${money(x.amount, cur)}</b>${x.due ? `<span class="chip ok">${t("Étape validée")}</span>` : `<span class="chip idle">${t("À la validation")}</span>`}</li>`).join("")}</ul>` : ""}
      <h3>${t("Versements")}</h3>${vers.length ? `<ul class="m-list">${vers.map(line).join("")}</ul>` : `<p class="muted">${t("Aucun versement noté.")}</p>`}
      <h3>${t("Dépenses")}</h3>${deps.length ? `<ul class="m-list">${deps.map(line).join("")}</ul>` : `<p class="muted">${t("Aucune dépense notée.")}</p>`}
    </section>`;
  }
  // Formulaires : dépense (gestionnaire) et versement.
  const today = () => new Date().toISOString().slice(0, 10);
  const depenseForm = (cur) => `<form class="card card-p form" id="add-depense"><h2>${t("Noter une dépense")}</h2>
    <p class="muted" style="font-size:.84rem">${t("Achat de matériaux, paie des ouvriers, transport… Avec la photo du reçu, la dépense est justifiée aux yeux du propriétaire.")}</p>
    <div class="row2"><div class="field"><label for="dp-label">${t("Quoi ?")}</label><input id="dp-label" name="label" required maxlength="160" placeholder="${t("Ex. : 40 sacs de ciment")}"></div>
    <div class="field"><label for="dp-cat">${t("Catégorie")}</label><select id="dp-cat" name="category">${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}">${t(v)}</option>`).join("")}</select></div></div>
    <div class="row2"><div class="field"><label for="dp-amount">${t("Montant ({cur})", { cur })}</label><input id="dp-amount" name="amount" type="number" min="1" required inputmode="numeric"></div>
    <div class="field"><label for="dp-date">${t("Date")}</label><input id="dp-date" name="entry_date" type="date" required value="${today()}"></div></div>
    <div class="field"><label for="dp-receipt">${t("Photo du reçu (conseillé)")}</label><input id="dp-receipt" name="receipt" type="file" accept="image/*"></div>
    <div><button class="btn primary" type="submit">${t("Ajouter la dépense")}</button></div></form>`;
  const versementForm = (cur, { received } = {}) => `<form class="card card-p form" id="add-versement"><h2>${received ? t("Noter un versement reçu") : t("Noter un versement")}</h2>
    <p class="muted" style="font-size:.84rem">${received ? t("L'argent reçu du propriétaire pour le chantier.") : t("Chaque envoi d'argent pour le chantier. Vous voyez tout de suite si vous avez payé plus que ce qui est construit.")}</p>
    <div class="row2"><div class="field"><label for="vs-amount">${t("Montant ({cur})", { cur })}</label><input id="vs-amount" name="amount" type="number" min="1" required inputmode="numeric"></div>
    <div class="field"><label for="vs-method">${t("Moyen")}</label><select id="vs-method" name="category">${Object.entries(METHOD).map(([k, v]) => `<option value="${k}">${t(v)}</option>`).join("")}</select></div></div>
    <div class="row2"><div class="field"><label for="vs-date">${t("Date")}</label><input id="vs-date" name="entry_date" type="date" required value="${today()}"></div>
    <div class="field"><label for="vs-label">${t("Note (facultatif)")}</label><input id="vs-label" name="label" maxlength="160" placeholder="${t("Ex. : pour la dalle")}"></div></div>
    <div><button class="btn primary" type="submit">${t("Ajouter le versement")}</button></div></form>`;
  const curLabel = (c) => (c === "EUR" ? "€" : "FCFA");

  function docsTable(docs, currency, { editable } = {}) {
    if (!docs.length) return `<p class="muted">${t("Aucun devis ni facture pour l'instant.")}</p>`;
    const sum = (f) => docs.filter(f).reduce((a, d) => a + d.amount, 0);
    const devis = sum((d) => d.kind === "devis" && d.status === "signe"), paye = sum((d) => d.status === "payee"), du = sum((d) => d.status === "a_regler");
    const chip = { signe: `<span class="chip idle">${t("Signé")}</span>`, en_attente: `<span class="chip wait">${t("À signer")}</span>`, payee: `<span class="chip ok">${t("Payée")}</span>`, a_regler: `<span class="chip warn">${t("À régler")}</span>` };
    return `<div class="tbl-wrap"><table class="docs">
      <thead><tr><th>${t("Date")}</th><th>${t("Document")}</th><th>${t("Objet")}</th><th class="r">${t("Montant")}</th><th>${t("Statut")}</th>${editable ? "<th></th>" : ""}</tr></thead>
      <tbody>${docs.map((d) => `<tr><td class="num">${dShort(d.doc_date)}</td><td>${d.kind === "devis" ? t("Devis") : t("Facture")} · ${esc(d.ref)}</td><td>${esc(d.label)}</td><td class="r">${money(d.amount, currency)}</td><td>${chip[d.status]}</td>${editable ? `<td>${d.status === "a_regler" ? `<button type="button" class="btn ghost" data-doc-paid="${d.id}">${t("Marquer payée")}</button>` : d.status === "en_attente" ? `<button type="button" class="btn ghost" data-doc-signed="${d.id}">${t("Marquer signé")}</button>` : ""} <button type="button" class="btn ghost" data-doc-del="${d.id}" aria-label="${t("Supprimer")}">${ic("x", 14)}</button></td>` : ""}</tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">${t("Total des devis signés")}</td><td class="r">${money(devis, currency)}</td><td colspan="${editable ? 2 : 1}"></td></tr>
      <tr><td colspan="3" class="muted">${t("Payé · reste à régler")}</td><td class="r">${money(paye, currency)} · ${money(du, currency)}</td><td colspan="${editable ? 2 : 1}"></td></tr></tfoot>
    </table></div>`;
  }

  window.AF = { t, tr, lang, LANGS, translatePage, setLang, langSelect, themeToggle, prefs, setTheme, consent, cookieBanner, footerLinks, installCard, installNudge, exifOf, position, verifyBadge, moneyPanel, depenseForm, versementForm, curLabel, LOGO, ic, esc, fmt, time, dShort, dLong, nf, money, cap, plural, rel, api, upload, shrink, toast, copy, STATUS_CHIP, healthChip, siteCard, journal, docsTable };
})();
