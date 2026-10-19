import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { DATABASE_NAME, DATABASE_VERSION, OUTBOX_STORE, RESOURCE_STORE } from "../src/services/dbService.js";
import { SUGGESTION_SYNC_TAG } from "../src/pwa/outboxSync.js";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");

// IndexedDB mínima: solo lo que usa el Service Worker (open, transaction, getAll, put, delete).
function createFakeIndexedDB(outboxItems) {
  const stores = new Map([
    [RESOURCE_STORE, new Map()],
    [OUTBOX_STORE, new Map(outboxItems.map((item) => [item.id, structuredClone(item)]))],
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

function loadServiceWorker({ outboxItems = [], respond }) {
  const listeners = {};
  const logs = [];
  const messages = [];
  const requests = [];
  const indexedDB = createFakeIndexedDB(outboxItems);
  const self = {
    constructor: { name: "ServiceWorkerGlobalScope" },
    location: { origin: "https://example.com", href: "https://example.com/ejercicios/sw.js" },
    registration: { scope: "https://example.com/ejercicios/" },
    clients: { matchAll: async () => [{ postMessage: (message) => messages.push(message) }] },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return respond(requests.length);
  };
  const log = (...args) => logs.push(args.join(" "));
  vm.runInNewContext(source, { self, indexedDB, fetch, URL, console: { info: log, warn: log } });
  return { listeners, logs, messages, requests, indexedDB };
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
  assert.deepEqual(worker.requests.map(({ url }) => url), [
    "https://jsonplaceholder.typicode.com/posts",
    "https://jsonplaceholder.typicode.com/posts",
  ]);
  assert.equal(worker.requests[0].options.method, "POST");
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
