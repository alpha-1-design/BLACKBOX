// VERSION is the update fuse: every release changes this file's bytes, the
// WebView detects the new service worker, and activate() purges every cache
// that isn't this version's. Previously the cache name was a fixed string, so
// a byte-identical worker survived APK updates and kept serving the old app
// shell forever — the 2.0.3 → 2.0.4 update froze users on stale v2.0 assets
// and even mixed old/new JS files into one broken app.
const VERSION = 'v2.0.5';
const CACHE = 'blackbox-' + VERSION;
const SHELL = ['./', './index.html', './styles.css', './app.js', './vault.js',
  './overlay.js', './shake.js', './clipboard.js', './secrets.js', './files.js', './journal.js',
  './auth.js', './privacy.js', './updater.js', './maintenance.js',
  './appearance.js', './cool.js', './voice.js',
  './service-worker.js', './manifest.json', './assets/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isNav = e.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/' || url.pathname.endsWith('/');

  if (isNav) {
    // Network-first for the document: a new APK's files land immediately and
    // the cache is only the offline fallback.
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for the versioned app shell (JS/CSS/images) — the VERSION
  // fuse above guarantees a stale cache never outlives a release.
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }))
  );
});
