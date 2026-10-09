// VERSION is the update fuse: every release changes this file's bytes, the
// WebView detects the new service worker, and activate() purges every cache
// that isn't this version's. Previously the cache name was a fixed string, so
// a byte-identical worker survived APK updates and kept serving the old app
// shell forever — the 2.0.3 → 2.0.4 update froze users on stale v2.0 assets
// and even mixed old/new JS files into one broken app.
const VERSION = 'v2.0.13';
const CACHE = 'blackbox-' + VERSION;
// Third-party runtime assets are release-independent: the transformers.js
// speech library lives here, and transformers.js caches the ~40 MB Whisper
// weights itself in 'transformers-cache' (src/utils/hub.js). Both used to be
// swept away by the blanket purge below, so every app update forced users to
// re-download the model AND made the first transcription after an update
// need a connection. KEEP spares exactly those caches; everything else stale
// still goes.
const CDN_CACHE = 'blackbox-cdn';
const KEEP = new Set([CACHE, CDN_CACHE, 'transformers-cache']);
const SHELL = ['./', './index.html', './styles.css', './app.js', './vault.js',
  './overlay.js', './shake.js', './clipboard.js', './secrets.js', './files.js', './journal.js',
  './auth.js', './privacy.js', './updater.js', './maintenance.js',
  './appearance.js', './cool.js', './voice.js',
  './generator.js', './health.js',
  './service-worker.js', './manifest.json', './assets/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.has(k)).map(k => caches.delete(k)))));
  self.clients.claim();
});

/* ── Cancel plumbing for the voice modal ──
   transformers.js v2 has no AbortSignal for pipeline()/model downloads
   (huggingface/transformers.js#1182), so the page messages us when the user
   taps Cancel: any in-flight external transfer is failed on the spot, and
   the response body is torn down when it lands so the download stops at the
   transport level instead of running invisibly in the background. */
let cancelFlag = false;
const cancelWaiters = [];
self.addEventListener('message', e => {
  if (e.data === 'bb-cancel-external') {
    cancelFlag = true;
    while (cancelWaiters.length) cancelWaiters.shift()();
  } else if (e.data === 'bb-reset-external') {
    cancelFlag = false;
  }
});

function externalFetch(req) {
  if (cancelFlag) return Promise.reject(new DOMException('Cancelled.', 'AbortError'));
  const p = fetch(req);
  // If cancellation wins the race, the response that eventually arrives is
  // never handed to the page — cancel its body so the transfer stops.
  p.then(res => { if (cancelFlag && res.body && res.body.cancel) res.body.cancel().catch(() => {}); }, () => {});
  return new Promise((resolve, reject) => {
    const onCancel = () => reject(new DOMException('Cancelled.', 'AbortError'));
    const cleanup = () => { const i = cancelWaiters.indexOf(onCancel); if (i >= 0) cancelWaiters.splice(i, 1); };
    cancelWaiters.push(onCancel);
    p.then(res => { cleanup(); resolve(res); }, err => { cleanup(); reject(err); });
  });
}

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

  if (url.origin !== self.location.origin) {
    if (url.hostname === 'cdn.jsdelivr.net') {
      // Speech library bundle (and its ONNX wasm assets): cache-first in the
      // release-independent cache, so the first transcription after an app
      // update still works offline. The URL is version-pinned, so the cached
      // bytes can never go stale.
      e.respondWith(
        caches.open(CDN_CACHE).then(c =>
          c.match(e.request).then(cached => cached || externalFetch(e.request).then(res => {
            if (res.ok) { const copy = res.clone(); c.put(e.request, copy).catch(() => {}); }
            return res;
          }))
        )
      );
      return;
    }
    // Model weights (Hugging Face + its CDN) and any other cross-origin
    // request: cancellable passthrough, deliberately NOT stored here —
    // transformers.js keeps model files in its own 'transformers-cache',
    // and duplicating ~40 MB into the versioned shell cache (purged every
    // release) only guaranteed a pointless re-download.
    e.respondWith(externalFetch(e.request));
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
