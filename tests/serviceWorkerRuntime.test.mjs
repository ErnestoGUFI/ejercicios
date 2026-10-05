import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

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
  const cache = {
    addAll: async (resources) => {
      openedCaches.set("tech-catalogo-shell-v3", [...resources]);
    },
  };
  const cachesObject = {
    open: async (name) => {
      assert.equal(name, "tech-catalogo-shell-v3");
      return cache;
    },
    keys: async () => [
      "unrelated-app-cache",
      "tech-catalogo-shell-v1",
      "tech-catalogo-shell-v2",
      "tech-catalogo-shell-v3",
    ],
    delete: async (name) => {
      deletedCaches.push(name);
      return true;
    },
  };
  const self = {
    constructor: { name: "ServiceWorkerGlobalScope" },
    registration: { scope: "https://example.com/ejercicios/" },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };

  vm.runInNewContext(source, {
    self,
    caches: cachesObject,
    console: { info() {} },
  });

  let installPromise;
  listeners.install({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  assert.deepEqual(openedCaches.get("tech-catalogo-shell-v3"), [
    "./",
    "./index.html",
    "./favicon.svg",
    "./styles/tokens.css",
    "./styles/shell.css",
    "./styles/components.css",
    "./styles/views.css",
    "./src/main.js",
  ]);

  let activatePromise;
  listeners.activate({ waitUntil(promise) { activatePromise = promise; } });
  await activatePromise;
  assert.deepEqual(deletedCaches, ["tech-catalogo-shell-v1", "tech-catalogo-shell-v2"]);
});

async function createFetchHarness({ cachedResponse = null, networkResponse = null, putPromise } = {}) {
  const listeners = {};
  const logs = [];
  const matchCalls = [];
  const putCalls = [];
  const networkCalls = [];
  const cacheNames = [];
  const cache = {
    async match(key) {
      matchCalls.push(typeof key === "string" ? key : key.url);
      return cachedResponse;
    },
    async put(key, response) {
      putCalls.push({ key: typeof key === "string" ? key : key.url, response });
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
    networkCalls.push(typeof request === "string" ? request : request.url);
    return networkResponse;
  };
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    self,
    caches: cachesObject,
    fetch,
    console: { info: (...args) => logs.push(args) },
    URL,
  });

  return {
    listeners,
    logs,
    matchCalls,
    putCalls,
    networkCalls,
    cacheNames,
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

test("fetch does not cache an unsuccessful network response", async () => {
  const networkResponse = { ok: false, status: 503 };
  const harness = await createFetchHarness({ networkResponse });
  const event = createFetchEvent({
    method: "GET",
    mode: "cors",
    url: "https://example.com/ejercicios/cache-demo.json",
  });

  harness.listeners.fetch(event);

  assert.equal(await event.response(), networkResponse);
  await event.waitForLifetime();
  assert.deepEqual(harness.putCalls, []);
  assert.equal(event.waitUntilCount, 1);
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
