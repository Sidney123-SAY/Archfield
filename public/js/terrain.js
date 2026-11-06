// « Sur le chantier » : l'écran du chef de chantier ou du chef d'équipe (idée reprise de SuiviBat).
// Une grande action (le rapport du jour), puis Photos, Dépense, Problème, Message vocal : seulement ce que le
// gestionnaire du chantier autorise. Sans réseau, tout attend sur le téléphone et part tout seul.
(function () {
  "use strict";
  const A = window.AF;
  const { t, ic, esc, api, upload, toast, shrink, exifOf, position, outbox, recorder, canRecord, VOICE_MAX, durText, rel, time, dShort, plural, prefs, LOGO, money, curLabel, PROBLEM, WEATHER, store } = A;
  const $ = (s, el) => (el || document).querySelector(s);
  const app = $("#app");
  let me = null, data = null, siteId = null, pending = 0;

  const site = () => data.sites.find((s) => s.id === siteId) || data.sites[0];
  const ROLE = { chef_chantier: "Chef de chantier", chef_equipe: "Chef d'équipe", perso: "Droits personnalisés" };
  const first = () => me.contact_name.split(" ")[0];

  function shell(body, { back } = {}) {
    app.innerHTML = `<div class="tr">
      <header class="tr-head">${back ? `<button type="button" class="tr-back" data-go="accueil" aria-label="${t("Retour")}">${ic("left", 20)}</button>` : `<a class="logo" href="#accueil">${LOGO(26)} Archfield</a>`}<span class="tr-title">${back ? esc(back) : ""}</span><span class="tr-prefs">${A.themeToggle()}</span></header>
      <main class="tr-main">${body}</main>
    </div>`;
  }

  /* ---------- Accueil ---------- */
  async function home() {
    shell(`<p class="loading">${t("Chargement…")}</p>`);
    try { data = await api("/api/terrain"); } catch (e) { return shell(`<div class="error-box">${esc(e.message)}</div>`); }
    pending = await outbox.count();
    if (!data.sites.length) return shell(`<h1 class="tr-hello">${t("Bonjour, {name}", { name: esc(first()) })}</h1><section class="card empty"><h2>${t("Pas encore de chantier")}</h2><p>${t("Le chantier sur lequel on vous a invité apparaîtra ici. Demandez au responsable de vous envoyer le lien d'invitation.")}</p></section>${accountLinks()}`);
    if (!data.sites.some((s) => s.id === siteId)) siteId = Number(store.get("af-terrain-site")) || data.sites[0].id;
    if (!data.sites.some((s) => s.id === siteId)) siteId = data.sites[0].id;
    const s = site(), p = s.perms;
    const lastSent = data.recent[0];
    const sync = pending
      ? `<div class="tr-sync off">${ic("wifioff", 20)}<div><b>${t("Pas de réseau")}</b><span>${plural(pending, "{n} envoi attend sur ce téléphone. Il partira tout seul dès que le réseau revient.", "{n} envois attendent sur ce téléphone. Ils partiront tout seuls dès que le réseau revient.")}</span></div><button type="button" class="btn ghost" data-retry>${t("Réessayer")}</button></div>`
      : `<div class="tr-sync on">${ic("check", 20)}<div><b>${t("Tout est envoyé")}</b>${lastSent ? `<span>${t("Dernier envoi : {when}", { when: rel(lastSent.created_at).toLowerCase() })}</span>` : ""}</div></div>`;
    const big = p.rapport ? ["rapport", "doc", "Faire le rapport du jour", "Parlez ou écrivez, en 2 minutes"] : p.photos ? ["photos", "cam", "Prendre des photos", "Avec la date et l'heure"] : null;
    const tiles = [["photos", "cam", "Photos", p.photos], ["depense", "money", "Dépense", p.depenses], ["probleme", "warn", "Problème", p.probleme], ["vocal", "mic", "Message vocal", p.vocal]].filter((x) => x[3] && x[0] !== big?.[0]);
    shell(`${sync}
      <h1 class="tr-hello">${t("Bonjour, {name}", { name: esc(first()) })}</h1>
      ${data.sites.length > 1 ? `<div class="picker" role="group" aria-label="${t("Chantier")}">${data.sites.map((x) => `<button type="button" data-pick="${x.id}" aria-pressed="${x.id === s.id}">${esc(x.name)}</button>`).join("")}</div>` : ""}
      <section class="card tr-site">${ic("home", 22)}<div><b>${esc(s.name)}</b><span>${esc([s.location, s.as === "member" ? t(ROLE[s.role] || "Équipe") : t("Responsable")].filter(Boolean).join(" · "))}</span></div></section>
      ${p.rapport ? (s.report_today ? `<p class="tr-state ok">${ic("check", 18)} ${t("Rapport du jour envoyé à {h}", { h: time(s.report_today) })}</p>` : `<p class="tr-state wait">${ic("cal", 18)} ${t("Rapport du jour : pas encore fait")}</p>`) : ""}
      ${big ? `<button type="button" class="tr-big" data-go="${big[0]}">${ic(big[1], 28)}<span><b>${t(big[2])}</b><small>${t(big[3])}</small></span></button>` : ""}
      ${tiles.length ? `<div class="tr-tiles">${tiles.map(([k, i, l]) => `<button type="button" class="tr-tile ${k === "probleme" ? "warn" : ""}" data-go="${k}">${ic(i, 24)}<b>${t(l)}</b></button>`).join("")}</div>` : ""}
      ${s.budget != null ? `<p class="muted tr-budget">${t("Avancement : {p} % · budget : {b}", { p: s.progress, b: money(s.budget, s.currency) })}</p>` : ""}
      <h2 class="section-t">${t("Mes derniers envois")}</h2>
      <ul class="tr-recent">${await recentList()}</ul>
      ${accountLinks()}`);
  }
  const accountLinks = () => `<div class="tr-foot"><a href="#compte">${ic("user", 16)} ${t("Mon compte")}</a><button type="button" class="linkbtn" data-logout>${t("Se déconnecter")}</button></div>`;
  async function recentList() {
    const queued = (await outbox.all()).map((it) => `<li><span>${esc(it.label || t("Envoi"))}<small>${rel(it.at)}</small></span><span class="chip wait">${ic("phone", 13)} ${t("Sur ce téléphone")}</span></li>`);
    const LBL = { rapport: "Rapport du jour", probleme: "Problème signalé", post: "Photos", depense: "Dépense" };
    const sent = data.recent.map((r) => {
      const what = r.topic === "depense" ? `${t("Dépense")} · ${esc(r.text)} · ${money(r.amount, site().currency)}` : r.topic === "post" && !r.photos && r.audios ? t("Message vocal") : r.topic === "post" ? plural(r.photos, "{n} photo", "{n} photos") : t(LBL[r.topic] || "Envoi");
      const chip = r.topic === "depense" ? (r.status === "en_attente" ? `<span class="chip wait">${t("En attente")}</span>` : r.status === "refusee" ? `<span class="chip warn">${t("Refusée")}</span>` : `<span class="chip ok">${t("Approuvée")}</span>`)
        : r.topic === "rapport" && r.checked_at ? `<span class="chip ok">${t("Vérifié")}</span>` : `<span class="chip ok">${t("Envoyé")}</span>`;
      return `<li><span>${what}<small>${rel(r.created_at)}</small></span>${chip}</li>`;
    });
    return [...queued, ...sent].join("") || `<li class="muted">${t("Rien pour l'instant.")}</li>`;
  }

  /* ---------- Envoi commun : direct, ou gardé sur le téléphone sans réseau ---------- */
  async function send({ url, fields, files, label }, okTitle, okText) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const f of files) form.append(f.field, f.blob, f.name);
    const btn = $("#tr-send"), st = $("#tr-state");
    if (btn) btn.disabled = true;
    if (st) { st.hidden = false; st.textContent = t("Envoi…"); }
    try {
      const r = await upload(url, form, (p) => { if (st) st.textContent = t("Envoi… {pct} %", { pct: Math.round(p * 100) }); });
      done(okTitle, okText(r), "ok");
    } catch (e) {
      if (!e.offline) { if (st) st.textContent = e.message; if (btn) btn.disabled = false; return; }
      try { await outbox.add({ url, fields, files, label, siteId }); } catch (x) { if (st) st.textContent = e.message; if (btn) btn.disabled = false; return; }
      done(t("Enregistré sur ce téléphone"), `<p>${t("Pas de réseau pour l'instant. L'envoi partira tout seul dès que le réseau revient, avec la date et l'heure d'aujourd'hui.")}</p>`, "wait");
    }
  }
  function done(title, body, kind) {
    shell(`<section class="card tr-done ${kind}"><span class="ok-ic">${ic(kind === "ok" ? "check" : "phone", 44)}</span><h1>${title}</h1>${body}<button type="button" class="btn primary" data-go="accueil">${t("Retour à l'accueil")}</button></section>`);
  }

  /* ---------- Morceaux de formulaire ---------- */
  // Photos : appareil photo (vérifiée sur place) ou galerie. Date et lieu lus avant d'alléger la photo.
  function photoPicker(list) {
    return {
      html: `<div class="photo-pick"><label class="drop" for="tr-cam"><input id="tr-cam" type="file" accept="image/*" capture="environment">${ic("cam", 22)}<b>${t("Prendre une photo")}</b></label>
        <label class="drop" for="tr-gal"><input id="tr-gal" type="file" accept="image/*" multiple>${ic("photo", 22)}<b>${t("Galerie")}</b></label></div><div class="thumbs" id="tr-thumbs"></div>`,
      bind() {
        const draw = () => { $("#tr-thumbs").innerHTML = list.map((f, i) => `<span class="th"><img alt="${t("Photo {i}", { i: i + 1 })}" src="${URL.createObjectURL(f.file)}"><button type="button" class="icon-btn" data-rm-photo="${i}" aria-label="${t("Retirer la photo")}">${ic("x", 12)}</button></span>`).join(""); };
        const add = async (e) => {
          const picked = Array.from(e.target.files || []).slice(0, 10 - list.length);
          e.target.value = "";
          for (const f of picked) list.push({ meta: await exifOf(f), file: await shrink(f), name: f.name.replace(/\.\w+$/, "") + ".jpg" });
          draw();
        };
        $("#tr-cam").addEventListener("change", add); $("#tr-gal").addEventListener("change", add);
        $("#tr-thumbs").addEventListener("click", (e) => { const b = e.target.closest("[data-rm-photo]"); if (b) { list.splice(Number(b.dataset.rmPhoto), 1); draw(); } });
      }
    };
  }
  // Messages vocaux : 2 minutes au plus chacun, plusieurs possibles. Sans micro dans le navigateur (site en HTTP,
  // vieux téléphone), on propose le dictaphone du téléphone.
  function voicePicker(list, { max = 5 } = {}) {
    let rec = null;
    const draw = () => {
      $("#tr-vlist").innerHTML = list.map((v, i) => `<li class="vocal">${ic("mic", 16)}<audio controls src="${URL.createObjectURL(v.blob)}"></audio><span class="muted">${durText(v.duration)}</span><button type="button" class="icon-btn" data-rm-voice="${i}" aria-label="${t("Supprimer ce message")}">${ic("trash", 15)}</button></li>`).join("");
      $("#tr-rec").hidden = list.length >= max;
    };
    return {
      html: `<ul class="vocals tr-vlist" id="tr-vlist"></ul>
        ${canRecord() ? `<button type="button" class="tr-rec" id="tr-rec">${ic("mic", 20)} <span>${t("Ajouter un message")}</span></button>`
          : `<label class="tr-rec" id="tr-rec" for="tr-vfile"><input id="tr-vfile" type="file" accept="audio/*" capture>${ic("mic", 20)} <span>${t("Enregistrer avec le téléphone")}</span></label>`}
        <p class="hint">${t("2 minutes au plus par message. Vous pouvez en ajouter plusieurs.")}</p>`,
      bind() {
        draw();
        $("#tr-vlist").addEventListener("click", (e) => { const b = e.target.closest("[data-rm-voice]"); if (b) { list.splice(Number(b.dataset.rmVoice), 1); draw(); } });
        const file = $("#tr-vfile");
        if (file) return file.addEventListener("change", (e) => {
          const f = e.target.files?.[0]; e.target.value = "";
          if (!f) return;
          if (f.size > 12 * 1024 * 1024) return toast(t("Message trop long : 2 minutes au plus."));
          const a = new Audio(URL.createObjectURL(f));
          a.addEventListener("loadedmetadata", () => { if (a.duration > VOICE_MAX + 5) return toast(t("Message trop long : 2 minutes au plus.")); list.push({ blob: f, name: f.name, duration: Number.isFinite(a.duration) ? a.duration : 0 }); draw(); });
          a.addEventListener("error", () => { list.push({ blob: f, name: f.name, duration: 0 }); draw(); });
        });
        const btn = $("#tr-rec");
        btn.addEventListener("click", async () => {
          if (rec) { rec.stop(); return; }
          rec = recorder({
            onTick: (sec) => { btn.querySelector("span").textContent = t("Arrêter · {d} / 2:00", { d: durText(sec) }); },
            onDone: (v) => { list.push(v); rec = null; btn.classList.remove("on"); btn.querySelector("span").textContent = t("Ajouter un message"); draw(); },
            onError: (m) => { rec = null; toast(m); }
          });
          if (await rec.start()) { btn.classList.add("on"); btn.querySelector("span").textContent = t("Arrêter · {d} / 2:00", { d: "0:00" }); } else rec = null;
        });
      },
      stop() { if (rec) rec.cancel(); }
    };
  }
  const stepSelect = (s) => s.steps.length ? `<div class="field"><label for="tr-step">${t("Étape")}</label><select id="tr-step"><option value="">${t("Aucune étape")}</option>${s.steps.map((x, i) => `<option value="${x.id}" ${s.running && s.running.id === x.id ? "selected" : ""} ${x.status === "validee" ? "disabled" : ""}>${i + 1}. ${esc(x.name)}</option>`).join("")}</select></div>` : "";
  const filesOf = (photos, voices) => [...photos.map((p) => ({ field: "photos", blob: p.file, name: p.file.name || p.name })), ...voices.map((v) => ({ field: "audios", blob: v.blob, name: v.name }))];
  const posFields = (pos, photos) => ({ meta: JSON.stringify(photos.map((p) => p.meta)), ...(pos ? { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy } : {}) });

  /* ---------- Rapport du jour ---------- */
  function pageReport() {
    const s = site(), photos = [], voices = [], deliveries = [];
    let workers = s.last_workers ?? 0, pos = null;
    const posAsked = position().then((p) => { pos = p; });
    shell(`<form id="tr-form" class="tr-form">
      <h1>${t("Rapport du {date}", { date: A.fmt(Date.now(), { day: "numeric", month: "long" }) })}</h1>
      <p class="muted">${esc(s.name)}</p>
      <section class="card tr-block"><h2><span class="n">1</span>${t("Qu'avez-vous fait aujourd'hui ?")}</h2><div id="tr-voice"></div>
        <div class="field"><label for="tr-text" class="sr-only">${t("Ou écrivez ici (facultatif)")}</label><textarea id="tr-text" maxlength="2000" placeholder="${t("Ou écrivez ici (facultatif)")}"></textarea></div></section>
      <section class="card tr-block"><h2><span class="n">2</span>${t("Ouvriers présents")}</h2>
        <div class="tr-stepper"><button type="button" class="icon-btn" data-workers="-1" aria-label="${t("Un de moins")}">−</button><output id="tr-workers" aria-live="polite">${workers}</output><button type="button" class="icon-btn" data-workers="1" aria-label="${t("Un de plus")}">+</button></div></section>
      <section class="card tr-block"><h2><span class="n">3</span>${t("Livraisons reçues")}</h2>
        <ul class="tr-dels" id="tr-dels"></ul>
        <div class="tr-deladd" id="tr-deladd" hidden><input id="tr-dq" maxlength="60" placeholder="${t("Quantité")}" aria-label="${t("Quantité")}"><input id="tr-dl" maxlength="120" placeholder="${t("Quoi ? Ex. : sacs de ciment")}" aria-label="${t("Quoi ?")}"><button type="button" class="btn" id="tr-dok">${t("Ajouter")}</button></div>
        <button type="button" class="tr-rec ghost" id="tr-delbtn">${ic("truck", 20)} <span>${t("Ajouter une livraison")}</span></button>
        <p class="hint">${t("Facultatif. Exemple : 50 sacs de ciment.")}</p></section>
      <section class="card tr-block"><h2><span class="n">4</span>${t("Météo")}</h2>
        <div class="tr-chips">${Object.entries(WEATHER).map(([k, [i, l]]) => `<label><input type="radio" name="weather" value="${k}">${ic(i, 18)} ${t(l)}</label>`).join("")}</div></section>
      <section class="card tr-block"><h2><span class="n">5</span>${t("Photos")}</h2><div id="tr-photos"></div>${stepSelect(s)}</section>
      <p class="upload-state" id="tr-state" hidden></p>
      <button type="submit" class="tr-big" id="tr-send">${ic("doc", 26)}<span><b>${t("Transmettre le rapport")}</b></span></button>
    </form>`, { back: t("Rapport du jour") });
    const vp = voicePicker(voices), pp = photoPicker(photos);
    $("#tr-voice").innerHTML = vp.html; vp.bind();
    $("#tr-photos").innerHTML = pp.html; pp.bind();
    const drawDels = () => { $("#tr-dels").innerHTML = deliveries.map((d, i) => `<li>${ic("truck", 16)} <span>${esc([d.quantity, d.label].filter(Boolean).join(" "))}</span><button type="button" class="icon-btn" data-rm-del="${i}" aria-label="${t("Retirer")}">${ic("x", 12)}</button></li>`).join(""); };
    $("#tr-delbtn").addEventListener("click", () => { $("#tr-deladd").hidden = false; $("#tr-dq").focus(); });
    $("#tr-dok").addEventListener("click", () => { const l = $("#tr-dl").value.trim(); if (!l) return $("#tr-dl").focus(); deliveries.push({ quantity: $("#tr-dq").value.trim(), label: l }); $("#tr-dq").value = ""; $("#tr-dl").value = ""; $("#tr-deladd").hidden = true; drawDels(); });
    $("#tr-dels").addEventListener("click", (e) => { const b = e.target.closest("[data-rm-del]"); if (b) { deliveries.splice(Number(b.dataset.rmDel), 1); drawDels(); } });
    app.querySelectorAll("[data-workers]").forEach((b) => b.addEventListener("click", () => { workers = Math.max(0, workers + Number(b.dataset.workers)); $("#tr-workers").textContent = workers; }));
    $("#tr-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      vp.stop();
      const text = $("#tr-text").value.trim();
      if (!text && !voices.length) { toast(t("Dites ou écrivez ce qui a été fait aujourd'hui.")); return; }
      await posAsked;
      send({
        url: `/api/sites/${s.id}/updates`, label: t("Rapport du jour"),
        fields: { topic: "rapport", text, workers: String(workers), weather: new FormData(e.target).get("weather") || "", deliveries: JSON.stringify(deliveries), durations: JSON.stringify(voices.map((v) => Math.round(v.duration))), step_id: $("#tr-step")?.value || "", ...posFields(pos, photos) },
        files: filesOf(photos, voices)
      }, t("Rapport transmis"), () => `<p>${t("{boss} le voit tout de suite.", { boss: esc(s.boss || t("Le responsable")) })}</p>`);
    });
  }

  /* ---------- Photos, problème, message vocal ---------- */
  function pageSimple(kind) {
    const s = site(), photos = [], voices = [];
    let pos = null, cat = "panne";
    const posAsked = position().then((p) => { pos = p; });
    const title = { photos: "Prendre des photos", probleme: "Signaler un problème", vocal: "Message vocal" }[kind];
    shell(`<form id="tr-form" class="tr-form">
      <h1>${t(title)}</h1><p class="muted">${esc(s.name)}</p>
      ${kind === "probleme" ? `<section class="card tr-block"><h2>${t("Quel problème ?")}</h2><div class="tr-chips">${Object.entries(PROBLEM).map(([k, l]) => `<label><input type="radio" name="category" value="${k}" ${k === cat ? "checked" : ""}>${t(l)}</label>`).join("")}</div></section>` : ""}
      ${kind !== "vocal" ? `<section class="card tr-block"><h2>${t("Photos")}</h2><div id="tr-photos"></div></section>` : ""}
      ${kind !== "photos" ? `<section class="card tr-block"><h2>${kind === "vocal" ? t("Votre message") : t("Expliquez en parlant")}</h2><div id="tr-voice"></div></section>` : ""}
      <section class="card tr-block"><div class="field"><label for="tr-text">${kind === "probleme" ? t("Ce qui se passe") : t("Une phrase (facultatif)")}</label><textarea id="tr-text" maxlength="2000" placeholder="${kind === "probleme" ? t("Ex. : la bétonnière est en panne, on attend la pièce.") : t("Ex. : murs de la chambre montés.")}"></textarea></div>
        ${kind === "photos" ? stepSelect(s) : ""}</section>
      ${kind !== "photos" ? `<p class="hint tr-note">${ic("lock", 14)} ${t("Visible par le responsable du chantier. Il décide de le montrer au client.")}</p>` : ""}
      <p class="upload-state" id="tr-state" hidden></p>
      <button type="submit" class="tr-big ${kind === "probleme" ? "warn" : ""}" id="tr-send">${ic(kind === "probleme" ? "warn" : kind === "vocal" ? "mic" : "cam", 26)}<span><b>${t(kind === "probleme" ? "Signaler le problème" : "Envoyer")}</b></span></button>
    </form>`, { back: t(title) });
    const vp = kind !== "photos" ? voicePicker(voices, { max: kind === "vocal" ? 1 : 3 }) : null, pp = kind !== "vocal" ? photoPicker(photos) : null;
    if (vp) { $("#tr-voice").innerHTML = vp.html; vp.bind(); }
    if (pp) { $("#tr-photos").innerHTML = pp.html; pp.bind(); }
    $("#tr-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      vp?.stop();
      const text = $("#tr-text").value.trim();
      if (!text && !photos.length && !voices.length) { toast(kind === "photos" ? t("Ajoutez au moins une photo.") : t("Ajoutez un message vocal ou une phrase.")); return; }
      await posAsked;
      const fields = { topic: kind === "probleme" ? "probleme" : "post", text, durations: JSON.stringify(voices.map((v) => Math.round(v.duration))), step_id: $("#tr-step")?.value || "", ...posFields(pos, photos) };
      if (kind === "probleme") fields.category = new FormData(e.target).get("category") || "autre";
      send({ url: `/api/sites/${s.id}/updates`, fields, files: filesOf(photos, voices), label: t(kind === "probleme" ? "Problème signalé" : kind === "vocal" ? "Message vocal" : "Photos") },
        t(kind === "probleme" ? "Problème signalé" : "Envoyé"),
        (r) => `<p>${r.visibility === "team" ? t("{boss} est prévenu. Il décide de le montrer au client.", { boss: esc(s.boss || t("Le responsable")) }) : r.verify === "verified" ? t("Photos vérifiées : prises sur le chantier, aujourd'hui.") : t("Le client le voit sur son suivi.")}</p>`);
    });
  }

  /* ---------- Dépense ---------- */
  function pageExpense() {
    const s = site(), receipt = [];
    shell(`<form id="tr-form" class="tr-form">
      <h1>${t("Déclarer une dépense")}</h1><p class="muted">${esc(s.name)}</p>
      <section class="card tr-block">
        <div class="field"><label for="tr-label">${t("Quoi ?")}</label><input id="tr-label" required maxlength="160" placeholder="${t("Ex. : 50 sacs de ciment")}"></div>
        <div class="row2"><div class="field"><label for="tr-amount">${t("Montant ({cur})", { cur: curLabel(s.currency) })}</label><input id="tr-amount" type="number" min="1" required inputmode="numeric"></div>
        <div class="field"><label for="tr-cat">${t("Catégorie")}</label><select id="tr-cat"><option value="materiaux">${t("Matériaux")}</option><option value="main_oeuvre">${t("Main-d'œuvre")}</option><option value="transport">${t("Transport")}</option><option value="autre">${t("Autre")}</option></select></div></div>
      </section>
      <section class="card tr-block"><h2>${t("Photo du reçu")}</h2><div id="tr-photos"></div><p class="hint">${t("Avec la photo du reçu, la dépense est justifiée.")}</p></section>
      ${s.as === "member" ? `<p class="hint tr-note">${ic("lock", 14)} ${t("La dépense reste « En attente » jusqu'à l'approbation de {boss}.", { boss: esc(s.boss || t("Le responsable")) })}</p>` : ""}
      <p class="upload-state" id="tr-state" hidden></p>
      <button type="submit" class="tr-big" id="tr-send">${ic("money", 26)}<span><b>${t("Déclarer la dépense")}</b></span></button>
    </form>`, { back: t("Dépense") });
    const pp = photoPicker(receipt);
    $("#tr-photos").innerHTML = pp.html; pp.bind();
    $("#tr-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const amount = Number($("#tr-amount").value);
      send({
        url: `/api/sites/${s.id}/ledger`, label: `${t("Dépense")} · ${$("#tr-label").value.trim()}`,
        fields: { kind: "depense", label: $("#tr-label").value.trim(), amount: String(amount), category: $("#tr-cat").value, entry_date: new Date().toISOString().slice(0, 10) },
        files: receipt.slice(0, 1).map((p) => ({ field: "receipt", blob: p.file, name: "recu.jpg" }))
      }, t("Dépense déclarée"), (r) => `<p>${r.status === "en_attente" ? t("Elle est en attente d'approbation par {boss}.", { boss: esc(s.boss || t("Le responsable")) }) : t("Elle compte dans les dépenses du chantier.")}</p>`);
    });
  }

  /* ---------- Compte ---------- */
  function pageAccount() {
    shell(`<section class="card card-p form"><h1>${esc(me.contact_name)}</h1>
        <p class="muted">${esc([me.phone_pretty, me.email].filter(Boolean).join(" · "))}</p>
        <div>${prefs()}</div></section>
      <form class="card card-p form" id="tr-pw"><h2>${me.has_password ? t("Mot de passe") : t("Ajouter un mot de passe")}</h2>
        ${me.has_password ? `<div class="field"><label for="pw-current">${t("Mot de passe actuel")}</label><input id="pw-current" name="current" type="password" required autocomplete="current-password"></div>` : ""}
        <div class="field"><label for="pw-new">${t("Nouveau mot de passe")}</label><input id="pw-new" name="password" type="password" required minlength="8" autocomplete="new-password"></div>
        <div><button class="btn" type="submit">${t("Enregistrer le mot de passe")}</button></div></form>
      ${A.installCard()}
      <div class="tr-foot"><button type="button" class="btn ghost" data-logout>${t("Se déconnecter")}</button></div>`, { back: t("Mon compte") });
    $("#tr-pw").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api("/api/me/password", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); me = await api("/api/me"); toast(t("Mot de passe enregistré. Vos autres appareils sont déconnectés.")); } catch (x) { toast(x.message); }
    });
  }

  /* ---------- Routage ---------- */
  async function route() {
    const h = location.hash.slice(1) || "accueil";
    const s = data && site();
    const can = (p) => s && s.perms[p];
    if (h !== "accueil" && h !== "compte" && !data) return home();
    if (h === "rapport" && can("rapport")) return pageReport();
    if (h === "photos" && can("photos")) return pageSimple("photos");
    if (h === "probleme" && can("probleme")) return pageSimple("probleme");
    if (h === "vocal" && can("vocal")) return pageSimple("vocal");
    if (h === "depense" && can("depenses")) return pageExpense();
    if (h === "compte") return pageAccount();
    if (h !== "accueil") history.replaceState(null, "", "#accueil");
    return home();
  }
  async function flush(manual) {
    const r = await outbox.flush();
    if (r.sent) toast(plural(r.sent, "{n} envoi en attente est parti.", "{n} envois en attente sont partis."));
    r.refused.forEach((m) => toast(t("Un envoi en attente a été refusé : {msg}", { msg: m })));
    if (!r.sent && manual && r.left) toast(t("Toujours pas de réseau. Nouvel essai automatique dès qu'il revient."));
    if ((r.sent || r.refused.length) && (location.hash || "#accueil") === "#accueil") home();
  }

  function start(account) {
    me = account;
    document.body.classList.add("tr-body");
    window.addEventListener("hashchange", () => route().then(() => window.scrollTo(0, 0)));
    window.addEventListener("online", () => flush());
    document.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const d = b.dataset;
      if (d.go) { if (location.hash === "#" + d.go) route(); else location.hash = d.go; }
      else if (d.pick) { siteId = Number(d.pick); store.set("af-terrain-site", String(siteId)); home(); }
      else if (d.retry !== undefined) flush(true);
      else if (d.logout !== undefined) { await api("/api/logout", { method: "POST" }); location.href = "/connexion"; }
    });
    route();
    if (navigator.onLine) flush();
  }
  window.AFTerrain = { start };
})();
