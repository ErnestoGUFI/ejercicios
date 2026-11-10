import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { DATABASE_NAME, DATABASE_VERSION, OUTBOX_STORE, RESOURCE_STORE, SETTINGS_STORE } from "../src/services/dbService.js";
import { SUGGESTION_SYNC_TAG } from "../src/pwa/outboxSync.js";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const backendSource = await readFile(new URL("../src/pwa/backend.js", import.meta.url), "utf8");

// IndexedDB mínima: solo lo que usa el Service Worker (open, transaction, get, getAll, put, delete).
function createFakeIndexedDB(outboxItems) {
  const stores = new Map([
    [RESOURCE_STORE, new Map()],
    [OUTBOX_STORE, new Map(outboxItems.map((item) => [item.id, structuredClone(item)]))],
    [SETTINGS_STORE, new Map()],
  ]);
  const later = (callback) => setTimeout(callback, 0);
  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore: (name) => {
      stores.set(name, new Map());
      return { createIndex() {} };
    },
    transaction(name) {
      const store = stores.get(name);
      const transaction = {};
      const request = (operation) => {
        const pending = {};
        later(() => {
          pending.result = operation();
          later(() => transaction.oncomplete?.());
        });
        return pending;
      };
      transaction.objectStore = () => ({
        get: (id) => request(() => structuredClone(store.get(id))),
        getAll: () => request(() => [...store.values()].map((item) => structuredClone(item))),
        put: (item) => request(() => store.set(item.id, structuredClone(item)) && item.id),
        delete: (id) => request(() => store.delete(id) && undefined),
      });
      return transaction;
    },
    close() {},
  };
  return {
    outbox: stores.get(OUTBOX_STORE),
    settings: stores.get(SETTINGS_STORE),
    openedWith: [],
    open(name, version) {
      this.openedWith.push([name, version]);
      const pending = {};
      later(() => {
        pending.result = database;
        pending.onsuccess?.();
      });
      return pending;
    },
  };
}

const API_URL = "https://ssdvmyexawfomfeofhmu.supabase.co/functions/v1/api";
const AUTH_URL = "https://ssdvmyexawfomfeofhmu.supabase.co/auth/v1";
const session = { access_token: "token-1", refresh_token: "refresh-1", expires_in: 3600, user: { id: "usuario-1" } };

