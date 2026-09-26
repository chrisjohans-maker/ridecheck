// Precaches the app shell (index.html + built JS bundle) on install so a
// dropped connection doesn't just break the app. Still network-first when
// online for both navigation and assets, so every deploy is picked up
// immediately — this cache is purely an offline fallback, not the update
// mechanism (checkForUpdate/version.json in main.js handles that).
const CACHE = 'ridecheck-shell-v1';

async function cacheShell() {
  const cache = await caches.open(CACHE);
  const htmlRes = await fetch('/', { cache: 'no-store' });
  const html = await htmlRes.text();
  await cache.put('/', new Response(html, { headers: { 'Content-Type': 'text/html' } }));
  const scriptSrcs = [...html.matchAll(/<script[^>]+src="(\/assets\/[^"]+)"/g)].map(m => m[1]);
  await Promise.all(scriptSrcs.map(async src => {
    try {
      const res = await fetch(src, { cache: 'no-store' });
      if (res.ok) await cache.put(src, res);
    } catch (e) { /* offline during install — the fetch handler below fills it in later */ }
  }));
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(cacheShell().catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(req).then(r => r || caches.match('/'))));
    return;
  }
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
