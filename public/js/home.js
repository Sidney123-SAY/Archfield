// Pages publiques : logo, lien de démo, captures dans la bonne langue, cartes qui défilent, apparition au défilement.
(function () {
  "use strict";
  const { LOGO, api, lang } = window.AF;
  document.documentElement.classList.add("js");
  ["logo", "logo-foot"].forEach((id) => { const el = document.getElementById(id); if (el) el.insertAdjacentHTML("afterbegin", LOGO(28) + " "); });
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const demoLink = document.getElementById("demo-link");
  if (demoLink) api("/api/config", { authRedirect: false }).then((c) => { demoLink.hidden = !c.demo; }).catch(() => {});

  // Captures de l'application : /img/<nom>-<langue>-<thème>.jpg
  document.querySelectorAll("img[data-shot]").forEach((img) => {
    const src = `/img/${img.dataset.shot}-${lang}-${img.hasAttribute("data-dark") ? "dark" : "light"}.jpg`;
    if (!img.src.endsWith(src)) img.src = src;
  });

  // Flèches du rail de cartes : grisées au début et à la fin, cachées si tout tient à l'écran.
  const rail = document.getElementById("rail");
  const arrows = [...document.querySelectorAll("[data-scroll]")];
  arrows.forEach((b) => b.addEventListener("click", () => {
    const tile = rail.querySelector(".lp-tile");
    rail.scrollBy({ left: Number(b.dataset.scroll) * (tile ? tile.offsetWidth + 20 : 360), behavior: "smooth" });
  }));
  const syncArrows = () => {
    if (!rail || !arrows.length) return;
    const max = rail.scrollWidth - rail.clientWidth;
    arrows[0].parentElement.hidden = max <= 2;
    arrows.forEach((b) => { b.disabled = Number(b.dataset.scroll) < 0 ? rail.scrollLeft <= 2 : rail.scrollLeft >= max - 2; });
  };
  if (rail) { rail.addEventListener("scroll", syncArrows, { passive: true }); window.addEventListener("resize", syncArrows); window.addEventListener("load", syncArrows); syncArrows(); }

  // Les sections apparaissent en douceur quand elles arrivent à l'écran ; elles restent visibles sans JavaScript.
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.remove("pending"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".lp-section .lp-wrap, .lp-split-in > *, .lp-steps li, .lp-market, .lp-price").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add("reveal", "pending"); io.observe(el); }
    });
  }
})();
