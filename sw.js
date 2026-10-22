// Cache-first service worker. All paths are relative (app is served from a subpath).
// IMPORTANT: bump CACHE on every deploy, otherwise clients keep serving stale files.
const CACHE = 'fuel-check-v1';
const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'app.mjs',
  'calc.mjs',
  'ui-model.mjs',
  'storage.mjs',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});
