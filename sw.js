// Build: Jun 28 2026 09:35 UTC
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))}});