import test from "node:test";
import assert from "node:assert/strict";

const { default: DevNewsView } = await import("../src/views/DevNewsView.js");

test("DevNewsView renders repeated stories returned by the service", async () => {
  const service = {
    getTopStories: async () => [
      {
        id: 101,
        title: "JavaScript modules in practice",
        url: "https://example.com/modules",
        author: "ada",
        score: 98,
        publishedAt: 1_725_000_000,
      },
      {
        id: 202,
        title: "Database indexes <script>alert(1)</script>",
        url: "javascript:alert(1)",
        author: "linus",
        score: 64,
        publishedAt: 1_725_000_100,
      },
    ],
  };

  const html = await DevNewsView({}, service);

  assert.match(html, /Noticias para desarrolladores/);
  assert.equal((html.match(/class="news-item"/g) ?? []).length, 2);
  assert.match(html, /por ada ·/);
  assert.doesNotMatch(html, /puntos/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /https:\/\/news\.ycombinator\.com\/item\?id=202/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("DevNewsView shows a visible retry path when the request fails", async () => {
  const service = {
    getTopStories: async () => {
      throw new Error("network unavailable");
    },
  };

  const html = await DevNewsView({}, service);

  assert.match(html, /role="alert"/);
  assert.match(html, /No pudimos cargar las noticias/);
  assert.match(html, /href="\/noticias" data-link>Reintentar/);
});

test("DevNewsView explains when the API returns no stories", async () => {
  const service = { getTopStories: async () => [] };

  const html = await DevNewsView({}, service);

  assert.match(html, /No hay noticias disponibles en este momento/);
});
