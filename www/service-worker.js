const CACHE = 'blackbox-v2';
const SHELL = ['./', './index.html', './styles.css', './app.js', './vault.js',
  './overlay.js', './shake.js', './clipboard.js',
  './service-worker.js', './manifest.json', './assets/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(cached => {
    if (cached) return cached;
    return fetch(e.request).catch(() => caches.match('./index.html'));
  }));
});
