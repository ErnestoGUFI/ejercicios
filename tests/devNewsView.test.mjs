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
  assert.match(html, /href="#\/noticias" data-link>Reintentar/);
});

test("DevNewsView explains a network or CORS failure", async () => {
  const service = {
    getTopStories: async () => {
      throw new TypeError("Failed to fetch");
    },
  };

  const html = await DevNewsView({}, service);

  assert.match(html, /No pudimos conectar con el servicio de noticias/);
  assert.match(html, /conexión o una restricción CORS/);
});

test("DevNewsView explains when the request times out", async () => {
  const service = {
    getTopStories: async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    },
  };

  const html = await DevNewsView({}, service);

  assert.match(html, /La solicitud tardó demasiado/);
  assert.match(html, /límite de 5 segundos/);
});

test("DevNewsView includes the status of an HTTP server error", async () => {
  const service = {
    getTopStories: async () => {
      const error = new Error("Service unavailable");
      error.name = "HttpError";
      error.status = 503;
      throw error;
    },
  };

  const html = await DevNewsView({}, service);

  assert.match(html, /El servidor respondió con el estado 503/);
  assert.match(html, /Inténtalo de nuevo más tarde/);
});

test("DevNewsView explains when the API returns no stories", async () => {
  const service = { getTopStories: async () => [] };

  const html = await DevNewsView({}, service);

  assert.match(html, /No hay noticias disponibles en este momento/);
});

test("DevNewsView restores and applies the session news search", async () => {
  const service = {
    getTopStories: async () => [
      {
        id: 1,
        title: "JavaScript modules in practice",
        url: "https://example.com/javascript",
        author: "ada",
        publishedAt: 1_725_000_000,
      },
      {
        id: 2,
        title: "Modern CSS layout",
        url: "https://example.com/css",
        author: "grace",
        publishedAt: 1_725_000_100,
      },
    ],
  };
  const persistence = { getNewsSearch: () => "javascript" };

  const html = await DevNewsView({}, service, persistence);

  assert.match(html, /value="javascript"/);
  assert.match(html, /JavaScript modules in practice/);
  assert.doesNotMatch(html, /Modern CSS layout/);
});
