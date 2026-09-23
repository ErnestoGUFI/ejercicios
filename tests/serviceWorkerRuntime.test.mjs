import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("sw.js logs its worker context and registers only install and activate handlers", async () => {
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
  assert.equal(listeners.fetch, undefined);
});

test("sw.js precaches the app shell during install and removes old versions on activate", async () => {
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const listeners = {};
  const openedCaches = new Map();
  const deletedCaches = [];
  const cache = {
    addAll: async (resources) => {
      openedCaches.set("tech-catalogo-shell-v1", [...resources]);
    },
  };
  const cachesObject = {
    open: async (name) => {
      assert.equal(name, "tech-catalogo-shell-v1");
      return cache;
    },
    keys: async () => ["tech-catalogo-shell-v0", "tech-catalogo-shell-v1"],
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
  assert.deepEqual(openedCaches.get("tech-catalogo-shell-v1"), [
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
  assert.deepEqual(deletedCaches, ["tech-catalogo-shell-v0"]);
});
