const CACHE = "ps-v2";
const ASSETS = [
  "./",
  "index.html",
  "nets.html",
  "ps.css",
  "solids.js",
  "js/ps.js",
  "favicon.png",
  "icon-192.png",
  "icon-512.png",
  "manifest.json",
];

self.addEventListener("install", (e) => {
  // "reload" bypasses the HTTP cache, so an update never caches stale files
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))),
      ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// Network first for the app's own files, so a new release shows up on the
// next visit; the cache is only the offline fallback. Fonts never change, so
// they are served from the cache when present.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const own = url.origin === location.origin;
  const font =
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com";
  if (!own && !font) return;

  const fetchAndKeep = () =>
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    });
  const offline = () =>
    caches
      .match(e.request)
      .then(
        (cached) =>
          cached ||
          (e.request.mode === "navigate"
            ? caches.match("index.html")
            : undefined),
      )
      .then((res) => res || Response.error());

  e.respondWith(
    font
      ? caches.match(e.request).then((cached) => cached || fetchAndKeep())
      : fetchAndKeep().catch(offline),
  );
});
