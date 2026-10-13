const CACHE_VERSION = "tech-catalogo-shell-v6";
const CACHE_PREFIX = "tech-catalogo-shell-v";
const HACKER_NEWS_ORIGIN = "https://hacker-news.firebaseio.com";
const NETWORK_FIRST_URL = new URL("./cache-demo.json", self.registration.scope).href;
const STALE_WHILE_REVALIDATE_URL = new URL("./cache-swr-demo.json", self.registration.scope).href;
const APP_SHELL = [
  "./",
  "./index.html",
  "./scope-demo/index.html",
  "./manifest.json",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/splash-1170x2532.png",
  "./screenshots/inicio-ancho.webp",
  "./screenshots/inicio-movil.webp",
  "./styles/tokens.css",
  "./styles/shell.css",
  "./styles/components.css",
  "./styles/views.css",
  "./src/main.js",
  "./src/app/startApp.js",
  "./src/components/ItemCard.js",
  "./src/components/NewsItem.js",
  "./src/components/NetworkStatusNotice.js",
  "./src/components/PersistenceNotice.js",
  "./src/controllers/PersistenceController.js",
  "./src/controllers/SavedResourcesController.js",
  "./src/controllers/ServiceWorkerController.js",
  "./src/controllers/ThemeController.js",
  "./src/data/items.js",
  "./src/data/resourceAreas.js",
  "./src/pwa/config.js",
  "./src/pwa/diagnostics.js",
  "./src/pwa/registerSW.js",
  "./src/pwa/scopeDemo.js",
  "./src/router/router.js",
  "./src/router/routes.js",
  "./src/services/CacheDebugService.js",
  "./src/services/CookieService.js",
  "./src/services/dbService.js",
  "./src/services/HackerNewsService.js",
  "./src/services/itemsService.js",
  "./src/services/PersistenceService.js",
  "./src/services/StorageService.js",
  "./src/utils/escapeHtml.js",
  "./src/utils/safeUrl.js",
  "./src/utils/slugify.js",
  "./src/vendor/idb.js",
  "./src/views/AboutView.js",
  "./src/views/DevNewsView.js",
  "./src/views/HomeView.js",
  "./src/views/ItemDetailView.js",
  "./src/views/LoadingView.js",
  "./src/views/NotFoundView.js",
  "./src/views/PersistenceView.js",
  "./src/views/RouterErrorView.js",
  "./src/views/SavedResourcesView.js",
  "./src/views/ServiceWorkerView.js",
];

console.info("[SW] Ejecutado");
console.info("[SW] Contexto global:", self.constructor.name);
console.info("[SW] typeof window:", typeof window);
console.info("[SW] typeof document:", typeof document);
console.info("[SW] typeof localStorage:", typeof localStorage);
console.info("[SW] Scope:", self.registration.scope);

self.addEventListener("install", (event) => {
  const freshRequests = APP_SHELL.map((resource) =>
    new Request(new URL(resource, self.location.href), { cache: "reload" }),
  );
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(freshRequests)),
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
  const strategy = strategyFor(request);
  if (!strategy) return;

  const cacheKey = cacheKeyFor(request);
  event.respondWith(
    runStrategy(strategy, request, cacheKey, event)
      .catch(() => emergencyResponse(request)),
  );
});

function strategyFor(request) {
  if (request.method !== "GET") return null;

  const url = new URL(request.url);
  if (url.origin === HACKER_NEWS_ORIGIN && url.pathname.startsWith("/v0/")) {
    return "network-first";
  }

  if (url.origin !== self.location.origin) return null;
  if (url.href === NETWORK_FIRST_URL) return "network-first";
  if (url.href === STALE_WHILE_REVALIDATE_URL) return "stale-while-revalidate";
  return "cache-first";
}

function cacheKeyFor(request) {
  if (request.mode !== "navigate") return request;

  const url = new URL(request.url);
  const scopeDemoPath = new URL("./scope-demo/", self.registration.scope).pathname;
  const entry = url.pathname.startsWith(scopeDemoPath)
    ? "./scope-demo/index.html"
    : "./index.html";
  return new URL(entry, self.registration.scope).href;
}

function runStrategy(strategy, request, cacheKey, event) {
  if (strategy === "network-first") {
    return networkFirst(request, cacheKey, event);
  }

  if (strategy === "stale-while-revalidate") {
    return staleWhileRevalidate(request, cacheKey, event);
  }

  return cacheFirst(request, cacheKey, event);
}

async function cacheFirst(request, cacheKey, event) {
  const cache = await caches.open(CACHE_VERSION);
  const cachedResponse = await cache.match(cacheKey);

  console.info("[SW] " + (cachedResponse ? "HIT" : "MISS"), request.url);
  if (cachedResponse) return cachedResponse;

  const response = await fetch(request.mode === "navigate" ? cacheKey : request);
  if (response.ok) storeResponse(cache, cacheKey, response, event);
  return response;
}

async function networkFirst(request, cacheKey, event) {
  const cache = await caches.open(CACHE_VERSION);
  const cachedResponse = await cache.match(cacheKey);

  console.info("[SW] " + (cachedResponse ? "HIT" : "MISS"), request.url);

  try {
    const response = await fetch(request);
    if (response.ok) {
      storeResponse(cache, cacheKey, response, event);
      return response;
    }
  } catch {
    // Una copia almacenada puede seguir disponible aunque la red no responda.
  }

  return cachedResponse ?? emergencyResponse(request);
}

async function staleWhileRevalidate(request, cacheKey, event) {
  const cache = await caches.open(CACHE_VERSION);
  const cachedResponse = await cache.match(cacheKey);
  const updatePromise = fetch(request).then((response) => {
    if (!response.ok) throw new Error("La respuesta de actualización no fue exitosa.");
    storeResponse(cache, cacheKey, response, event);
    return response;
  });

  console.info("[SW] " + (cachedResponse ? "HIT" : "MISS"), request.url);

  if (cachedResponse) {
    event.waitUntil(updatePromise.catch(() => undefined));
    return cachedResponse;
  }

  try {
    return await updatePromise;
  } catch {
    return emergencyResponse(request);
  }
}

function storeResponse(cache, cacheKey, response, event) {
  event.waitUntil(
    cache.put(cacheKey, response.clone()).catch(() => undefined),
  );
}

function emergencyResponse(request) {
  const isNavigation = request.mode === "navigate";
  const body = isNavigation
    ? "<!doctype html><html lang=\"es\"><meta charset=\"utf-8\"><title>Sin conexión</title><body><p>Esta página no está disponible sin conexión.</p></body></html>"
    : JSON.stringify({ error: "Recurso no disponible sin conexión." });
  const contentType = isNavigation
    ? "text/html; charset=utf-8"
    : "application/json; charset=utf-8";

  return new Response(body, {
    status: 503,
    headers: { "Content-Type": contentType },
  });
}
