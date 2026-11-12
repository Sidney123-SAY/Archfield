// Connexion, inscription question par question (client, entreprise ou proche invité), invitation, mot de passe oublié.
(function () {
  "use strict";
  const { t, ic, api, esc, dialSelect, looksPhone, guessDial, toast } = window.AF;
  // L'indicatif d'un numéro qui a servi (inscription, connexion) est proposé la fois suivante sur cet appareil.
  const rememberDial = (ident, dial) => { if (dial && looksPhone(ident) && !/^\s*(\+|00)/.test(ident)) window.AF.store.set("af-dial", dial); };
  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const path = location.pathname;
  const resetToken = params.get("jeton");
  const googleToken = params.get("google");
  const store = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} } };
  const ERRORS = {
    google: "La connexion avec Google n'a pas abouti. Réessayez, ou utilisez votre e-mail.",
    "google-email": "Votre adresse Google n'est pas vérifiée. Vérifiez-la chez Google, ou inscrivez-vous avec votre e-mail.",
    "google-indisponible": "La connexion avec Google n'est pas encore activée sur ce site.",
    apple: "La connexion avec Apple n'a pas abouti. Réessayez, ou utilisez votre e-mail.",
    "apple-email": "Votre adresse Apple n'est pas vérifiée. Inscrivez-vous avec votre e-mail.",
    "apple-indisponible": "La connexion avec Apple n'est pas encore activée sur ce site.",
    "compte-existant": "Un compte existe déjà avec cette adresse. Connectez-vous avec votre mot de passe, ou cliquez sur « Mot de passe oublié » : vous pourrez ensuite utiliser Google ou Apple."
  };
  // Pays de résidence proposés aux clients (la diaspora vit souvent hors de la liste des pays d'entreprise).
  const HOME_EXTRA = [["CA", "Canada"], ["US", "États-Unis"], ["GB", "Royaume-Uni"], ["IT", "Italie"], ["ES", "Espagne"], ["DE", "Allemagne"], ["XX", "Autre pays"]];

  document.querySelectorAll("[data-ic]").forEach((el) => { el.innerHTML = ic(el.dataset.ic, 20); });
  document.querySelectorAll(".g-ic").forEach((el) => { el.innerHTML = ic("google", 20); });
  document.querySelectorAll(".a-ic").forEach((el) => { el.innerHTML = ic("apple", 20); });
  // Comme chez Finary : « Se connecter » reste grisé tant que l'e-mail et le mot de passe ne sont pas remplis.
  // Avec un numéro, pas de mot de passe : « Recevoir un code » (WhatsApp ou SMS). « Utiliser mon mot de passe » le rouvre.
  const loginForm = $("#login"), loginBtn = loginForm.querySelector("[type=submit]");
  let usePassword = false;
  const loginByCode = () => looksPhone($("#li-ident").value) && !usePassword;
  const syncLogin = () => {
    const phone = looksPhone($("#li-ident").value), code = phone && !usePassword;
    $("#li-pw-field").hidden = code;
    $("#li-password").required = !code;
    $("#li-pw-toggle").hidden = !phone;
    $("#li-pw-toggle").textContent = code ? t("Utiliser mon mot de passe") : t("Recevoir plutôt un code");
    loginBtn.textContent = code ? t("Recevoir un code") : t("Se connecter");
    loginBtn.disabled = !($("#li-ident").value.trim() && (code || $("#li-password").value));
  };
  $("#li-pw-toggle").addEventListener("click", () => { usePassword = !usePassword; syncLogin(); if (usePassword) $("#li-password").focus(); });
  loginForm.addEventListener("input", syncLogin);
  setTimeout(syncLogin, 300); // après le remplissage automatique du navigateur
  document.querySelectorAll("[data-eye]").forEach((b) => {
    b.innerHTML = ic("eye", 18);
    b.addEventListener("click", () => { const i = b.parentElement.querySelector("input"); i.type = i.type === "password" ? "text" : "password"; });
  });
  if (ERRORS[params.get("erreur")]) { $("#query-error").textContent = t(ERRORS[params.get("erreur")]); $("#query-error").hidden = false; }

  // Après connexion : accepte une invitation en attente, puis ouvre l'application.
  async function done() {
    const code = store.get("af-invite");
    if (code) { try { await api(`/api/invitations/${code}/accept`, { method: "POST", authRedirect: false }); } catch (e) { alert(e.message); } store.set("af-invite", null); }
    location.href = "/app";
  }
  function showError(form, msg) { const err = form.querySelector(".error-box"); err.textContent = msg; err.hidden = !msg; }
  const show = (id) => { document.querySelectorAll(".au-panel").forEach((p) => { p.hidden = p.id !== id; }); };

  /* ---------- Inscription question par question ---------- */
  let invite = null;          // { code, kind, site, owner } si l'inscription vient d'une invitation
  let countries = [];
  let stepIndex = 0;
  const STEP_NAMES = { role: "Profil", name: "Identité", company: "Entreprise", home: "Lieu de vie", account: "Accès" };
  const role = () => (invite ? (invite.kind === "pro" ? "pro" : "proche") : document.querySelector('input[name="account_type"]:checked')?.value);
  function steps() {
    const r = role();
    const list = invite ? [] : ["role"];
    list.push("name");
    if (r === "pro") list.push("company");
    if (r === "client") list.push("home");
    if (!googleToken) list.push("account");
    return list;
  }
  function renderStep() {
    const list = steps(), cur = list[stepIndex];
    document.querySelectorAll(".au-step").forEach((el) => { el.hidden = el.dataset.step !== cur; });
    $("#su-count").textContent = t("{i} sur {n}", { i: stepIndex + 1, n: list.length });
    $("#su-stepname").textContent = t(STEP_NAMES[cur]);
    $("#su-bars").innerHTML = list.map((_, i) => `<span class="${i <= stepIndex ? "on" : ""}"></span>`).join("");
    $("#su-back").hidden = stepIndex === 0;
    $("#su-next").textContent = stepIndex === list.length - 1 ? (role() === "client" ? t("Créer mon espace") : t("Créer mon compte")) : t("Suivant");
    showError($("#signup"), "");
    // Indicatif proposé : le pays choisi plus tôt (entreprise ou lieu de vie), s'il est dans la liste.
    if (cur === "account") {
      // Le pays qui correspond au profil : celui de l'entreprise, ou le lieu de vie du client (pas l'autre, pré-rempli).
      const c = role() === "pro" ? $("#su-country")?.value : role() === "client" ? $("#su-home")?.value : "", dial = $("#su-dial");
      if (c && dial && [...dial.options].some((o) => o.value === c)) dial.value = c;
      syncSignupPw();
    }
    const first = document.querySelector(`.au-step[data-step="${cur}"] input:not([type=radio]), .au-step[data-step="${cur}"] select`);
    if (first && window.matchMedia("(min-width: 761px)").matches) first.focus();
  }
  function checkStep(cur) {
    const v = (n) => ($(`#signup [name="${n}"]`)?.value || "").trim();
    if (cur === "role" && !role()) return t("Choisissez votre profil pour continuer.");
    if (cur === "name" && !v("contact_name")) return t("Indiquez votre prénom et votre nom.");
    if (cur === "company") {
      const c = countries.find((x) => x.code === v("country"));
      if (!c) return t("Choisissez le pays de votre entreprise.");
      if (c.required && !v("company_id")) return t("Indiquez votre {id} : il est obligatoire pour une entreprise en {country}.", { id: t(c.id), country: t(c.name) });
      if (!v("company")) return t("Indiquez le nom de votre entreprise.");
    }
    if (cur === "account") {
      const id = v("ident");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id) && !(looksPhone(id) && id.replace(/\D/g, "").length >= 8)) return t("Indiquez un numéro de téléphone ou une adresse e-mail valide.");
      if (!looksPhone(id) && v("password").length < 8) return t("Le mot de passe doit faire au moins 8 caractères.");
    }
    return "";
  }
  async function submitSignup() {
    const f = $("#signup"), d = Object.fromEntries(new FormData(f));
    const r = role();
    const body = { account_type: r, contact_name: d.contact_name, ident: d.ident, dial: d.dial || guessDial(), password: looksPhone(d.ident) ? undefined : d.password };
    if (r === "pro") Object.assign(body, { country: d.country, company_id: d.company_id, company: d.company, city: d.city });
    if (r === "client") Object.assign(body, { country: countries.some((c) => c.code === d.home_country) ? d.home_country : "", city: d.home_city });
    if (invite) body.invite_code = invite.code;
    if (googleToken) body.google_token = googleToken;
    const btn = $("#su-next");
    btn.disabled = true;
    try {
      const res = await api("/api/signup", { method: "POST", body, authRedirect: false });
      rememberDial(body.ident, body.dial);
      store.set("af-invite", null);
      if (res.confirm_phone) { history.pushState(null, "", "/inscription/confirmer"); return openConfirm(); }
      if (res.confirm_email) return openEmailConfirm();
      location.href = "/app";
    }
    catch (e) { showError(f, e.message); btn.disabled = false; }
  }
  $("#signup").addEventListener("submit", (e) => {
    e.preventDefault();
    const list = steps(), cur = list[stepIndex];
    const err = checkStep(cur);
    if (err) return showError($("#signup"), err);
    if (stepIndex < list.length - 1) { stepIndex++; renderStep(); } else submitSignup();
  });
  $("#su-back").addEventListener("click", () => { if (stepIndex > 0) { stepIndex--; renderStep(); } });
  document.querySelectorAll('input[name="account_type"]').forEach((r) => r.addEventListener("change", () => { stepIndex = 1; renderStep(); }));

  /* Pays et numéro d'entreprise */
  function onCountry() {
    const c = countries.find((x) => x.code === $("#su-country").value);
    if (!c) return;
    const input = $("#su-company-id");
    $("#su-company-id-label").textContent = t(c.id) + (c.required ? "" : " " + t("(facultatif)"));
    $("#su-company-id-hint").textContent = t(c.hint);
    input.inputMode = ["FR", "BE"].includes(c.code) ? "numeric" : "text";
    $("#su-price").textContent = t("Archfield est gratuit pour les entreprises.");
    $("#su-siret-check").textContent = "";
  }
  // SIRET : vérification dans l'annuaire des entreprises, puis nom et ville remplis s'ils sont vides.
  let lastChecked = "";
  async function checkSiret() {
    const v = $("#su-company-id").value.replace(/\D/g, "");
    const out = $("#su-siret-check");
    if ($("#su-country").value !== "FR" || v.length !== 14 || v === lastChecked) return;
    lastChecked = v;
    out.textContent = t("Vérification du SIRET…");
    try {
      const r = await api("/api/entreprise/" + v, { authRedirect: false });
      out.innerHTML = r.active ? `✓ ${esc(r.name)}${r.city ? ", " + esc(r.city) : ""}` : t("Attention : cet établissement est fermé ({name}).", { name: esc(r.name) });
      if (!$("#su-company").value) $("#su-company").value = r.name;
      if (!$("#su-city").value && r.city) $("#su-city").value = r.city;
    } catch (e) { out.textContent = e.message; }
  }
  $("#su-country").addEventListener("change", onCountry);
  $("#su-company-id").addEventListener("blur", checkSiret);
  $("#su-company-id").addEventListener("input", () => { if ($("#su-company-id").value.replace(/\D/g, "").length === 14) checkSiret(); });

  api("/api/config", { authRedirect: false }).then((c) => {
    // Boutons Google et Apple : visibles quand ils sont configurés, et toujours en démonstration
    // (un clic explique alors qu'ils ne sont pas encore activés).
    document.querySelectorAll("[data-provider]").forEach((el) => { el.hidden = !(c[el.dataset.provider] || c.demo); });
    if (c.google || c.apple || c.demo) document.querySelectorAll(".google-zone").forEach((el) => { el.hidden = false; });
    if (c.demo) $("#demo").hidden = false;
    // Canaux d'envoi des codes : WhatsApp n'est proposé que s'il est activé sur le serveur.
    if (c.sms_channels?.length) smsChannels = c.sms_channels;
    document.querySelectorAll("[data-channel]").forEach((b) => { b.hidden = !smsChannels.includes(b.dataset.channel); });
    countries = c.countries || [];
    dials = c.dial || [];
    document.querySelectorAll("select.dial").forEach((sel) => { sel.outerHTML = dialSelect(sel.id, dials).replace("<select", `<select ${sel.hidden ? "hidden" : ""}`); });
    document.querySelectorAll(".ident input").forEach(syncDial);
    const opts = (r) => countries.filter((x) => x.region === r).map((x) => `<option value="${x.code}">${esc(t(x.name))}</option>`).join("");
    const choose = `<option value="" disabled selected>${t("Choisir…")}</option>`;
    const africa = `<optgroup label="${t("Afrique de l'Ouest")}">${opts("ao")}</optgroup><optgroup label="${t("Afrique centrale")}">${opts("ac")}</optgroup>`;
    $("#su-country").innerHTML = `${choose}<optgroup label="${t("Europe")}">${opts("eu")}</optgroup>${africa}`;
    $("#su-home").innerHTML = `${choose}<optgroup label="${t("Europe")}">${opts("eu")}${HOME_EXTRA.slice(3, 6).map(([k, n]) => `<option value="${k}">${t(n)}</option>`).join("")}</optgroup>${africa}<optgroup label="${t("Ailleurs")}">${HOME_EXTRA.filter(([k]) => ["CA", "US", "GB", "XX"].includes(k)).map(([k, n]) => `<option value="${k}">${t(n)}</option>`).join("")}</optgroup>`;
    const guess = /^(fr|en)-(\w\w)$/i.exec(navigator.language || "");
    if (guess) {
      const code = guess[2].toUpperCase();
      if (countries.some((x) => x.code === code)) { $("#su-country").value = code; onCountry(); }
      if ([...$("#su-home").options].some((o) => o.value === code)) $("#su-home").value = code;
    }
  }).catch(() => {});

  /* ---------- Téléphone ou e-mail dans le même champ ---------- */
  let dials = [];
  // L'indicatif apparaît à gauche dès qu'on tape un numéro sans « + » (01 97…), et disparaît pour un e-mail.
  function syncDial(input) {
    const sel = input.parentElement.querySelector("select.dial");
    if (sel) sel.hidden = !(looksPhone(input.value) && !input.value.trim().startsWith("+") && !input.value.trim().startsWith("00"));
  }
  // Inscription avec un numéro : pas de mot de passe (connexion par code), le champ disparaît.
  const syncSignupPw = () => { $("#su-pw-field").hidden = looksPhone($("#su-ident").value); };
  document.addEventListener("input", (e) => { if (e.target.matches(".ident input")) syncDial(e.target); if (e.target.id === "su-ident") syncSignupPw(); });

  /* ---------- Confirmer son numéro, saisir le code ---------- */
  // codeMode : « verify » (confirmer son numéro), « email » (confirmer son e-mail), « reset » (mot de passe oublié)
  // ou « login » (connexion par code). smsChannels : canaux activés sur le serveur, le premier par défaut.
  let codeMode = "verify", resetPhone = null, loginPhone = null, loginRemember = true, channel = "whatsapp", waitTimer = null;
  let smsChannels = "whatsapp,sms".split(",");
  const otherChannel = () => smsChannels.find((c) => c !== channel);
  // Inscrit avec un e-mail : le code part tout seul à l'ouverture de l'écran.
  async function openEmailConfirm() {
    codeMode = "email"; channel = "email";
    try {
      const r = await api("/api/email/send", { method: "POST", authRedirect: false });
      if (r.verified) return finishVerified();
      openCode(r.email, r.wait, r.test_code);
    } catch (e) { openCode("", 45, null); showErr("code", e.message); }
  }
  async function openConfirm() {
    document.title = t("Confirmer votre numéro") + " · Archfield";
    show("confirm");
    try {
      const me = await api("/api/me", { authRedirect: false });
      if (me.phone_verified) return finishVerified();
      $("#cf-phone").textContent = me.phone_pretty || "";
      $("#cf-change").hidden = !!(me.email === null && me.account_type === "membre");
    } catch (e) { location.href = "/connexion"; }
  }
  const showErr = (panel, msg) => { const box = $(`#${panel} .error-box`); box.textContent = msg || ""; box.hidden = !msg; };
  async function sendCode(ch) {
    channel = ch;
    showErr("confirm", "");
    try {
      const r = await api("/api/phone/send", { method: "POST", body: { channel: ch }, authRedirect: false });
      if (r.verified) return finishVerified();
      openCode(r.phone, r.wait, r.test_code);
    } catch (e) { if (!$("#confirm").hidden) showErr("confirm", e.message); else showErr("code", e.message); }
  }
  function openCode(phonePretty, wait, testCode) {
    const url = { verify: "/inscription/code", email: "/inscription/email", reset: "/mot-de-passe-oublie" }[codeMode];
    if (url && location.pathname !== url) history.pushState(null, "", url);
    document.title = t("Saisir le code") + " · Archfield";
    show("code");
    $("#cd-sub").textContent = channel === "email" ? (phonePretty ? t("Code envoyé par e-mail à {email}.", { email: phonePretty }) : t("Saisissez le code reçu par e-mail."))
      : channel === "sms" ? t("Code envoyé par SMS au {phone}.", { phone: phonePretty }) : t("Code envoyé par WhatsApp au {phone}.", { phone: phonePretty });
    $("#cd-test").hidden = !testCode;
    $("#cd-test").textContent = !testCode ? "" : channel === "email" ? t("Mode test (aucun e-mail envoyé) : votre code est {code}", { code: testCode }) : t("Mode test (aucun SMS envoyé) : votre code est {code}", { code: testCode });
    $("#cd-pw").hidden = codeMode !== "reset";
    $("#cd-submit").textContent = codeMode === "reset" ? t("Enregistrer et me connecter") : codeMode === "login" ? t("Me connecter") : codeMode === "email" ? t("Confirmer mon e-mail") : t("Confirmer mon numéro");
    $("#cd-back").hidden = codeMode !== "login";
    const other = codeMode === "email" ? t("Renvoyer le code") : otherChannel() === "sms" ? t("Recevoir plutôt par SMS") : otherChannel() === "whatsapp" ? t("Recevoir plutôt par WhatsApp") : "";
    $("#cd-other").textContent = other;
    $("#cd-other").parentElement.hidden = !other;
    $("#cd-code").value = ""; showErr("code", "");
    $("#cd-code").focus();
    let left = wait || 45;
    clearInterval(waitTimer);
    const tick = () => { $("#cd-wait").textContent = left > 0 ? t("Vous pourrez demander un nouveau code dans {s}.", { s: `0:${String(left).padStart(2, "0")}` }) : ""; $("#cd-other").disabled = left > 0; left--; if (left < 0) clearInterval(waitTimer); };
    tick(); waitTimer = setInterval(tick, 1000);
  }
  async function finishVerified() {
    const back = params.get("retour");
    if (back === "compte") { location.href = "/app#compte"; return; }
    done();
  }
  document.querySelectorAll("[data-channel]").forEach((b) => b.addEventListener("click", () => sendCode(b.dataset.channel)));
  $("#cd-other").addEventListener("click", async () => {
    if (codeMode === "email") return openEmailConfirm();
    const ch = otherChannel();
    if (!ch) return;
    if (codeMode === "verify") return sendCode(ch);
    const [url, ident] = codeMode === "login" ? ["/api/login/code/send", loginPhone] : ["/api/password/forgot", resetPhone];
    try { channel = ch; const r = await api(url, { method: "POST", body: { ident, channel: ch }, authRedirect: false }); openCode(r.phone_pretty, r.wait, r.test_code); } catch (e) { showErr("code", e.message); }
  });
  $("#cd-code").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
    if (e.target.value.length === 6 && codeMode !== "reset") $("#code").requestSubmit();
  });
  $("#code").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = $("#cd-code").value, btn = $("#cd-submit");
    if (code.length !== 6) return showErr("code", t("Le code contient 6 chiffres."));
    btn.disabled = true; showErr("code", "");
    try {
      if (codeMode === "email") { await api("/api/email/verify", { method: "POST", body: { code }, authRedirect: false }); toast(t("Adresse e-mail confirmée.")); return finishVerified(); }
      if (codeMode === "login") { await api("/api/login/code", { method: "POST", body: { phone: loginPhone, code, remember: loginRemember }, authRedirect: false }); return done(); }
      if (codeMode === "reset") { await api("/api/password/reset-code", { method: "POST", body: { phone: resetPhone, code, password: $("#cd-password").value }, authRedirect: false }); location.href = "/app"; return; }
      await api("/api/phone/verify", { method: "POST", body: { code }, authRedirect: false });
      toast(t("Numéro confirmé."));
      finishVerified();
    } catch (x) { showErr("code", x.message); btn.disabled = false; }
  });

  /* ---------- Connexion, mot de passe ---------- */
  document.querySelectorAll("form[data-api]:not(#signup)").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("[type=submit]"), ok = f.querySelector(".okbox");
    const body = Object.fromEntries(new FormData(f));
    if (f.id === "reset") body.token = resetToken || "";
    if (f.id === "login") body.remember = !!f.querySelector('[name="remember"]').checked;
    if ((f.id === "login" || f.id === "forgot") && !body.dial) body.dial = guessDial();
    btn.disabled = true; showError(f, "");
    try {
      if (f.id === "login" && loginByCode()) {
        const r = await api("/api/login/code/send", { method: "POST", body: { ident: body.ident, dial: body.dial, channel: smsChannels[0] }, authRedirect: false });
        codeMode = "login"; loginPhone = r.phone; loginRemember = body.remember; channel = r.channel; btn.disabled = false;
        rememberDial(body.ident, body.dial);
        return openCode(r.phone_pretty, r.wait, r.test_code);
      }
      const r = await api(f.dataset.api, { method: "POST", body, authRedirect: false });
      if (f.id === "forgot" && r.method === "code") { codeMode = "reset"; resetPhone = r.phone; channel = smsChannels[0]; btn.disabled = false; return openCode(r.phone_pretty, r.wait, r.test_code); }
      if (f.id === "forgot") { ok.hidden = false; btn.disabled = false; return; }
      if (r && r.confirm_phone) { history.pushState(null, "", "/inscription/confirmer"); return openConfirm(); }
      if (r && r.confirm_email) return openEmailConfirm();
      done();
    } catch (x) { showError(f, x.message); btn.disabled = false; }
  }));
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-demo]");
    if (!b) return;
    b.disabled = true;
    try { await api("/api/demo-login", { method: "POST", body: { account: b.dataset.demo }, authRedirect: false }); location.href = "/app"; }
    catch (x) { showError($("#login"), x.message); b.disabled = false; }
  });

  /* ---------- Quelle page afficher ---------- */
  async function start() {
    const m = path.match(/^\/invitation\/([\w-]+)$/);
    const pendingCode = m ? m[1] : store.get("af-invite");
    if (pendingCode) {
      try {
        invite = await api("/api/invitations/" + encodeURIComponent(pendingCode), { authRedirect: false });
        store.set("af-invite", invite.code);
        if (invite.contact && !$("#su-ident").value) $("#su-ident").value = invite.contact;
      } catch (e) {
        store.set("af-invite", null);
        if (m) { $("#query-error").textContent = e.message; $("#query-error").hidden = false; show("login"); return; }
      }
    }
    if (m && invite) {
      document.title = t("Invitation") + " · Archfield";
      $("#inv-title").textContent = t("{owner} vous confie le chantier « {site} »", { owner: invite.owner, site: invite.site });
      const ROLE = { chef_chantier: "chef de chantier", chef_equipe: "chef d'équipe", perso: "membre de l'équipe" };
      if (invite.kind === "membre") $("#inv-title").textContent = t("{owner} vous invite sur le chantier « {site} »", { owner: invite.owner, site: invite.site });
      $("#inv-text").textContent = invite.kind === "membre"
        ? t("Vous serez {role} : vous envoyez le rapport du jour, les photos et les dépenses depuis votre téléphone, même sans réseau. C'est gratuit pour vous.", { role: t(ROLE[invite.role] || "membre de l'équipe") })
        : invite.kind === "proche"
        ? t("Vous serez sur place : vous publiez l'avancement depuis votre téléphone (photos et une phrase), {owner} le suit à distance. C'est gratuit pour vous.", { owner: invite.owner })
        : t("Votre entreprise publie l'avancement, {owner} le suit à distance. Connectez-vous avec votre compte entreprise, ou créez-le gratuitement.", { owner: invite.owner });
      $("#inv-code").textContent = invite.code;
      $("#inv-signup").onclick = () => { history.pushState(null, "", "/inscription"); openSignup(); };
      $("#inv-login").onclick = () => { history.pushState(null, "", "/connexion"); show("login"); document.title = t("Connexion") + " · Archfield"; };
      return show("invite");
    }
    if (path === "/inscription") return openSignup();
    if (path === "/inscription/confirmer" || path === "/inscription/code") return openConfirm();
    if (path === "/inscription/email") return openEmailConfirm();
    if (path === "/mot-de-passe-oublie") { document.title = t("Mot de passe oublié") + " · Archfield"; return show("forgot"); }
    if (path === "/reinitialiser") {
      document.title = t("Nouveau mot de passe") + " · Archfield";
      show("reset");
      if (!resetToken) showError($("#reset"), t("Ce lien est incomplet. Ouvrez le lien reçu par e-mail, ou demandez-en un nouveau."));
      return;
    }
    document.title = t("Connexion") + " · Archfield";
    show("login");
  }
  async function openSignup() {
    document.title = t("Inscription") + " · Archfield";
    stepIndex = 0;
    show("signup");
    if (googleToken) {
      try {
        const p = await api("/api/oauth-pending/" + encodeURIComponent(googleToken), { authRedirect: false });
        $("#google-pending").innerHTML = `${ic("check", 18)} ${t(p.provider === "apple" ? "Compte Apple : {email}. Il reste quelques questions." : "Compte Google : {email}. Il reste quelques questions.", { email: esc(p.email) })}`;
        $("#google-pending").hidden = false;
        if (p.name && !$("#su-contact").value) $("#su-contact").value = p.name;
      } catch (e) { showError($("#signup"), e.message); }
    }
    renderStep();
  }
  window.addEventListener("popstate", start);
  start();
})();
