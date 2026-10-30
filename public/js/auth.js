// Connexion, inscription (e-mail ou Google), mot de passe oublié et nouveau mot de passe.
(function () {
  "use strict";
  const { t, LOGO, ic, api, esc } = window.AF;
  const $ = (s) => document.querySelector(s);
  const PAGES = {
    "/connexion": ["login", "Connexion", 'Pas encore de compte ? <a href="/inscription">Essayer gratuitement</a>'],
    "/inscription": ["signup", "Inscription", 'Déjà un compte ? <a href="/connexion">Se connecter</a>'],
    "/mot-de-passe-oublie": ["forgot", "Mot de passe oublié", '<a href="/connexion">Retour à la connexion</a>'],
    "/reinitialiser": ["reset", "Nouveau mot de passe", '<a href="/mot-de-passe-oublie">Demander un nouveau lien</a>']
  };
  const ERRORS = {
    google: "La connexion avec Google n'a pas abouti. Réessayez, ou utilisez votre e-mail.",
    "google-email": "Votre adresse Google n'est pas vérifiée. Vérifiez-la chez Google, ou inscrivez-vous avec votre e-mail.",
    "google-indisponible": "La connexion avec Google n'est pas encore activée sur ce site."
  };
  const [id, title, sw] = PAGES[location.pathname] || PAGES["/connexion"];
  const params = new URLSearchParams(location.search);
  const resetToken = params.get("jeton");
  const googleToken = params.get("google");

  $("#logo").insertAdjacentHTML("afterbegin", LOGO(30) + " ");
  document.querySelectorAll(".g-ic").forEach((el) => { el.innerHTML = ic("google", 18); });
  $("#" + id).hidden = false;
  $("#switch").innerHTML = t(sw);
  document.title = t(title) + " · Archfield";
  if (ERRORS[params.get("erreur")]) { $("#query-error").textContent = t(ERRORS[params.get("erreur")]); $("#query-error").hidden = false; }
  if (id === "reset" && !resetToken) {
    const err = $("#reset .error-box");
    err.textContent = t("Ce lien est incomplet. Ouvrez le lien reçu par e-mail, ou demandez-en un nouveau.");
    err.hidden = false;
  }

  /* Pays et numéro d'entreprise */
  let countries = [];
  function onCountry() {
    const c = countries.find((x) => x.code === $("#su-country").value);
    if (!c) return;
    const input = $("#su-company-id");
    $("#su-company-id-label").textContent = t(c.id) + (c.required ? "" : " " + t("(facultatif)"));
    $("#su-company-id-hint").textContent = t(c.hint);
    input.required = c.required;
    input.inputMode = ["FR", "BE"].includes(c.code) ? "numeric" : "text";
    $("#su-price").textContent = c.market === "af" ? t("9 900 FCFA par mois après l'essai.") : t("19 € par mois après l'essai.");
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

  api("/api/config", { authRedirect: false }).then((c) => {
    if (c.google) document.querySelectorAll(".google-zone").forEach((el) => { el.hidden = false; });
    if (c.demo && id === "login") $("#demo").hidden = false;
    countries = c.countries || [];
    const opts = (m) => countries.filter((x) => x.market === m).map((x) => `<option value="${x.code}">${esc(t(x.name))}</option>`).join("");
    $("#su-country").innerHTML = `<option value="" disabled selected>${t("Choisir…")}</option><optgroup label="${t("Europe")}">${opts("eu")}</optgroup><optgroup label="${t("Afrique de l'Ouest")}">${opts("af")}</optgroup>`;
    const guess = /^(fr|en)-(\w\w)$/i.exec(navigator.language || "");
    if (guess && countries.some((x) => x.code === guess[2].toUpperCase())) { $("#su-country").value = guess[2].toUpperCase(); onCountry(); }
  }).catch(() => {});
  $("#su-country").addEventListener("change", onCountry);
  $("#su-company-id").addEventListener("blur", checkSiret);
  $("#su-company-id").addEventListener("input", () => { if ($("#su-company-id").value.replace(/\D/g, "").length === 14) checkSiret(); });

  // Retour de Google pour un nouveau compte : e-mail connu, il reste l'entreprise et le pays.
  if (id === "signup" && googleToken) {
    api("/api/oauth-pending/" + encodeURIComponent(googleToken), { authRedirect: false }).then((p) => {
      $("#google-pending").innerHTML = `${ic("check", 18)} ${t("Compte Google : {email}. Il reste à renseigner votre entreprise.", { email: esc(p.email) })}`;
      $("#google-pending").hidden = false;
      document.querySelectorAll("#signup .email-pw, #signup .google-zone").forEach((el) => { el.hidden = true; el.querySelectorAll("input").forEach((i) => { i.required = false; i.disabled = true; }); });
      if (p.name && !$("#su-contact").value) $("#su-contact").value = p.name;
    }).catch((e) => { const err = $("#signup .error-box"); err.textContent = e.message; err.hidden = false; });
  }

  document.querySelectorAll("form[data-api]").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("[type=submit]"), err = f.querySelector(".error-box"), ok = f.querySelector(".okbox:not(#google-pending)");
    const body = Object.fromEntries(new FormData(f));
    if (f.id === "reset") body.token = resetToken || "";
    if (f.id === "signup" && googleToken) body.google_token = googleToken;
    btn.disabled = true; err.hidden = true;
    try {
      await api(f.dataset.api, { method: "POST", body, authRedirect: false });
      if (f.id === "forgot") { ok.hidden = false; btn.disabled = false; return; }
      location.href = "/app";
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  }));

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-demo]");
    if (!b) return;
    b.disabled = true;
    try { await api("/api/demo-login", { method: "POST", body: { account: b.dataset.demo }, authRedirect: false }); location.href = "/app"; }
    catch (x) { const err = $("#login .error-box"); err.textContent = x.message; err.hidden = false; b.disabled = false; }
  });
})();
