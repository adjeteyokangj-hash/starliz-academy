const CACHE_NAME = "starliz-v3";
const APP_SHELL = [
  "/",
  "/onboarding",
  "/dashboard",
  "/parent",
  "/pet",
  "/rewards",
  "/games/spelling",
  "/games/math",
  "/games/reading",
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/screenshots/dashboard-desktop.png",
  "/screenshots/dashboard-mobile.png",
];

function isBypassedPath(pathname) {
  return pathname.startsWith("/admin") || pathname.startsWith("/api") || pathname.startsWith("/_next/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isBypassedPath(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .catch(async () => (await caches.match("/offline")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    }))
  );
});
