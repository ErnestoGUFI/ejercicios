const CACHE_VERSION = "tech-catalogo-shell-v3";
const CACHE_PREFIX = "tech-catalogo-shell-v";
const APP_SHELL = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./styles/tokens.css",
  "./styles/shell.css",
  "./styles/components.css",
  "./styles/views.css",
  "./src/main.js",
];

console.info("[SW] Ejecutado");
console.info("[SW] Contexto global:", self.constructor.name);
console.info("[SW] typeof window:", typeof window);
console.info("[SW] typeof document:", typeof document);
console.info("[SW] typeof localStorage:", typeof localStorage);
console.info("[SW] Scope:", self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) =>
            cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_VERSION,
          )
          .map((cacheName) => caches.delete(cacheName)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Los métodos distintos de GET pueden modificar datos y no deben guardarse.
  if (request.method !== "GET") return;

  // Las peticiones externas quedan fuera de la estrategia de esta aplicación.
  if (new URL(request.url).origin !== self.location.origin) return;

  const cacheWrites = [];
  const responsePromise = respondWithCache(event, request, cacheWrites);
  event.respondWith(responsePromise);
  event.waitUntil(responsePromise.then(() => Promise.all(cacheWrites)));
});

async function respondWithCache(event, request, cacheWrites) {
  const cache = await caches.open(CACHE_VERSION);
  const isNavigation = request.mode === "navigate";
  const cacheKey = isNavigation
    ? new URL("./index.html", self.registration.scope).href
    : request;
  const cachedResponse = await cache.match(cacheKey);

  console.info(`[SW] ${cachedResponse ? "HIT" : "MISS"}`, request.url);
  if (cachedResponse) return cachedResponse;

  const networkRequest = isNavigation ? cacheKey : request;
  const response = await fetch(networkRequest);

  if (response.ok) {
    cacheWrites.push(cache.put(cacheKey, response.clone()));
  }

  return response;
}
