// Pages publiques : logo, choix du thème, lien vers le chantier de démo s'il existe.
document.getElementById("logo").insertAdjacentHTML("afterbegin", window.AF.LOGO(28) + " ");
document.getElementById("theme").innerHTML = window.AF.themeControl();
const demoLink = document.getElementById("demo-link");
if (demoLink) window.AF.api("/api/config", { authRedirect: false }).then((c) => { demoLink.hidden = !c.demo; }).catch(() => {});
