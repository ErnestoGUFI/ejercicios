import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import vm from "node:vm";

const expectedAppShell = [
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

test("sw.js logs its worker context and registers install, activate and fetch handlers", async () => {
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const logs = [];
  const listeners = {};
  const self = {
    constructor: { name: "ServiceWorkerGlobalScope" },
    registration: { scope: "https://example.com/ejercicios/" },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };

  vm.runInNewContext(source, {
    self,
    console: { info: (...args) => logs.push(args) },
    URL,
  });

  assert.deepEqual(logs, [
    ["[SW] Ejecutado"],
    ["[SW] Contexto global:", "ServiceWorkerGlobalScope"],
    ["[SW] typeof window:", "undefined"],
    ["[SW] typeof document:", "undefined"],
    ["[SW] typeof localStorage:", "undefined"],
    ["[SW] Scope:", "https://example.com/ejercicios/"],
  ]);
  assert.equal(typeof listeners.install, "function");
  assert.equal(typeof listeners.activate, "function");
  assert.equal(typeof listeners.fetch, "function");
});

test("sw.js precaches the app shell during install and removes old versions on activate", async () => {
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const listeners = {};
  const openedCaches = new Map();
  const deletedCaches = [];
  const serviceWorkerScriptUrl = "https://example.com/ejercicios/sw.js";
  const cache = {
    addAll: async (resources) => {
      openedCaches.set("tech-catalogo-shell-v9", [...resources]);
    },
  };
  const cachesObject = {
    open: async (name) => {
      assert.equal(name, "tech-catalogo-shell-v9");
      return cache;
    },
    keys: async () => [
      "unrelated-app-cache",
      "tech-catalogo-shell-v1",
      "tech-catalogo-shell-v2",
      "tech-catalogo-shell-v3",
      "tech-catalogo-shell-v4",
      "tech-catalogo-shell-v5",
      "tech-catalogo-shell-v6",
      "tech-catalogo-shell-v7",
      "tech-catalogo-shell-v8",
      "tech-catalogo-shell-v9",
    ],
    delete: async (name) => {
      deletedCaches.push(name);
      return true;
    },
  };
  const self = {
    constructor: { name: "ServiceWorkerGlobalScope" },
    location: { origin: "https://example.com", href: serviceWorkerScriptUrl },
    registration: { scope: "https://example.com/ejercicios/" },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };

  vm.runInNewContext(source, {
    self,
    caches: cachesObject,
    console: { info() {} },
    Request: class TestRequest {
      constructor(url, options = {}) {
        this.url = String(url);
        this.cache = options.cache ?? "default";
      }
    },
    URL,
  });

  let installPromise;
  let installWaitUntilCount = 0;
  listeners.install({ waitUntil(promise) { installWaitUntilCount += 1; installPromise = promise; } });
  await installPromise;
  assert.equal(installWaitUntilCount, 1);
  const precacheList = openedCaches.get("tech-catalogo-shell-v9");
  assert.deepEqual(
    precacheList.map((request) => request.url),
    expectedAppShell.map((resource) => new URL(resource, serviceWorkerScriptUrl).href),
  );
  assert.ok(precacheList.every((request) => request.cache === "reload"));
  assert.ok(precacheList.every((request) => !/\/cache-(?:swr-)?demo\.json$/.test(request.url)));
  for (const resource of expectedAppShell) {
    await access(new URL(resource, new URL("../", import.meta.url)));
  }

  let activatePromise;
  let activateWaitUntilCount = 0;
  listeners.activate({ waitUntil(promise) { activateWaitUntilCount += 1; activatePromise = promise; } });
  await activatePromise;
  assert.equal(activateWaitUntilCount, 1);
  assert.deepEqual(deletedCaches, [
    "tech-catalogo-shell-v1",
    "tech-catalogo-shell-v2",
    "tech-catalogo-shell-v3",
    "tech-catalogo-shell-v4",
    "tech-catalogo-shell-v5",
    "tech-catalogo-shell-v6",
    "tech-catalogo-shell-v7",
    "tech-catalogo-shell-v8",
  ]);
});

test("the precached scope-demo navigation keeps its own HTML entry point", async () => {
  const scopeDemo = { source: "scope-demo" };
  const harness = await createFetchHarness({
    cacheEntries: new Map([
      ["https://example.com/ejercicios/scope-demo/index.html", scopeDemo],
    ]),
  });
  const event = createFetchEvent({
    method: "GET",
    mode: "navigate",
    url: "https://example.com/ejercicios/scope-demo/",
  });

  harness.listeners.fetch(event);

  assert.equal(await event.response(), scopeDemo);
  assert.deepEqual(harness.matchCalls, ["https://example.com/ejercicios/scope-demo/index.html"]);
});

async function createFetchHarness({
  cachedResponse = null,
  cacheEntries = new Map(),
  networkResponse = null,
  networkError = null,
  putPromise,
} = {}) {
  const listeners = {};
  const logs = [];
  const matchCalls = [];
  const putCalls = [];
  const networkCalls = [];
  const cacheNames = [];
  const storedEntries = new Map(cacheEntries);
  const cache = {
    async match(key) {
      const cacheKey = typeof key === "string" ? key : key.url;
      matchCalls.push(cacheKey);
      return storedEntries.get(cacheKey) ?? cachedResponse;
    },
    async put(key, response) {
      const cacheKey = typeof key === "string" ? key : key.url;
      putCalls.push({ key: cacheKey, response });
      storedEntries.set(cacheKey, response);
      if (putPromise) return putPromise;
    },
  };
  const self = {
    constructor: { name: "ServiceWorkerGlobalScope" },
    location: { origin: "https://example.com" },
    registration: { scope: "https://example.com/ejercicios/" },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const cachesObject = {
    async open(name) {
      cacheNames.push(name);
      return cache;
    },
  };
  const fetch = async (request) => {
    const url = typeof request === "string" ? request : request.url;
    networkCalls.push(url);
    if (networkError) throw networkError;
    return typeof networkResponse === "function"
      ? networkResponse(url, networkCalls.length)
      : networkResponse;
  };
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    self,
    caches: cachesObject,
    fetch,
    console: { info: (...args) => logs.push(args) },
    URL,
    Response,
  });

  return {
    listeners,
    logs,
    matchCalls,
    putCalls,
    networkCalls,
    cacheNames,
    storedEntries,
  };
}

