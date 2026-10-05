import test from "node:test";
import assert from "node:assert/strict";

import { createCacheDebugService } from "../src/services/CacheDebugService.js";

function makeResponse(body, { status = 200, contentType = "application/json" } = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType },
  });
}

test("listEntries reads the latest app cache and returns its stored request metadata", async () => {
  const calls = [];
  const request = { url: "https://example.com/ejercicios/cache-demo.json" };
  const cache = {
    async keys() { return [request]; },
    async match(key) {
      assert.equal(key, request);
      return makeResponse('{"revision":"original"}');
    },
  };
  const cacheStorage = {
    async keys() {
      return [
        "unrelated-cache",
        "tech-catalogo-shell-v1",
        "tech-catalogo-shell-v2",
        "tech-catalogo-shell-v3",
        "tech-catalogo-shell-v4",
      ];
    },
    async open(name) {
      calls.push(name);
      return cache;
    },
  };
  const service = createCacheDebugService({ cacheStorage, baseUrl: "https://example.com/ejercicios/" });

  const snapshot = await service.listEntries();

  assert.equal(snapshot.cacheName, "tech-catalogo-shell-v4");
  assert.deepEqual(calls, ["tech-catalogo-shell-v4"]);
  assert.deepEqual(snapshot.entries, [{
    url: "https://example.com/ejercicios/cache-demo.json",
    path: "/ejercicios/cache-demo.json",
    status: 200,
    contentType: "application/json",
  }]);
});

test("deleteEntry removes an existing cached request and rejects unknown entries", async () => {
  const deleted = [];
  const request = { url: "https://example.com/ejercicios/cache-demo.json" };
  const cache = {
    async keys() { return [request]; },
    async match(key) { return key === request ? makeResponse("{}"): undefined; },
    async delete(key) {
      deleted.push(key);
      return key === request;
    },
  };
  const cacheStorage = {
    async keys() { return ["tech-catalogo-shell-v4"]; },
    async open() { return cache; },
  };
  const service = createCacheDebugService({ cacheStorage, baseUrl: "https://example.com/ejercicios/" });

  assert.equal(await service.deleteEntry(request.url), true);
  assert.equal(await service.deleteEntry("https://example.com/ejercicios/missing.json"), false);
  assert.deepEqual(deleted, [request]);
});

test("requestDemoData bypasses the browser HTTP cache and returns the JSON response", async () => {
  const fetchCalls = [];
  const service = createCacheDebugService({
    cacheStorage: { async keys() { return []; } },
    fetcher: async (...args) => {
      fetchCalls.push(args);
      return makeResponse('{"revision":"actualizado"}');
    },
    baseUrl: "https://example.com/ejercicios/#/service-worker",
  });

  assert.deepEqual(await service.requestDemoData(), { revision: "actualizado" });
  assert.deepEqual(fetchCalls, [["./cache-demo.json", { cache: "no-store" }]]);
});

test("requestDemoData reports an unsuccessful HTTP response", async () => {
  const service = createCacheDebugService({
    cacheStorage: { async keys() { return []; } },
    fetcher: async () => makeResponse("Unavailable", { status: 503, contentType: "text/plain" }),
    baseUrl: "https://example.com/ejercicios/",
  });

  await assert.rejects(service.requestDemoData(), /503/);
});
