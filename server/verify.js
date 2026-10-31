// Vérification d'une publication : les photos ont-elles été prises récemment, et sur le chantier ?
// Date de prise de vue et position GPS des photos (lues dans le téléphone avant l'envoi), position du téléphone
// au moment de publier, et position de référence du chantier (enregistrée à la première publication géolocalisée).
// Ce n'est pas infalsifiable, mais une vieille photo ou une photo prise ailleurs saute aux yeux du client.

const FRESH_H = 72;          // une photo prise dans les 3 derniers jours compte comme récente (envoi différé sans réseau)
const NEAR_M = 500;          // tolérance autour du chantier, à laquelle s'ajoute la précision annoncée par le téléphone
const MAX_ACCURACY_M = 1500; // au-delà, la position ne veut plus dire grand-chose

function distanceM(a, b) {
  const R = 6371e3, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const validPoint = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

// pos : { lat, lng, accuracy } du téléphone (ou null) ; photos : [{ shot_at, lat, lng }] ; site : { lat, lng }.
// Renvoie { status: "verified" | "partial" | "warning", note: {...}, setOrigin: bool }.
function verify({ site, pos, photos, now = Date.now() }) {
  const note = {};
  let posState = "unknown", setOrigin = false;
  if (pos && validPoint(pos.lat, pos.lng)) {
    const acc = Math.min(Math.max(0, Number(pos.accuracy) || 0), MAX_ACCURACY_M);
    note.accuracy = Math.round(acc);
    if (!validPoint(site.lat, site.lng)) { posState = "origin"; setOrigin = true; }
    else {
      note.distance = distanceM(site, pos);
      posState = note.distance <= NEAR_M + acc ? "near" : "far";
    }
  }
  // Photos : date de prise de vue et, si le téléphone l'a notée, position.
  let photoState = photos.length ? "fresh" : "none";
  for (const p of photos) {
    const t = p.shot_at ? Date.parse(p.shot_at) : NaN;
    if (Number.isNaN(t)) { if (photoState === "fresh") photoState = "unknown"; continue; }
    if (t < now - FRESH_H * 36e5 || t > now + 10 * 60e3) { photoState = "old"; note.old_shot_at = new Date(t).toISOString(); }
    const ref = validPoint(site.lat, site.lng) ? site : posState === "origin" ? pos : null;
    if (ref && validPoint(p.lat, p.lng)) {
      const d = distanceM(ref, p);
      if (d > NEAR_M + MAX_ACCURACY_M) { photoState = "far"; note.photo_distance = d; }
    }
  }
  note.position = posState; note.photos = photoState;
  const posOk = posState === "near" || posState === "origin";
  const status = photoState === "old" || photoState === "far" || posState === "far" ? "warning"
    : posOk && (photoState === "fresh" || photoState === "none") ? "verified" : "partial";
  return { status, note, setOrigin };
}

// Métadonnées envoyées par le téléphone pour chaque photo, nettoyées.
function cleanMeta(raw, count) {
  let list = [];
  try { list = JSON.parse(raw || "[]"); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  return Array.from({ length: count }, (_, i) => {
    const m = list[i] || {};
    const t = typeof m.shot_at === "string" && !Number.isNaN(Date.parse(m.shot_at)) ? new Date(m.shot_at).toISOString() : null;
    const lat = Number(m.lat), lng = Number(m.lng);
    return { shot_at: t, lat: validPoint(lat, lng) ? lat : null, lng: validPoint(lat, lng) ? lng : null };
  });
}

module.exports = { verify, cleanMeta, distanceM, validPoint, FRESH_H };