function createFetchEvent(request) {
  const waitUntilPromises = [];
  let responsePromise;
  return {
    request,
    waitUntil(promise) {
      waitUntilPromises.push(Promise.resolve(promise));
    },
    respondWith(promise) {
      responsePromise = Promise.resolve(promise);
    },
    async response() {
      return responsePromise;
    },
    async waitForLifetime() {
      await Promise.all(waitUntilPromises);
    },
    get wasIntercepted() {
      return responsePromise !== undefined;
    },
    get waitUntilCount() {
      return waitUntilPromises.length;
    },
  };
}

test("fetch leaves non-GET and cross-origin requests untouched", async () => {
  const harness = await createFetchHarness();
  const post = createFetchEvent({
    method: "POST",
    mode: "cors",
    url: "https://example.com/ejercicios/data.json",
  });
  const external = createFetchEvent({
    method: "GET",
    mode: "cors",
    url: "https://api.example.org/data.json",
  });

  harness.listeners.fetch(post);
  harness.listeners.fetch(external);

  assert.equal(post.wasIntercepted, false);
  assert.equal(external.wasIntercepted, false);
  assert.deepEqual(harness.cacheNames, []);
});

test("fetch returns a cache HIT before making a network request", async () => {
  const cachedResponse = { source: "cache" };
  const harness = await createFetchHarness({ cachedResponse });
  const event = createFetchEvent({
    method: "GET",
    mode: "cors",
    url: "https://example.com/ejercicios/src/main.js",
  });

  harness.listeners.fetch(event);

  assert.equal(await event.response(), cachedResponse);
  assert.deepEqual(harness.matchCalls, ["https://example.com/ejercicios/src/main.js"]);
  assert.deepEqual(harness.networkCalls, []);
  assert.ok(harness.logs.some(([label, url]) =>
    label === "[SW] HIT" && url === "https://example.com/ejercicios/src/main.js"));
});

