// Pages publiques : logo et lien vers le chantier de démo s'il existe.
(function () {
  "use strict";
  const logo = document.getElementById("logo");
  if (logo) logo.insertAdjacentHTML("afterbegin", window.AF.LOGO(28) + " ");
  const demoLink = document.getElementById("demo-link");
  if (demoLink) window.AF.api("/api/config", { authRedirect: false }).then((c) => { demoLink.hidden = !c.demo; }).catch(() => {});
})();