function loadServiceWorker({ outboxItems = [], respond, permission = "default", windows, pushSubscription = null, avisos = permission === "granted" }) {
  const listeners = {};
  const logs = [];
  const messages = [];
  const requests = [];
  const notifications = [];
  const opened = [];
  const indexedDB = createFakeIndexedDB(outboxItems);
  // Lo que guarda la app al activar los avisos (dbService.setNotificationsEnabled).
  if (avisos !== null) indexedDB.settings.set("notifications", { id: "notifications", enabled: avisos });
  const clientList = windows ?? [{ url: "https://example.com/ejercicios/#/", postMessage: (message) => messages.push(message) }];
  const self = {
    constructor: { name: "ServiceWorkerGlobalScope" },
    location: { origin: "https://example.com", href: "https://example.com/ejercicios/sw.js" },
    Notification: { permission },
    registration: {
      scope: "https://example.com/ejercicios/",
      pushManager: { getSubscription: async () => pushSubscription },
      async showNotification(title, options) {
        notifications.push({ title, ...options });
      },
    },
    clients: {
      matchAll: async () => clientList,
      async openWindow(url) {
        opened.push(url);
        return { url };
      },
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const authRequests = [];
  const fetch = async (url, options) => {
    // La sesión anónima de Supabase se pide una vez y se guarda en IndexedDB.
    if (url.startsWith(AUTH_URL)) {
      authRequests.push(url);
      return { ok: true, status: 200, json: async () => session };
    }
    requests.push({ url, options, body: JSON.parse(options.body) });
    return respond(requests.length);
  };
  const log = (...args) => logs.push(args.join(" "));
  const context = vm.createContext({ self, indexedDB, fetch, URL, console: { info: log, warn: log } });
  context.importScripts = (path) => {
    assert.equal(path, "./src/pwa/backend.js");
    vm.runInContext(backendSource, context);
  };
  self.fetch = fetch;
  vm.runInContext(source, context);
  return { listeners, logs, messages, requests, authRequests, indexedDB, notifications, opened };
}

function dispatchSync(listeners, tag) {
  let promise = null;
  listeners.sync({ tag, lastChance: false, waitUntil: (value) => { promise = value; } });
  return promise;
}

const items = [
  { id: "b", topic: "Rust", area: "backend", comment: "Sistemas", createdAt: "2026-10-19T10:05:00.000Z", attempts: 0, lastError: null },
  { id: "a", topic: "Docker", area: "backend", comment: "Contenedores", createdAt: "2026-10-19T10:00:00.000Z", attempts: 0, lastError: null },
];
const created = (id) => ({ ok: true, status: 201, json: async () => ({ id }) });

test("the service worker and the page share the database, the outbox store and the sync tag", () => {
  assert.match(source, new RegExp(`const DATABASE_NAME = "${DATABASE_NAME}";`));
  assert.match(source, new RegExp(`const DATABASE_VERSION = ${DATABASE_VERSION};`));
  assert.match(source, new RegExp(`const OUTBOX_STORE = "${OUTBOX_STORE}";`));
  assert.match(source, new RegExp(`const SUGGESTION_SYNC_TAG = "${SUGGESTION_SYNC_TAG}";`));
});

test("sync ignores tags that belong to other features", () => {
  const worker = loadServiceWorker({ outboxItems: items, respond: () => created(101) });

  assert.equal(dispatchSync(worker.listeners, "otra-tag"), null);
  assert.deepEqual(worker.requests, []);
});

test("sync sends the queue oldest first and deletes each item only after the server confirms it", async () => {
  const worker = loadServiceWorker({ outboxItems: items, respond: (count) => created(100 + count) });

  await dispatchSync(worker.listeners, SUGGESTION_SYNC_TAG);

  assert.ok(worker.logs.some((line) => line.startsWith(`[SW] sync ${SUGGESTION_SYNC_TAG}`)));
  assert.deepEqual(worker.requests.map(({ url }) => url), [`${API_URL}/suggestions`, `${API_URL}/suggestions`]);
  assert.equal(worker.requests[0].options.method, "POST");
  // Una sola sesión anónima para toda la cola, enviada como Bearer.
  assert.deepEqual(worker.authRequests, [`${AUTH_URL}/signup`]);
  assert.equal(worker.requests[1].options.headers.Authorization, "Bearer token-1");
  assert.equal(worker.indexedDB.settings.get("session").userId, "usuario-1");
  assert.deepEqual(worker.requests.map(({ body }) => body.title), ["Docker", "Rust"]);
  assert.equal(worker.requests[0].body.clientId, "a");
  assert.equal(worker.indexedDB.outbox.size, 0);
  assert.deepEqual(worker.indexedDB.openedWith[0], [DATABASE_NAME, DATABASE_VERSION]);
  assert.deepEqual(
    worker.messages.filter(({ type }) => type === "outbox-sent").map(({ topic, status, serverId }) => [topic, status, serverId]),
    [["Docker", 201, 101], ["Rust", 201, 102]],
  );
});

test("a server error keeps the item, records the failure and rejects waitUntil so the browser retries", async () => {
  const worker = loadServiceWorker({
    outboxItems: items,
    respond: (count) => (count === 1 ? created(101) : { ok: false, status: 500, json: async () => ({}) }),
  });

  await assert.rejects(dispatchSync(worker.listeners, SUGGESTION_SYNC_TAG), /500/);

  assert.deepEqual([...worker.indexedDB.outbox.keys()], ["b"]);
  const kept = worker.indexedDB.outbox.get("b");
  assert.equal(kept.attempts, 1);
  assert.equal(kept.lastError, "HTTP 500");
  assert.ok(worker.messages.some(({ type, reason }) => type === "outbox-failed" && reason === "HTTP 500"));
});

test("a network failure also keeps the queue and rejects the sync event", async () => {
  const worker = loadServiceWorker({
    outboxItems: items,
    respond: () => {
      throw new TypeError("Failed to fetch");
    },
  });

  await assert.rejects(dispatchSync(worker.listeners, SUGGESTION_SYNC_TAG), /Failed to fetch/);

  assert.equal(worker.indexedDB.outbox.size, 2);
  assert.equal(worker.indexedDB.outbox.get("a").lastError, "sin conexión");
});

test("plan B messages flush the same queue without rejecting the message event", async () => {
  const worker = loadServiceWorker({ outboxItems: items, respond: (count) => created(100 + count) });
  let promise;

  worker.listeners.message({ data: { type: "outbox-flush", trigger: "conexión recuperada" }, waitUntil: (value) => { promise = value; } });
  await promise;

  assert.equal(worker.indexedDB.outbox.size, 0);
  assert.ok(worker.logs.some((line) => line.includes("conexión recuperada")));
});

test("the POST carries the attached location and sends null for older items without one", async () => {
  const location = { source: "device", latitude: 37.77, longitude: -122.42, radiusKm: 1, place: null };
  const worker = loadServiceWorker({
    outboxItems: [
      { ...items[1], location },
      items[0],
      { id: "c", topic: "Go", area: "backend", comment: "Servicios", createdAt: "2026-10-19T10:10:00.000Z", attempts: 0, lastError: null, location: { source: "manual", place: "La Paz, B.C.S." } },
    ],
    respond: (count) => created(100 + count),
  });

  await dispatchSync(worker.listeners, SUGGESTION_SYNC_TAG);

  assert.deepEqual(worker.requests.map(({ body }) => [body.title, body.location]), [
    ["Docker", location],
    ["Rust", null],
    ["Go", { source: "manual", place: "La Paz, B.C.S." }],
  ]);
});

test("with permission granted, a finished send shows one local notification with tag, icon and route", async () => {
  const worker = loadServiceWorker({ outboxItems: items, respond: (count) => created(100 + count), permission: "granted" });

  await dispatchSync(worker.listeners, SUGGESTION_SYNC_TAG);

  assert.equal(worker.notifications.length, 1);
  const [notification] = worker.notifications;
  assert.equal(notification.title, "2 sugerencias enviadas");
  assert.equal(notification.body, "«Docker», «Rust» llegaron al servidor. Toca para ver tus envíos.");
  assert.equal(notification.tag, "sugerencias-enviadas");
  assert.equal(notification.icon, "https://example.com/ejercicios/icons/icon-192.png");
  assert.equal(notification.data.url, "https://example.com/ejercicios/#/sugerencias");
});

test("no notification without permission, with an empty queue, or when nothing was sent", async () => {
  const withoutPermission = loadServiceWorker({ outboxItems: items, respond: (count) => created(100 + count) });
  await dispatchSync(withoutPermission.listeners, SUGGESTION_SYNC_TAG);
  assert.equal(withoutPermission.notifications.length, 0);

  const empty = loadServiceWorker({ outboxItems: [], respond: () => created(101), permission: "granted" });
  await dispatchSync(empty.listeners, SUGGESTION_SYNC_TAG);
  assert.equal(empty.notifications.length, 0);

  const failing = loadServiceWorker({ outboxItems: items, respond: () => ({ ok: false, status: 500, json: async () => ({}) }), permission: "granted" });
  await assert.rejects(dispatchSync(failing.listeners, SUGGESTION_SYNC_TAG));
  assert.equal(failing.notifications.length, 0);
});

test("with a push subscription the local notification is skipped: the backend sends the push", async () => {
  const worker = loadServiceWorker({
    outboxItems: items,
    respond: (count) => created(100 + count),
    permission: "granted",
    pushSubscription: { endpoint: "https://push.example/abc", toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } }) },
  });

  await dispatchSync(worker.listeners, SUGGESTION_SYNC_TAG);

  // Primero vuelve a guardar la suscripción con la sesión actual, luego manda la cola.
  assert.deepEqual(worker.requests.map(({ url }) => url.replace(API_URL, "")), ["/push/subscriptions", "/suggestions", "/suggestions"]);
  assert.equal(worker.indexedDB.outbox.size, 0);
  assert.equal(worker.notifications.length, 0);
});

