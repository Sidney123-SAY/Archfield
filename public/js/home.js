// Pages publiques : logo, lien de démo, captures dans la bonne langue, plan de façade qui se construit au défilement,
// barre de navigation claire ou sombre selon la section en dessous, apparition douce des sections.
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

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Plan de façade : le fichier SVG est inséré dans la page pour que ses étapes (data-stage) se pilotent ici.
  const plans = [...document.querySelectorAll("[data-facade]")];
  const setStage = (box, n) => { const svg = box.querySelector("svg"); if (svg) svg.setAttribute("data-stage", String(n)); };
  if (plans.length) fetch("/img/facade.svg").then((r) => (r.ok ? r.text() : Promise.reject())).then((svg) => {
    plans.forEach((box, i) => {
      const alt = box.querySelector("img")?.alt;
      box.innerHTML = svg;
      const el = box.querySelector("svg");
      if (alt) el.setAttribute("aria-label", alt); else el.setAttribute("aria-hidden", "true");
      setStage(box, still ? box.dataset.stageTo : 0);
    });
    // Ouverture : la maison s'élève jusqu'aux murs de l'étage.
    const hero = plans[0], to = Number(hero.dataset.stageTo || 4);
    if (!still) for (let n = 1; n <= to; n++) setTimeout(() => setStage(hero, n), 350 + n * 520);
    startStory();
  }).catch(() => {});

  // Récit : l'étape lue au milieu de l'écran règle le plan et la fiche affichée.
  function startStory() {
    const steps = [...document.querySelectorAll(".lp-step")];
    const box = document.querySelector(".lp-story [data-facade]");
    if (!steps.length || !box) return;
    // Sur téléphone, chaque fiche s'affiche dans son étape (copie), sous le plan resté en haut de l'écran.
    steps.forEach((step) => {
      const card = document.querySelector(`.ui-slot [data-card-id="${step.dataset.card}"]`);
      if (card) { const copy = card.cloneNode(true); copy.removeAttribute("data-card-id"); copy.classList.add("ui-inline"); step.appendChild(copy); }
    });
    const show = (step) => {
      steps.forEach((x) => x.classList.toggle("active", x === step));
      setStage(box, step.dataset.stage);
      document.querySelectorAll(".ui-slot .ui-card").forEach((c) => c.classList.toggle("show", c.dataset.cardId === step.dataset.card));
    };
    show(steps[0]);
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) show(e.target); }), { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach((x) => io.observe(x));
  }

  // Barre de navigation : version claire sur fond bleu encre (ouverture, récit, bande entreprises).
  const nav = document.getElementById("lp-nav");
  const darks = [...document.querySelectorAll("[data-dark-section]")];
  if (nav && darks.length) {
    let ticking = false;
    const sync = () => { ticking = false; nav.classList.toggle("on-dark", darks.some((d) => { const r = d.getBoundingClientRect(); return r.top <= 32 && r.bottom >= 32; })); };
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(sync); } }, { passive: true });
    sync();
  }

  // Tarifs : euros TTC en Europe, dollars ailleurs. La région est devinée d'après le fuseau horaire, et se change d'un clic.
  const regionBtns = [...document.querySelectorAll("[data-region]")];
  if (regionBtns.length) {
    const { price, t, nf, store } = window.AF;
    let plans = null;
    const guess = () => { try { return /^Europe\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? "eu" : "world"; } catch (e) { return "eu"; } };
    const usdXof = 600;
    const paint = (region) => {
      regionBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.region === region)));
      document.querySelectorAll("[data-zero]").forEach((el) => { el.textContent = region === "eu" ? "0 €" : "0 $"; });
      if (!plans) return;
      document.querySelectorAll("[data-price]").forEach((el) => { const p = plans[el.dataset.price]; if (p) el.textContent = price(region === "eu" ? p.eur : p.usd, region === "eu" ? "eur" : "usd"); });
      document.querySelectorAll("[data-price-note]").forEach((el) => {
        const p = plans[el.dataset.priceNote];
        if (p) el.textContent = region === "eu" ? t("TVA comprise · deux mois offerts") : t("Environ {n} FCFA · deux mois offerts", { n: nf(Math.round((p.usd / 100) * usdXof / 100) * 100) });
      });
    };
    let region = store.get("af-region") || guess();
    regionBtns.forEach((b) => b.addEventListener("click", () => { region = b.dataset.region; store.set("af-region", region); paint(region); }));
    paint(region);
    api("/api/config", { authRedirect: false }).then((c) => { plans = c.plans; paint(region); }).catch(() => {});
  }

  // Photos de vrais chantiers (ajoutées par l'équipe dans l'espace d'administration).
  const gallery = document.getElementById("lp-gallery");
  if (gallery) api("/api/site-images", { authRedirect: false }).then((list) => {
    if (!list.length) return;
    const { esc } = window.AF;
    gallery.innerHTML = list.map((x) => `<figure><img src="${x.url}" alt="${esc(x.caption)}" loading="lazy"><figcaption>${esc(x.caption)}</figcaption></figure>`).join("");
    document.getElementById("terrain").hidden = false;
  }).catch(() => {});

  // Les sections apparaissent en douceur quand elles arrivent à l'écran ; elles restent visibles sans JavaScript.
  if ("IntersectionObserver" in window && !still) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.remove("pending"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".lp-intro .lp-wrap, .lp-steps li, .lp-band-in, .lp-plan, .lp-faq-wrap, .lp-close .lp-wrap").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add("reveal", "pending"); io.observe(el); }
    });
  }
})();
