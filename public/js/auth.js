// Connexion, inscription, mot de passe oublié et nouveau mot de passe.
(function () {
  "use strict";
  const { LOGO, api, themeControl } = window.AF;
  const PAGES = {
    "/connexion": ["login", "Connexion", 'Pas encore de compte ? <a href="/inscription">Essayer gratuitement</a>'],
    "/inscription": ["signup", "Inscription", 'Déjà un compte ? <a href="/connexion">Se connecter</a>'],
    "/mot-de-passe-oublie": ["forgot", "Mot de passe oublié", '<a href="/connexion">Retour à la connexion</a>'],
    "/reinitialiser": ["reset", "Nouveau mot de passe", '<a href="/mot-de-passe-oublie">Demander un nouveau lien</a>']
  };
  const [id, title, sw] = PAGES[location.pathname] || PAGES["/connexion"];
  const resetToken = new URLSearchParams(location.search).get("jeton");
  document.getElementById("logo").insertAdjacentHTML("afterbegin", LOGO(30) + " ");
  document.getElementById(id).hidden = false;
  document.getElementById("switch").innerHTML = sw;
  document.getElementById("theme").innerHTML = themeControl();
  if (id === "login") api("/api/config", { authRedirect: false }).then((c) => { document.getElementById("demo").hidden = !c.demo; }).catch(() => {});
  document.title = title + " · Archfield";
  if (id === "reset" && !resetToken) {
    const err = document.querySelector("#reset .error-box");
    err.textContent = "Ce lien est incomplet. Ouvrez le lien reçu par e-mail, ou demandez-en un nouveau.";
    err.hidden = false;
  }

  document.querySelectorAll("form[data-api]").forEach((f) => f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("[type=submit]"), err = f.querySelector(".error-box"), ok = f.querySelector(".okbox");
    const body = Object.fromEntries(new FormData(f));
    if (f.id === "reset") body.token = resetToken || "";
    btn.disabled = true; err.hidden = true;
    try {
      await api(f.dataset.api, { method: "POST", body, authRedirect: false });
      if (f.id === "forgot") { ok.hidden = false; btn.disabled = false; return; }
      location.href = "/app";
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  }));
})();
