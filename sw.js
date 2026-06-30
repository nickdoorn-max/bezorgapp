/* Bezorg-app service worker.
   App-bestanden: NETWORK-FIRST → online krijg je altijd de nieuwste versie; de cache is enkel offline-vangnet.
   Libraries/overige bestanden: cache-first. Bump CACHE bij een nieuwe uitrol. */
const CACHE = 'bezorg-v35';

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

const LIBS = [
  'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    await Promise.allSettled(LIBS.map((u) => c.add(u)));
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

  // Navigaties naar buiten (bijv. Google Maps, mailto) niet onderscheppen.
  if (req.mode === 'navigate' && !sameOrigin) return;

  // Eigen app-bestanden (navigatie + html/js/css/manifest): network-first, HTTP-cache omzeilen.
  const isShell = sameOrigin && (
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    /\.(?:html|js|css|webmanifest)$/.test(url.pathname)
  );
  if (isShell) {
    e.respondWith((async () => {
      try {
        const target = (req.mode === 'navigate') ? './index.html' : req;
        const res = await fetch(target, { cache: 'no-store' });
        caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
        return res;
      } catch (err) {
        const cached = await caches.match(req) || (req.mode === 'navigate' ? await caches.match('./index.html') : null);
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  // Libraries en overige bestanden: cache-first.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (sameOrigin || isLib) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
      return res;
    } catch (err) {
      throw err;
    }
  })());
});
