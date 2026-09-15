import test from "node:test";
import assert from "node:assert/strict";

import { resolveRoute } from "../src/router/router.js";

const { createRoutes, routes } = await import("../src/router/routes.js");

test("the noticias route resolves to the API-backed view", async () => {
  const match = resolveRoute(routes, "/noticias");
  const service = {
    getTopStories: async () => [
      {
        id: 101,
        title: "A JavaScript story",
        url: "https://example.com/story",
        author: "ada",
        score: 42,
        publishedAt: 1_725_000_000,
      },
    ],
  };

  assert.ok(match);
  const html = await match.route.view(match.params, service);
  assert.match(html, /A JavaScript story/);
});

test("the persistence route renders values from the shared service", async () => {
  const persistence = {
    getSnapshot: () => ({ theme: "dark", newsSearch: "api", visits: 2 }),
  };
  const match = resolveRoute(createRoutes(persistence), "/persistencia");

  assert.ok(match);
  const html = await match.route.view(match.params);
  assert.match(html, /Oscuro/);
  assert.match(html, /api/);
  assert.match(html, /2 aperturas/);
});

test("the saved resources route reads its initial list from IndexedDB", async () => {
  const persistence = {
    getSnapshot: () => ({ theme: "light", newsSearch: "", visits: 0 }),
  };
  const database = {
    getAllResources: async () => [
      {
        id: "resource-1",
        title: "Patrones de arquitectura",
        url: "https://example.com/architecture",
        area: "architecture",
      },
    ],
  };
  const match = resolveRoute(createRoutes(persistence, database), "/guardados");

  assert.ok(match);
  const html = await match.route.view(match.params);
  assert.match(html, /Patrones de arquitectura/);
  assert.match(html, /data-saved-resource-form/);
});
