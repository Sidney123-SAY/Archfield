// Applique le thème choisi (clair, sombre) avant l'affichage, pour éviter un flash. Sans choix : thème du système.
(function () {
  try {
    var t = localStorage.getItem("af-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
