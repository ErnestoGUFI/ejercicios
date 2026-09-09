import test from "node:test";
import assert from "node:assert/strict";

import PersistenceController from "../src/controllers/PersistenceController.js";

function createDocument() {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
}

test("PersistenceController stores the news search before rendering again", () => {
  const document = createDocument();
  const searches = [];
  let renders = 0;
  const controller = new PersistenceController({
    document,
    persistence: { setNewsSearch: (value) => searches.push(value) },
    router: { render: () => { renders += 1; } },
    themeController: { apply() {} },
  });
  controller.init();
  let prevented = false;

  document.listeners.submit({
    target: {
      matches: (selector) => selector === "[data-news-search-form]",
      elements: { "news-search": { value: "  css grid  " } },
    },
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.deepEqual(searches, ["css grid"]);
  assert.equal(renders, 1);
});

test("PersistenceController clears the theme independently and reapplies light mode", () => {
  const document = createDocument();
  let cleared = 0;
  const applied = [];
  let renders = 0;
  const controller = new PersistenceController({
    document,
    persistence: { clearTheme: () => { cleared += 1; } },
    router: { render: () => { renders += 1; } },
    themeController: { apply: (theme) => applied.push(theme) },
  });
  controller.init();

  document.listeners.click({
    target: {
      closest: () => ({ dataset: { clearPersistence: "theme" } }),
    },
  });

  assert.equal(cleared, 1);
  assert.deepEqual(applied, ["light"]);
  assert.equal(renders, 1);
});

test("PersistenceController clears only the session news search", () => {
  const document = createDocument();
  let cleared = 0;
  let renders = 0;
  const controller = new PersistenceController({
    document,
    persistence: { clearNewsSearch: () => { cleared += 1; } },
    router: { render: () => { renders += 1; } },
    themeController: { apply() {} },
  });
  controller.init();

  document.listeners.click({
    target: {
      closest: () => ({ dataset: { clearPersistence: "news-search" } }),
    },
  });

  assert.equal(cleared, 1);
  assert.equal(renders, 1);
});

test("PersistenceController clears only the visit cookie", () => {
  const document = createDocument();
  let cleared = 0;
  let renders = 0;
  const controller = new PersistenceController({
    document,
    persistence: { clearVisitCount: () => { cleared += 1; } },
    router: { render: () => { renders += 1; } },
    themeController: { apply() {} },
  });
  controller.init();

  document.listeners.click({
    target: {
      closest: () => ({ dataset: { clearPersistence: "visits" } }),
    },
  });

  assert.equal(cleared, 1);
  assert.equal(renders, 1);
});
