import test from "node:test";
import assert from "node:assert/strict";

import SavedResourcesController from "../src/controllers/SavedResourcesController.js";

function createElements() {
  const feedback = { textContent: "", hidden: true, dataset: {} };
  const list = {
    innerHTML: "",
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const filter = { value: "all" };
  return { feedback, list, filter };
}

function createDocument(elements) {
  const listeners = {};
  return {
    listeners,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelector(selector) {
      return {
        "[data-saved-resource-feedback]": elements.feedback,
        "[data-saved-resources-list]": elements.list,
        "[data-resource-area-filter]": elements.filter,
      }[selector];
    },
  };
}

test("SavedResourcesController creates a resource and refreshes the visible list", async () => {
  const elements = createElements();
  const document = createDocument(elements);
  const records = [];
  const database = {
    async createResource(resource) {
      records.push(resource);
    },
    async getAllResources() {
      return records;
    },
  };
  const controller = new SavedResourcesController({
    document,
    database,
    createId: () => "resource-1",
    confirmDelete: () => true,
  });
  controller.init();
  let reset = false;
  const submitButton = { disabled: false };
  const form = {
    matches: (selector) => selector === "[data-saved-resource-form]",
    elements: {
      "resource-title": { value: "  Guía de JavaScript  " },
      "resource-url": { value: " https://example.com/javascript " },
      "resource-area": { value: "frontend" },
    },
    querySelector: () => submitButton,
    reset() {
      reset = true;
    },
  };
  let prevented = false;

  await document.listeners.submit({
    target: form,
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.deepEqual(records, [
    {
      id: "resource-1",
      title: "Guía de JavaScript",
      url: "https://example.com/javascript",
      area: "frontend",
    },
  ]);
  assert.equal(reset, true);
  assert.equal(submitButton.disabled, false);
  assert.match(elements.list.innerHTML, /Guía de JavaScript/);
  assert.equal(elements.feedback.dataset.feedbackState, "success");
  assert.match(elements.feedback.textContent, /guardó correctamente/);
});

test("SavedResourcesController shows visible feedback when a write fails", async () => {
  const elements = createElements();
  const document = createDocument(elements);
  const controller = new SavedResourcesController({
    document,
    database: {
      createResource: async () => {
        throw new Error("Quota exceeded");
      },
      getAllResources: async () => [],
    },
    createId: () => "resource-1",
    confirmDelete: () => true,
  });
  controller.init();
  const form = {
    matches: () => true,
    elements: {
      "resource-title": { value: "JavaScript" },
      "resource-url": { value: "https://example.com/javascript" },
      "resource-area": { value: "frontend" },
    },
    querySelector: () => ({ disabled: false }),
    reset() {},
  };

  await document.listeners.submit({ target: form, preventDefault() {} });

  assert.equal(elements.feedback.hidden, false);
  assert.equal(elements.feedback.dataset.feedbackState, "error");
  assert.match(elements.feedback.textContent, /No se pudo guardar/);
});

test("SavedResourcesController filters the list through the area index", async () => {
  const elements = createElements();
  const document = createDocument(elements);
  const controller = new SavedResourcesController({
    document,
    database: {
      getAllResources: async () => [],
      getResourcesByArea: async (area) =>
        area === "backend"
          ? [
              {
                id: "resource-2",
                title: "Diseño de APIs",
                url: "https://example.com/apis",
                area: "backend",
              },
            ]
          : [],
    },
    confirmDelete: () => true,
  });
  controller.init();
  const filter = {
    value: "backend",
    matches: (selector) => selector === "[data-resource-area-filter]",
  };

  await document.listeners.change({ target: filter });

  assert.match(elements.list.innerHTML, /Diseño de APIs/);
  assert.match(elements.list.innerHTML, /Backend/);
  assert.equal(elements.list.attributes["aria-busy"], "false");
});

test("SavedResourcesController ignores a stale filter result", async () => {
  const elements = createElements();
  const document = createDocument(elements);
  const pending = {};
  const controller = new SavedResourcesController({
    document,
    database: {
      getResourcesByArea: (area) =>
        new Promise((resolve) => {
          pending[area] = resolve;
        }),
    },
    confirmDelete: () => true,
  });

  const frontendLoad = controller.loadResources("frontend");
  const backendLoad = controller.loadResources("backend");
  pending.backend([
    {
      id: "backend-resource",
      title: "Diseño de APIs",
      url: "https://example.com/apis",
      area: "backend",
    },
  ]);
  await backendLoad;
  pending.frontend([
    {
      id: "frontend-resource",
      title: "CSS moderno",
      url: "https://example.com/css",
      area: "frontend",
    },
  ]);
  await frontendLoad;

  assert.match(elements.list.innerHTML, /Diseño de APIs/);
  assert.doesNotMatch(elements.list.innerHTML, /CSS moderno/);
  assert.equal(elements.list.attributes["aria-busy"], "false");
});

test("SavedResourcesController deletes a resource and refreshes the list", async () => {
  const elements = createElements();
  const document = createDocument(elements);
  const records = new Map([
    [
      "resource-1",
      {
        id: "resource-1",
        title: "CSS Grid",
        url: "https://example.com/css-grid",
        area: "frontend",
      },
    ],
  ]);
  const controller = new SavedResourcesController({
    document,
    database: {
      deleteResource: async (id) => records.delete(id),
      getAllResources: async () => [...records.values()],
    },
    confirmDelete: () => true,
  });
  controller.init();

  await document.listeners.click({
    target: {
      closest: (selector) =>
        selector === "[data-delete-resource]"
          ? { dataset: { deleteResource: "resource-1" } }
          : null,
    },
  });

  assert.equal(records.size, 0);
  assert.match(elements.list.innerHTML, /Todavía no hay recursos guardados/);
  assert.equal(elements.feedback.dataset.feedbackState, "success");
  assert.match(elements.feedback.textContent, /eliminó correctamente/);
});