test("without avisos turned on in the app (or after turning them off) no local notification is shown", async () => {
  for (const avisos of [false, null]) {
    const worker = loadServiceWorker({ outboxItems: items, respond: (count) => created(100 + count), permission: "granted", avisos });

    await dispatchSync(worker.listeners, SUGGESTION_SYNC_TAG);

    assert.equal(worker.indexedDB.outbox.size, 0);
    assert.equal(worker.notifications.length, 0);
  }
});

test("a partial send still notifies what reached the server", async () => {
  const worker = loadServiceWorker({
    outboxItems: items,
    respond: (count) => (count === 1 ? created(101) : { ok: false, status: 500, json: async () => ({}) }),
    permission: "granted",
  });

  await assert.rejects(dispatchSync(worker.listeners, SUGGESTION_SYNC_TAG));

  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0].title, "Sugerencia enviada");
  assert.match(worker.notifications[0].body, /«Docker» llegó al servidor/);
});

function clickNotification(listeners, url) {
  const notification = { data: { url }, closed: 0, close() { this.closed += 1; } };
  let promise;
  listeners.notificationclick({ notification, waitUntil: (value) => { promise = value; } });
  return { notification, promise };
}

test("notificationclick closes it, focuses the open app and asks it to open the route", async () => {
  const posted = [];
  const app = {
    url: "https://example.com/ejercicios/#/acerca",
    focusCalls: 0,
    async focus() { this.focusCalls += 1; return this; },
    postMessage: (message) => posted.push(message),
  };
  const worker = loadServiceWorker({ respond: () => created(101), windows: [{ url: "https://otro.example/", postMessage() {} }, app] });

  const { notification, promise } = clickNotification(worker.listeners, "https://example.com/ejercicios/#/sugerencias");
  await promise;

  assert.equal(notification.closed, 1);
  assert.equal(app.focusCalls, 1);
  assert.deepEqual(posted.map(({ type, url }) => [type, url]), [["notification-open", "https://example.com/ejercicios/#/sugerencias"]]);
  assert.deepEqual(worker.opened, []);
});

