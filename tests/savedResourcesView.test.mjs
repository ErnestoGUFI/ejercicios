import test from "node:test";
import assert from "node:assert/strict";

import SavedResourcesView, {
  renderSavedResourcesList,
} from "../src/views/SavedResourcesView.js";

test("SavedResourcesView renders the create form, area filter and stored resources", async () => {
  const service = {
    getAllResources: async () => [
      {
        id: "resource-1",
        title: "MDN <JavaScript>",
        url: "https://developer.mozilla.org/es/docs/Web/JavaScript",
        area: "frontend",
      },
      {
        id: "resource-2",
        title: "Node.js guides",
        url: "https://nodejs.org/en/learn",
        area: "backend",
      },
    ],
  };

  const html = await SavedResourcesView({}, service);

  assert.match(html, /data-saved-resource-form/);
  assert.match(html, /<label for="resource-title">Título<\/label>/);
  assert.match(html, /<label for="resource-url">URL<\/label>/);
  assert.match(html, /<label for="resource-area">Área<\/label>/);
  assert.match(html, /data-resource-area-filter/);
  assert.match(html, /data-saved-resources-list/);
  assert.match(html, /MDN &lt;JavaScript&gt;/);
  assert.match(html, /Node\.js guides/);
  assert.match(html, /data-delete-resource="resource-1"/);
  assert.match(html, /aria-live="polite"/);
});

test("renderSavedResourcesList shows a useful empty state", () => {
  const html = renderSavedResourcesList([]);

  assert.match(html, /Todavía no hay recursos guardados/);
});

test("SavedResourcesView reports an initial IndexedDB read failure", async () => {
  const service = {
    getAllResources: async () => {
      throw new Error("IndexedDB unavailable");
    },
  };

  const html = await SavedResourcesView({}, service);

  assert.match(html, /No se pudieron leer los recursos guardados/);
  assert.match(html, /data-feedback-state="error"/);
});

test("renderSavedResourcesList blocks unsafe stored links", () => {
  const html = renderSavedResourcesList([
    {
      id: "unsafe",
      title: "Recurso inseguro",
      url: "javascript:alert(1)",
      area: "frontend",
    },
  ]);

  assert.match(html, /href="#"/);
  assert.doesNotMatch(html, /href="javascript:/);
});