test("fetch stores a successful MISS with a cloned response and waitUntil", async () => {
  let cloned = false;
  let finishCacheWrite;
  const cacheWritePromise = new Promise((resolve) => { finishCacheWrite = resolve; });
  const networkResponse = {
    ok: true,
    clone() {
      cloned = true;
      return { source: "clone" };
    },
  };
  const harness = await createFetchHarness({ networkResponse, putPromise: cacheWritePromise });
  const event = createFetchEvent({
    method: "GET",
    mode: "cors",
    url: "https://example.com/ejercicios/cache-demo.json",
  });

  harness.listeners.fetch(event);

  assert.equal(await event.response(), networkResponse);
  assert.deepEqual(harness.networkCalls, ["https://example.com/ejercicios/cache-demo.json"]);
  assert.deepEqual(harness.putCalls, [{
    key: "https://example.com/ejercicios/cache-demo.json",
    response: { source: "clone" },
  }]);
  assert.equal(cloned, true);
  assert.equal(event.waitUntilCount, 1);
  assert.ok(harness.logs.some(([label, url]) =>
    label === "[SW] MISS" && url === "https://example.com/ejercicios/cache-demo.json"));

  let lifetimeFinished = false;
  const lifetime = event.waitForLifetime().then(() => { lifetimeFinished = true; });
  await Promise.resolve();
  assert.equal(lifetimeFinished, false);
  finishCacheWrite();
  await lifetime;
  assert.equal(lifetimeFinished, true);
});

test("an unsuccessful network response is replaced by a controlled 503 when no copy exists", async () => {
  const networkResponse = { ok: false, status: 503 };
  const harness = await createFetchHarness({ networkResponse });
  const event = createFetchEvent({
    method: "GET",
    mode: "cors",
    url: "https://example.com/ejercicios/cache-demo.json",
  });

  harness.listeners.fetch(event);

  const response = await event.response();
  await event.waitForLifetime();
  assert.ok(response instanceof Response);
  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(harness.putCalls, []);
});

test("fetch serves every navigation from the single cached App Shell entry", async () => {
  const cachedResponse = { source: "app-shell" };
  const harness = await createFetchHarness({ cachedResponse });
  const event = createFetchEvent({
    method: "GET",
    mode: "navigate",
    url: "https://example.com/ejercicios/guardados",
  });

  harness.listeners.fetch(event);

  assert.equal(await event.response(), cachedResponse);
  assert.deepEqual(harness.matchCalls, ["https://example.com/ejercicios/index.html"]);
  assert.deepEqual(harness.networkCalls, []);
});

function cachedValue(value) {
  return {
    ok: true,
    value,
    clone() {
      return cachedValue(value);
    },
  };
}

test("fetch applies Network First to the demo JSON and stores the newest response", async () => {
  const url = "https://example.com/ejercicios/cache-demo.json";
  const previous = cachedValue("network-v1");
  const latest = cachedValue("network-v2");
  const harness = await createFetchHarness({
    cacheEntries: new Map([[url, previous]]),
    networkResponse: latest,
  });
  const event = createFetchEvent({ method: "GET", mode: "cors", url });

  harness.listeners.fetch(event);

  assert.equal(await event.response(), latest);
  assert.deepEqual(harness.networkCalls, [url]);
  assert.equal(harness.storedEntries.get(url).value, "network-v2");
});

test("Network First returns the last cached response when the network is offline", async () => {
  const url = "https://example.com/ejercicios/cache-demo.json";
  const previous = cachedValue("network-v1");
  const harness = await createFetchHarness({
    cacheEntries: new Map([[url, previous]]),
    networkError: new TypeError("offline"),
  });
  const event = createFetchEvent({ method: "GET", mode: "cors", url });

  harness.listeners.fetch(event);

  assert.equal(await event.response(), previous);
  assert.deepEqual(harness.networkCalls, [url]);
});

