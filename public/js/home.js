// Pages publiques : logo, lien de démo, captures dans la bonne langue, photos de chantier si elles existent, apparition au défilement.
(function () {
  "use strict";
  const { LOGO, api, lang } = window.AF;
  document.documentElement.classList.add("js");
  ["logo", "logo-foot"].forEach((id) => { const el = document.getElementById(id); if (el) el.insertAdjacentHTML("afterbegin", LOGO(28) + " "); });
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const demoLink = document.getElementById("demo-link");
  // Photos de chantier (public/img/photos/) : chargées seulement si le serveur dit qu'elles existent.
  api("/api/config", { authRedirect: false }).then((c) => {
    if (demoLink) demoLink.hidden = !c.demo;
    document.querySelectorAll("img[data-photo]").forEach((img) => {
      if (!(c.photos || []).includes(img.dataset.photo)) return img.remove();
      img.addEventListener("load", () => img.closest("[data-photo-frame]")?.classList.add("has-photo"), { once: true });
      img.src = "/img/photos/" + img.dataset.photo;
    });
  }).catch(() => {});

  // Captures de l'application : /img/<nom>-<langue>-<thème>.jpg
  document.querySelectorAll("img[data-shot]").forEach((img) => {
    const src = `/img/${img.dataset.shot}-${lang}-${img.hasAttribute("data-dark") ? "dark" : "light"}.jpg`;
    if (!img.src.endsWith(src)) img.src = src;
  });

  // Les sections apparaissent en douceur quand elles arrivent à l'écran ; elles restent visibles sans JavaScript.
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.remove("pending"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".lp-intro .lp-wrap, .lp-chapter, .lp-steps li, .lp-band-in, .lp-plan, .lp-faq-wrap, .lp-close .lp-wrap").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add("reveal", "pending"); io.observe(el); }
    });
  }
})();