test("notificationclick opens a new window when the app is closed, and ignores foreign urls", async () => {
  const worker = loadServiceWorker({ respond: () => created(101), windows: [] });

  await clickNotification(worker.listeners, "https://example.com/ejercicios/#/sugerencias").promise;
  await clickNotification(worker.listeners, "https://malicioso.example/").promise;

  assert.deepEqual(worker.opened, [
    "https://example.com/ejercicios/#/sugerencias",
    "https://example.com/ejercicios/#/sugerencias",
  ]);
});

test("the open app still changes route when the browser refuses focus()", async () => {
  const posted = [];
  const app = {
    url: "https://example.com/ejercicios/#/acerca",
    async focus() { throw new Error("InvalidAccessError"); },
    postMessage: (message) => posted.push(message.url),
  };
  const worker = loadServiceWorker({ respond: () => created(101), windows: [app] });

  await clickNotification(worker.listeners, "https://example.com/ejercicios/#/sugerencias").promise;

  assert.deepEqual(posted, ["https://example.com/ejercicios/#/sugerencias"]);
});

function dispatchPush(listeners, data) {
  let promise;
  listeners.push({ data, waitUntil: (value) => { promise = value; } });
  return promise;
}

const jsonData = (value) => ({ json: () => value, text: () => JSON.stringify(value) });
const textData = (value) => ({ json: () => JSON.parse(value), text: () => value });

test("a JSON push shows its notification inside waitUntil with the route resolved under the scope", async () => {
  const worker = loadServiceWorker({ respond: () => created(101), windows: [] });

  await dispatchPush(worker.listeners, jsonData({
    title: "Sugerencia recibida",
    body: "Guardamos «Docker» en el servidor.",
    url: "#/sugerencias",
    tag: "sugerencias-enviadas",
  }));

  assert.equal(worker.notifications.length, 1);
  const [notification] = worker.notifications;
  assert.equal(notification.title, "Sugerencia recibida");
  assert.equal(notification.body, "Guardamos «Docker» en el servidor.");
  assert.equal(notification.tag, "sugerencias-enviadas");
  assert.equal(notification.icon, "https://example.com/ejercicios/icons/icon-192.png");
  assert.equal(notification.badge, "https://example.com/ejercicios/icons/badge-96.png");
  assert.equal(notification.data.url, "https://example.com/ejercicios/#/sugerencias");

  // El clic reutiliza el notificationclick del ejercicio 5.
  await clickNotification(worker.listeners, notification.data.url).promise;
  assert.deepEqual(worker.opened, ["https://example.com/ejercicios/#/sugerencias"]);
});

test("a text push (plan B), an empty push and a foreign url still show a safe notification", async () => {
  const worker = loadServiceWorker({ respond: () => created(101) });

  await dispatchPush(worker.listeners, textData("Hola desde DevTools"));
  await dispatchPush(worker.listeners, null);
  await dispatchPush(worker.listeners, jsonData({ title: "Aviso", url: "https://malicioso.example/" }));

  assert.deepEqual(worker.notifications.map(({ title, body, tag }) => [title, body, tag]), [
    ["Tech catálogo", "Hola desde DevTools", "aviso-del-servidor"],
    ["Tech catálogo", "", "aviso-del-servidor"],
    ["Aviso", "", "aviso-del-servidor"],
  ]);
  assert.ok(worker.notifications.every(({ data }) => data.url === "https://example.com/ejercicios/#/sugerencias"));
});
