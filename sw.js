// Always use fresh app content online; provide an honest offline fallback.
const CACHE_NAME = 'atmo-offline-v1';
const OFFLINE_URL = new URL('./offline.html', self.location.href).href;
const FALLBACK_FILES = ['./offline.html', './offline.css', './assets/icons/atmo-192.png', './assets/icons/atmo-32.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FALLBACK_FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('atmo-offline-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).catch(async error => {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return (await caches.open(CACHE_NAME)).match(OFFLINE_URL);
    throw error;
  }));
});