test("Network First uses its cached copy for an unsuccessful HTTP response", async () => {
  const url = "https://example.com/ejercicios/cache-demo.json";
  const previous = cachedValue("network-v1");
  const harness = await createFetchHarness({
    cacheEntries: new Map([[url, previous]]),
    networkResponse: { ok: false, status: 502 },
  });
  const event = createFetchEvent({ method: "GET", mode: "cors", url });

  harness.listeners.fetch(event);

  assert.equal(await event.response(), previous);
  assert.deepEqual(harness.networkCalls, [url]);
  assert.deepEqual(harness.putCalls, []);
});

test("an uncached request returns a typed 503 when its network request fails", async () => {
  const url = "https://example.com/ejercicios/src/main.js";
  const harness = await createFetchHarness({ networkError: new TypeError("offline") });
  const event = createFetchEvent({ method: "GET", mode: "cors", url });

  harness.listeners.fetch(event);

  const response = await event.response().catch((error) => error);
  await event.waitForLifetime().catch(() => {});
  assert.ok(response instanceof Response, "the Service Worker returns a Response instead of rejecting");
  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type"), /application\/(json|problem\+json)|text\/plain/);
  assert.ok((await response.text()).length > 0);
});

test("an uncached offline navigation returns a readable HTML 503", async () => {
  const harness = await createFetchHarness({ networkError: new TypeError("offline") });
  const event = createFetchEvent({
    method: "GET",
    mode: "navigate",
    url: "https://example.com/ejercicios/acerca",
  });

  harness.listeners.fetch(event);

  const response = await event.response();
  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(await response.text(), /no está disponible sin conexión/);
});

test("Stale-While-Revalidate returns stale data first and refreshed data next", async () => {
  const url = "https://example.com/ejercicios/cache-swr-demo.json";
  let networkRevision = 1;
  const harness = await createFetchHarness({
    cacheEntries: new Map([[url, cachedValue("swr-v1")]]),
    networkResponse: () => cachedValue(`swr-v${++networkRevision}`),
  });
  const first = createFetchEvent({ method: "GET", mode: "cors", url });

  harness.listeners.fetch(first);

  assert.equal((await first.response())?.value, "swr-v1");
  assert.deepEqual(harness.networkCalls, [url]);
  await first.waitForLifetime();
  assert.equal(harness.storedEntries.get(url).value, "swr-v2");

  const second = createFetchEvent({ method: "GET", mode: "cors", url });
  harness.listeners.fetch(second);
  assert.equal((await second.response())?.value, "swr-v2");
  await second.waitForLifetime();
});

test("Stale-While-Revalidate fills an empty cache from the network", async () => {
  const url = "https://example.com/ejercicios/cache-swr-demo.json";
  const latest = cachedValue("swr-v1");
  const harness = await createFetchHarness({ networkResponse: latest });
  const event = createFetchEvent({ method: "GET", mode: "cors", url });

  harness.listeners.fetch(event);

  assert.equal((await event.response())?.value, "swr-v1");
  await event.waitForLifetime();
  assert.deepEqual(harness.networkCalls, [url]);
  assert.equal(harness.putCalls.length, 1);
  assert.equal(harness.storedEntries.get(url).value, "swr-v1");
});

test("fetch applies Network First to the allowlisted Hacker News origin only", async () => {
  const url = "https://hacker-news.firebaseio.com/v0/topstories.json";
  const latest = cachedValue("online");
  const harness = await createFetchHarness({ networkResponse: latest });
  const allowed = createFetchEvent({ method: "GET", mode: "cors", url });

  harness.listeners.fetch(allowed);

  assert.equal(allowed.wasIntercepted, true);
  assert.equal(await allowed.response(), latest);
  assert.deepEqual(harness.networkCalls, [url]);
});
