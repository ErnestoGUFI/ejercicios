import test from "node:test";
import assert from "node:assert/strict";

import { SUGGESTION_SYNC_TAG, createOutboxSync, supportsBackgroundSync } from "../src/pwa/outboxSync.js";

function createWindow({ withSync = true, search = "" } = {}) {
  const listeners = {};
  const browserWindow = {
    listeners,
    location: { search },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
  if (withSync) browserWindow.SyncManager = function SyncManager() {};
  return browserWindow;
}

function createServiceWorker({ registerError } = {}) {
  const calls = [];
  const listeners = {};
  const registration = {
    sync: {
      async register(tag) {
        calls.push(["sync.register", tag]);
        if (registerError) throw registerError;
      },
    },
    active: {
      postMessage(message) {
        calls.push(["postMessage", message]);
      },
    },
  };
  return {
    calls,
    listeners,
    ready: Promise.resolve(registration),
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
}

function createDatabase(initial = []) {
  const items = [...initial];
  const calls = [];
  return {
    calls,
    items,
    async addToOutbox(item) {
      calls.push(["addToOutbox", item.id]);
      items.push(item);
    },
    async getOutbox() {
      return [...items];
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("Background Sync support is detected with SyncManager and can be disabled with ?sin-sync", () => {
  assert.equal(supportsBackgroundSync(createWindow()), true);
  assert.equal(supportsBackgroundSync(createWindow({ withSync: false })), false);
  assert.equal(supportsBackgroundSync(createWindow({ search: "?sin-sync" })), false);
  assert.equal(supportsBackgroundSync(undefined), false);
});

test("enqueue stores the suggestion before registering the sync tag", async () => {
  const database = createDatabase();
  const serviceWorker = createServiceWorker();
  const order = [];
  database.addToOutbox = async (item) => {
    order.push("guardar");
    database.items.push(item);
  };
  serviceWorker.ready = Promise.resolve({
    sync: { register: async (tag) => order.push(`sync:${tag}`) },
  });
  const outboxSync = createOutboxSync({
    browserWindow: createWindow(),
    database,
    serviceWorker,
    createId: () => "s-1",
    now: () => "2026-10-19T10:00:00.000Z",
  });

  const { item, sending } = await outboxSync.enqueue({ topic: "Docker", area: "backend", comment: "Contenedores" });

  assert.equal(outboxSync.mode, "background-sync");
  assert.deepEqual(item, {
    id: "s-1",
    topic: "Docker",
    area: "backend",
    comment: "Contenedores",
    createdAt: "2026-10-19T10:00:00.000Z",
    attempts: 0,
    lastError: null,
  });
  assert.equal(await sending, "sync");
  assert.deepEqual(order, ["guardar", `sync:${SUGGESTION_SYNC_TAG}`]);
});

test("plan B asks the service worker to flush on start, when the connection returns and on demand", async () => {
  const browserWindow = createWindow({ withSync: false });
  const serviceWorker = createServiceWorker();
  const outboxSync = createOutboxSync({ browserWindow, database: createDatabase(), serviceWorker }).init();
  await settle();

  browserWindow.listeners.online();
  await settle();
  assert.equal(await outboxSync.retryNow(), "flush");

  assert.equal(outboxSync.mode, "plan-b");
  assert.deepEqual(serviceWorker.calls, [
    ["postMessage", { type: "outbox-flush", trigger: "apertura de la app" }],
    ["postMessage", { type: "outbox-flush", trigger: "conexión recuperada" }],
    ["postMessage", { type: "outbox-flush", trigger: "botón Reintentar ahora" }],
  ]);
});

test("a rejected sync registration still asks the service worker to send the queue", async () => {
  const serviceWorker = createServiceWorker({ registerError: new Error("NotAllowedError") });
  const outboxSync = createOutboxSync({ browserWindow: createWindow(), database: createDatabase(), serviceWorker, createId: () => "s-2" });

  const { sending } = await outboxSync.enqueue({ topic: "Rust", area: "backend", comment: "Sistemas" });

  assert.equal(await sending, "flush");
  assert.deepEqual(serviceWorker.calls.map(([name]) => name), ["sync.register", "postMessage"]);
});

test("with Background Sync the tag is registered again at start only when items are pending", async () => {
  const emptyWorker = createServiceWorker();
  createOutboxSync({ browserWindow: createWindow(), database: createDatabase(), serviceWorker: emptyWorker }).init();
  const pendingWorker = createServiceWorker();
  createOutboxSync({
    browserWindow: createWindow(),
    database: createDatabase([{ id: "s-3", createdAt: "2026-10-19T09:00:00.000Z" }]),
    serviceWorker: pendingWorker,
  }).init();
  await settle();

  assert.deepEqual(emptyWorker.calls, []);
  assert.deepEqual(pendingWorker.calls, [["sync.register", SUGGESTION_SYNC_TAG]]);
});

test("outbox messages from the service worker reach the subscribers", async () => {
  const serviceWorker = createServiceWorker();
  const outboxSync = createOutboxSync({ browserWindow: createWindow(), database: createDatabase(), serviceWorker }).init();
  const received = [];
  outboxSync.subscribe((message) => received.push(message.type));

  serviceWorker.listeners.message({ data: { type: "outbox-sent", id: "s-1" } });
  serviceWorker.listeners.message({ data: { type: "cache-updated" } });

  assert.deepEqual(received, ["outbox-sent"]);
});
