/* Bezorg-app service worker — maakt de index installeerbaar en offline-bruikbaar.
   Bump CACHE als je een nieuwe versie uitrolt, dan vervangt de SW de oude cache. */
const CACHE = 'bezorg-v17';

/* App-schil: moet aanwezig zijn voor offline gebruik (relatieve paden i.v.m. submap op GitHub Pages). */
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

/* Externe libraries: best-effort precachen; anders worden ze bij eerste gebruik gecachet. */
const LIBS = [
  'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);                                   // verplicht
    await Promise.allSettled(LIBS.map((u) => c.add(u)));    // best-effort
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isLib = /(?:jsdelivr|unpkg|cdnjs)/.test(url.host);

  // Navigaties naar buiten (bijv. Google Maps) niet onderscheppen.
  if (req.mode === 'navigate' && !sameOrigin) return;

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (sameOrigin || isLib) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      // Offline: voor een paginanavigatie de gecachete index teruggeven.
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
