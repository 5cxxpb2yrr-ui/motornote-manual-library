const CACHE = "lifeos-manual-explorer-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("lifeos-manual-explorer-") && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const cacheable = url.pathname === "/" || url.pathname.startsWith("/api/manual-page") || url.pathname.startsWith("/api/catalog") || url.pathname.startsWith("/api/search-index");
  if (!cacheable) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request);
    try {
      const fresh = await fetch(request);
      if (fresh.ok && (url.pathname.startsWith("/api/manual-page") || url.pathname === "/api/catalog" || url.pathname.startsWith("/api/search-index"))) await cache.put(request, fresh.clone());
      return fresh;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }));
});