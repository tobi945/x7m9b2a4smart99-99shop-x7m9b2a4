const CACHE_NAME = 'smart-shop-v5';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

// ── Install: pre-cache app shell ─────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  // Don't skipWaiting — let the OTA mechanism in app.js control activation
});

// ── Activate: clean old caches, claim clients ────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // CDN resources (QR libs) — Cache-First (versioned URLs, won't change)
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // Same-origin — Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const fetched = fetch(event.request)
          .then(res => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => cached);   // network fail → fall back to cache

        return cached || fetched;  // serve stale immediately; update in bg
      })
    )
  );
});

// ── OTA: listen for skipWaiting message from app ─────────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
