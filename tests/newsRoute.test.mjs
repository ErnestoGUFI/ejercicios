import test from "node:test";
import assert from "node:assert/strict";

import { resolveRoute } from "../src/router/router.js";

const { routes } = await import("../src/router/routes.js");

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
