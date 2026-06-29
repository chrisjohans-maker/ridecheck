// Build: Jun 29 2026 12:55 UTC
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))}});