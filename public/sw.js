// Service worker d'Archfield : l'application s'ouvre même sans réseau (écrans déjà vus), et se met à jour seule.
// La version change à chaque modification du site (le serveur la calcule), ce qui vide l'ancien cache.
const VERSION = "__VERSION__";
const CACHE = "archfield-" + VERSION;
const SHELL = ["/app", "/hors-connexion", "/css/app.css", "/js/theme.js", "/js/i18n-en.js", "/js/ui.js", "/js/space.js", "/js/app.js", "/favicon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("archfield-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Jamais en cache : données (API), photos privées, connexion Google.
const PRIVATE = /^\/(api|media|auth)\/|^\/c\/[^/]+\/media\//;
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (FONTS.test(req.url)) return e.respondWith(cacheFirst(req));
  if (url.origin !== location.origin || PRIVATE.test(url.pathname)) return;
  if (req.mode === "navigate") return e.respondWith(page(req, url));
  e.respondWith(cacheFirst(req));
});

// Pages : le réseau d'abord (contenu à jour), sinon la copie gardée, sinon l'écran « hors connexion ».
async function page(req, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(url.pathname, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(url.pathname)) || (url.pathname === "/app" ? cache.match("/app") : null) || cache.match("/hors-connexion");
  }
}
// Styles, scripts, images et polices : la copie gardée d'abord (rapide sur un réseau lent).
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}
