/* Service worker écrit à la main (pas de plugin : Next 16 + Turbopack).
 * Généré par scripts/build-sw.mjs : ne pas modifier public/sw.js directement.
 *
 * Règles :
 *  - pages (coquilles statiques, sans données) : réseau d'abord, copie en cache pour le hors ligne ;
 *  - /_next/static (fichiers versionnés) : cache d'abord ;
 *  - fond de carte OpenFreeMap : tuiles en cache d'abord (clé sans version, voir mapKey) ;
 *  - Supabase, /api, /auth : jamais mis en cache (les données passent par IndexedDB).
 */
const VERSION = "__VERSION__";
const ROUTES = __ROUTES__;
const SHELL = `jt-shell-${VERSION}`;
const STATIC = "jt-static";
const MAP = "jt-map";
const PRECACHE_HEADER = { "x-jt-precache": "1" };

// Fichiers versionnés de Next, référencés dans le HTML, les CSS (polices) et les JS (morceaux
// chargés à la demande : carte, codes). Extension obligatoire : le HTML diffusé en flux coupe
// parfois une adresse en deux.
const STATIC_RE = /(?:\/_next\/)?static\/(?:immutable\/)?(?:chunks|media|css)\/[\w\-./]+?\.(?:js|css|woff2?|png|svg|wasm)(?=["'\s)\\]|$)/g;
const staticUrl = (m) => (m.startsWith("/_next/") ? m : `/_next/${m}`);

async function precache() {
  const shell = await caches.open(SHELL);
  const stat = await caches.open(STATIC);
  const assets = new Set();
  const found = (text) => {
    for (const m of text.matchAll(STATIC_RE)) assets.add(staticUrl(m[0]));
  };
  for (const route of ROUTES) {
    const res = await fetch(route, { headers: PRECACHE_HEADER, cache: "no-store" });
    if (!res.ok || res.redirected) throw new Error(`Précache impossible : ${route} (${res.status})`);
    found(await res.clone().text());
    await shell.put(route, res);
  }
  for (const url of ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/maplibre/maplibre-gl-worker.mjs", "/zxing/zxing_reader.wasm"]) {
    if (await shell.match(url)) continue;
    const res = await fetch(url);
    if (res.ok) await shell.put(url, res);
  }
  // Parcours en largeur : chaque JS/CSS mis en cache est lu pour y trouver d'autres fichiers.
  const seen = new Set();
  const worker = async () => {
    for (;;) {
      const url = [...assets].find((u) => !seen.has(u));
      if (!url) return;
      seen.add(url);
      let res = await stat.match(url);
      if (!res) {
        const fresh = await fetch(url);
        if (!fresh.ok) continue;
        await stat.put(url, fresh.clone());
        res = fresh;
      }
      if (/\.(js|css)$/.test(url)) found(await res.text());
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().catch((e) => {
    console.error("[sw] précache impossible", e);
    throw e;
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("jt-shell-") && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  if (event.data === "VERSION") event.source?.postMessage({ type: "VERSION", version: VERSION });
});

/** Les tuiles changent d'URL à chaque mise à jour hebdomadaire d'OpenFreeMap : la clé ignore la version. */
function mapKey(url) {
  return url.href.replace(/\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/, "/planet/$1");
}

async function cacheFirst(cacheName, request, key = request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(key, res.clone());
  return res;
}

async function networkFirst(cacheName, request, key = request) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

async function page(request) {
  const url = new URL(request.url);
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.open(SHELL);
    const path = url.pathname.replace(/\/$/, "") || "/accueil";
    return (await shell.match(path)) ?? (await shell.match("/accueil")) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === "https://tiles.openfreemap.org") {
    if (url.pathname.endsWith(".pbf") || url.pathname.endsWith(".png")) {
      event.respondWith(cacheFirst(MAP, request, mapKey(url)));
    } else {
      event.respondWith(networkFirst(MAP, request));
    }
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(STATIC, request));
    return;
  }
  // Requêtes RSC (navigation côté client) : réseau seul. En cas d'échec, Next recharge la
  // page entière, servie alors depuis le cache des coquilles.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;
  if (request.mode === "navigate") {
    event.respondWith(page(request));
    return;
  }
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/maplibre/") || url.pathname.startsWith("/zxing/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(networkFirst(SHELL, request));
  }
});
