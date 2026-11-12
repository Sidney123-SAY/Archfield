// Page d'accueil : la maison se construit au défilement. Plan d'architecte la nuit, fondations, murs, dalle et étage,
// toiture, maison finie au soleil ; puis on entre dans le salon : plan, gros œuvre, second œuvre, pièce finie.
// Le défilement règle une valeur f (0 → nombre d'étapes − 1), lissée image par image pour un mouvement fluide.
(function () {
  "use strict";
  const sec = document.querySelector(".lp-build");
  if (!sec) return;
  const pin = sec.querySelector(".b-pin");
  const extBox = sec.querySelector('[data-scene="ext"]'), intBox = sec.querySelector('[data-scene="int"]');
  let panels = [...sec.querySelectorAll(".b-panel")];
  let cards = [...sec.querySelectorAll(".b-cards .ui-card")];
  let labels = [...sec.querySelectorAll(".b-label")];
  const bar = sec.querySelector(".b-bar i"), hint = sec.querySelector(".b-hint");
  let N = labels.length; // nombre d'étapes
  const EXT = 5;           // étapes 0 à 5 : extérieur ; 6 à N-1 : intérieur
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const seg = (v, a, b) => ease((v - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;

  let ext = null, int = null, seq = null;
  const load = (url, box) => fetch(url).then((r) => (r.ok ? r.text() : Promise.reject())).then((t) => { box.innerHTML = t; const s = box.querySelector("svg"); s.setAttribute("aria-hidden", "true"); return s; });
  // Mode « séquence » (photoréaliste) : si public/img/sequence/manifest.json existe (tools/sequence.js, vidéos Higgsfield),
  // on affiche les images de la vidéo au rythme du défilement ; sinon, les scènes dessinées.
  fetch("/img/sequence/manifest.json").then((r) => (r.ok ? r.json() : Promise.reject())).then(startSeq).catch(startSvg);

  function startSeq(m) {
    // Moins d'étapes que de textes (par exemple seulement l'extérieur) : on garde les premières, et la dernière
    // étape reçoit le texte de conclusion (avec le bouton).
    if (m.keys.length < N) {
      const last = m.keys.length - 1, close = panels.find((el) => Number(el.dataset.k) === N - 1);
      panels.filter((el) => Number(el.dataset.k) >= last && el !== close).forEach((el) => el.remove());
      if (close) close.dataset.k = String(last);
      cards.filter((el) => Number(el.dataset.k) > last).forEach((el) => el.remove());
      labels.slice(m.keys.length).forEach((el) => el.remove());
      panels = [...sec.querySelectorAll(".b-panel")]; cards = [...sec.querySelectorAll(".b-cards .ui-card")]; labels = [...sec.querySelectorAll(".b-label")];
      N = m.keys.length;
      sec.style.setProperty("--frames", String(N));
    }
    const canvas = document.createElement("canvas");
    canvas.className = "b-canvas";
    canvas.setAttribute("aria-hidden", "true");
    extBox.appendChild(canvas);
    intBox.remove();
    const dir = (pin.clientWidth / pin.clientHeight < 0.8 ? m.mobile : m.desktop) || "d";
    const imgs = new Array(m.count);
    const url = (i) => `/img/sequence/${dir}/${String(i + 1).padStart(4, "0")}.${m.ext || "webp"}`;
    // Chargement progressif : les images des étapes d'abord, puis une sur huit, une sur quatre… jusqu'à toutes.
    const order = [...new Set([...m.keys, ...[8, 4, 2, 1].flatMap((st) => Array.from({ length: Math.ceil(m.count / st) }, (_, k) => k * st))])].filter((i) => i < m.count);
    let next = 0;
    const pump = () => {
      if (next >= order.length) return;
      const i = order[next++], img = new Image();
      img.decoding = "async";
      img.onload = () => { imgs[i] = img; if (seq && Math.abs(seq.shown - i) < 12) kick(true); pump(); };
      img.onerror = pump;
      img.src = url(i);
    };
    for (let k = 0; k < 6; k++) pump();
    seq = { m, canvas, ctx: canvas.getContext("2d"), imgs, shown: -1, drawn: -1 };
    sec.classList.add("ready", "is-seq");
    frame(true);
  }
  // Image à montrer pour l'étape f (interpolée entre les images des étapes), puis la plus proche déjà chargée.
  function drawSeq(f) {
    const { m, canvas, ctx, imgs } = seq, keys = m.keys;
    const k = Math.min(keys.length - 2, Math.floor(f)), t = f - k;
    const want = Math.round(lerp(keys[k], keys[k + 1], clamp(t)));
    let i = want;
    for (let d = 0; d < m.count; d++) { if (imgs[want - d]) { i = want - d; break; } if (imgs[want + d]) { i = want + d; break; } }
    seq.shown = want;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(pin.clientWidth * dpr), H = Math.round(pin.clientHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; seq.drawn = -1; }
    const img = imgs[i];
    if (!img || seq.drawn === i) return;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
    // Sur grand écran, l'image est décalée à droite pour laisser la place au texte.
    const shift = W / H > 1.2 ? Math.min((w - W) / 2, W * 0.06) : 0;
    ctx.drawImage(img, (W - w) / 2 + shift, (H - h) / 2, w, h);
    seq.drawn = i;
  }

  function startSvg() { Promise.all([load("/img/chantier-ext.svg", extBox), load("/img/chantier-int.svg", intBox)]).then(([e, i]) => {
    ext = e; int = i;
    const q = (svg, id) => svg.querySelector("#" + id);
    ext.parts = Object.fromEntries(["cam", "plan", "sky-night", "night", "found", "rdc", "scaf", "dalle", "etage", "roof-frame", "roof-tiles", "finish", "garden"].map((id) => [id, q(ext, id)]));
    ext.clips = { rdc: q(ext, "c-rdc").firstElementChild, etg: q(ext, "c-etg").firstElementChild, roof: q(ext, "c-roof").firstElementChild };
    int.parts = Object.fromEntries(["i-cam", "i-plan", "i-plaster", "i-tiles", "i-done"].map((id) => [id, q(int, id)]));
    int.clips = { tiles: q(int, "c-tiles").firstElementChild };
    sec.classList.add("ready");
    frame(true);
  }).catch(() => {}); }

  // Cadrage : on garde la maison entière à l'écran, quel que soit le format (téléphone en hauteur, grand écran).
  function fit(svg, cx, cy, minW) {
    const w = pin.clientWidth, h = pin.clientHeight, a = w / h;
    let vw = Math.max(minW, Math.min(1600, 900 * a)), vh = vw / a;
    if (vh < 520) { vh = 520; vw = vh * a; }
    // Sur grand écran, la maison est un peu à droite, pour laisser la place au texte à gauche.
    const shift = a > 1.2 ? vw * 0.15 : 0;
    const top = a > 1.2 ? cy - vh * 0.52 : cy - vh * (a < 0.8 ? 0.3 : 0.42);
    svg.setAttribute("viewBox", `${(cx - vw / 2 - shift).toFixed(1)} ${top.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  }
  let lastFit = "";
  function refit() {
    const key = pin.clientWidth + "x" + pin.clientHeight;
    if (key === lastFit || !ext) return;
    lastFit = key;
    fit(ext, 800, 470, 720);
    fit(int, 800, 430, 760);
  }

  const op = (el, v) => { if (el) el.style.opacity = v.toFixed(3); };
  const scaleAt = (el, s, x, y) => { if (el) el.setAttribute("transform", `translate(${x} ${y}) scale(${s.toFixed(4)}) translate(${-x} ${-y})`); };

  function drawExt(e, enter) {
    const P = ext.parts;
    // La nuit cède la place au jour pendant les fondations ; le plan lumineux s'efface à mesure que la maison monte.
    const night = 1 - seg(e, 0.55, 1.7);
    op(P["sky-night"], night); op(P.night, 0.55 * night);
    op(P.plan, e < 1 ? lerp(1, 0.55, seg(e, 0.2, 1)) : lerp(0.55, 0, seg(e, 1, 3)));
    op(P.found, seg(e, 0.25, 0.9));
    const rdc = seg(e, 1.05, 1.85), etg = seg(e, 2.25, 2.95);
    ext.clips.rdc.setAttribute("y", lerp(690, 440, rdc)); ext.clips.rdc.setAttribute("height", lerp(0, 250, rdc));
    op(P.rdc, rdc > 0 ? 1 : 0);
    op(P.dalle, seg(e, 2.0, 2.25));
    ext.clips.etg.setAttribute("y", lerp(488, 290, etg)); ext.clips.etg.setAttribute("height", lerp(0, 198, etg));
    op(P.etage, etg > 0 ? 1 : 0);
    op(P.scaf, seg(e, 1.2, 1.5) * (1 - seg(e, 4.3, 4.7)));
    op(P["roof-frame"], seg(e, 3.0, 3.25));
    const roof = seg(e, 3.3, 3.95);
    ext.clips.roof.setAttribute("width", lerp(0, 620, roof)); op(P["roof-tiles"], roof > 0 ? 1 : 0);
    op(P.finish, seg(e, 4.05, 4.6)); op(P.garden, seg(e, 4.3, 4.9));
    // Caméra : léger recul pendant la construction, puis on entre par la porte vers le salon.
    const s = lerp(1.14, 1, seg(e, 0, 5)) * lerp(1, 3.2, enter);
    scaleAt(P.cam, s, 800, lerp(470, 600, enter)); scaleAt(P.plan, s, 800, lerp(470, 600, enter));
  }
  function drawInt(i) {
    const P = int.parts;
    op(P["i-plan"], 1 - seg(i, 0.15, 0.85));
    op(P["i-plaster"], seg(i, 1.1, 1.6));
    const t = seg(i, 1.4, 2.0);
    int.clips.tiles.setAttribute("x", lerp(2800, -1200, t)); op(P["i-tiles"], t > 0 ? 1 : 0);
    op(P["i-done"], seg(i, 2.1, 2.75));
    scaleAt(P["i-cam"], lerp(1.18, 1, seg(i, 0, 3)), 800, 430); scaleAt(P["i-plan"], lerp(1.18, 1, seg(i, 0, 3)), 800, 430);
  }

  let cur = 0, target = 0, raf = 0;
  function progress() {
    const r = sec.getBoundingClientRect(), span = r.height - window.innerHeight;
    return span > 0 ? clamp(-r.top / span) * (N - 1) : 0;
  }
  function frame(force) {
    raf = 0;
    target = progress();
    cur = still || force ? target : cur + (target - cur) * 0.14;
    if (Math.abs(target - cur) < 0.001) cur = target;
    const f = cur;
    if (seq) drawSeq(f);
    else if (ext) {
      refit();
      const enter = seg(f, EXT + 0.15, EXT + 0.75);
      drawExt(Math.min(f, EXT), enter);
      drawInt(Math.max(0, f - EXT - 1));
      extBox.style.opacity = (1 - seg(f, EXT + 0.4, EXT + 0.8)).toFixed(3);
      intBox.style.opacity = seg(f, EXT + 0.4, EXT + 0.8).toFixed(3);
    }
    // Textes et fiches : chacun apparaît autour de son étape, monte légèrement, puis s'efface.
    panels.forEach((el) => { const d = f - Number(el.dataset.k); const v = clamp(1 - Math.abs(d) * 2.4); el.style.opacity = v.toFixed(3); el.style.transform = `translateY(${(-d * 36).toFixed(1)}px)`; el.style.visibility = v > 0.01 ? "visible" : "hidden"; });
    cards.forEach((el) => { const d = f - Number(el.dataset.k); const v = clamp(1 - Math.abs(d) * 2.2); el.style.opacity = v.toFixed(3); el.style.transform = `translateY(${(-d * 60).toFixed(1)}px) scale(${(0.96 + 0.04 * v).toFixed(3)})`; el.style.visibility = v > 0.01 ? "visible" : "hidden"; });
    labels.forEach((el, k) => { const v = clamp(1 - Math.abs(f - k) * 2); el.style.opacity = v.toFixed(3); el.style.transform = `translateY(${((f - k) * -14).toFixed(1)}px)`; });
    if (hint) hint.style.opacity = (1 - clamp(f * 3)).toFixed(3);
    if (bar) bar.style.transform = `scaleX(${(f / (N - 1)).toFixed(4)})`;
    // Ciel de nuit au début, puis jour : la barre de navigation suit (claire sur fond sombre).
    sec.classList.toggle("is-day", f > 1.1 && f < EXT + 0.6 || f > EXT + 1.3);
    if (Math.abs(target - cur) > 0.0005) raf = requestAnimationFrame(() => frame(false));
  }
  function kick(redraw) { if (redraw === true && seq) seq.drawn = -1; if (!raf) raf = requestAnimationFrame(() => frame(false)); }
  window.addEventListener("scroll", kick, { passive: true });
  window.addEventListener("resize", () => { lastFit = ""; kick(); });
  sec.classList.add("on");
  frame(true);
})();
