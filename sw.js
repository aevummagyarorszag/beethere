// Minimal fetch handler so Chromium can offer the native PWA install prompt.
// Requests continue to the network; offline caching will be added separately.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request));
});
