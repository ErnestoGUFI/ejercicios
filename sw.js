const CACHE_VERSION = "tech-catalogo-shell-v9";
const CACHE_PREFIX = "tech-catalogo-shell-v";
const HACKER_NEWS_ORIGIN = "https://hacker-news.firebaseio.com";
const NETWORK_FIRST_URL = new URL("./cache-demo.json", self.registration.scope).href;
const STALE_WHILE_REVALIDATE_URL = new URL("./cache-swr-demo.json", self.registration.scope).href;
const DATABASE_NAME = "tech-catalog-db";
const DATABASE_VERSION = 2;
const RESOURCE_STORE = "saved-resources";
const OUTBOX_STORE = "outbox";
const SUGGESTION_SYNC_TAG = "enviar-sugerencias";
const SUGGESTIONS_ENDPOINT = "https://jsonplaceholder.typicode.com/posts";
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
  "./src/components/InstallControl.js",
  "./src/components/ItemCard.js",
  "./src/components/NewsItem.js",
  "./src/components/NetworkStatusNotice.js",
  "./src/components/PersistenceNotice.js",
  "./src/controllers/PersistenceController.js",
  "./src/controllers/SavedResourcesController.js",
  "./src/controllers/SuggestionsController.js",
  "./src/controllers/ServiceWorkerController.js",
  "./src/controllers/ThemeController.js",
  "./src/data/items.js",
  "./src/data/resourceAreas.js",
  "./src/pwa/config.js",
  "./src/pwa/diagnostics.js",
  "./src/pwa/installPrompt.js",
  "./src/pwa/outboxSync.js",
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
  "./src/views/SuggestionsView.js",
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

self.addEventListener("sync", (event) => {
  if (event.tag !== SUGGESTION_SYNC_TAG) return;

  console.info("[SW] sync", event.tag, event.lastChance ? "(último intento)" : "");
  // Si el envío falla, la promesa rechazada le indica al navegador que reintente más tarde.
  event.waitUntil(flushOutbox("Background Sync"));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "outbox-flush") return;

  console.info("[SW] reintento del plan B:", event.data.trigger);
  event.waitUntil(flushOutbox(event.data.trigger).catch(() => undefined));
});

let flushInProgress = null;

// Si llegan dos disparos a la vez (sync y reintento), comparten el mismo envío.
function flushOutbox(trigger) {
  flushInProgress ??= sendOutbox(trigger).finally(() => {
    flushInProgress = null;
  });
  return flushInProgress;
}

async function sendOutbox(trigger) {
  const items = await readOutbox();
  console.info(`[SW] ${items.length} sugerencia(s) en la cola (${trigger})`);

  for (const item of items) {
    let response;
    try {
      response = await fetch(SUGGESTIONS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          title: item.topic,
          body: item.comment,
          area: item.area,
          clientId: item.id,
          createdAt: item.createdAt,
        }),
      });
    } catch (error) {
      await recordFailure(item, "sin conexión");
      throw error;
    }

    if (!response.ok) {
      await recordFailure(item, `HTTP ${response.status}`);
      throw new Error(`El servidor respondió ${response.status}`);
    }

    // Solo la confirmación del servidor saca el elemento de la cola.
    const confirmation = await response.json().catch(() => ({}));
    await deleteFromOutbox(item.id);
    console.info("[SW] sugerencia enviada:", item.topic, response.status, "id", confirmation.id ?? "—");
    await notifyClients({
      type: "outbox-sent",
      id: item.id,
      topic: item.topic,
      status: response.status,
      serverId: confirmation.id ?? null,
    });
  }

  await notifyClients({ type: "outbox-flushed", trigger });
}

async function recordFailure(item, reason) {
  console.warn("[SW] el envío falló:", item.topic, reason);
  await saveOutboxItem({
    ...item,
    attempts: (item.attempts ?? 0) + 1,
    lastError: reason,
    lastAttemptAt: new Date().toISOString(),
  });
  await notifyClients({ type: "outbox-failed", id: item.id, topic: item.topic, reason });
}

async function notifyClients(message) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  windows.forEach((client) => client.postMessage(message));
}

// IndexedDB sin librerías: el Service Worker no carga módulos ES.
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RESOURCE_STORE)) {
        database.createObjectStore(RESOURCE_STORE, { keyPath: "id" }).createIndex("by-area", "area");
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        database.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withOutbox(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(OUTBOX_STORE, mode);
      const request = operation(transaction.objectStore(OUTBOX_STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function readOutbox() {
  const items = await withOutbox("readonly", (store) => store.getAll());
  return items.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

function deleteFromOutbox(id) {
  return withOutbox("readwrite", (store) => store.delete(id));
}

function saveOutboxItem(item) {
  return withOutbox("readwrite", (store) => store.put(item));
}

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
