import test from "node:test";
import assert from "node:assert/strict";

import ServiceWorkerController from "../src/controllers/ServiceWorkerController.js";

function createDocument() {
  const listeners = {};
  const feedback = { textContent: "", dataset: {} };
  const demoOutput = { textContent: "" };
  const focusTargets = new Map();
  return {
    listeners,
    feedback,
    demoOutput,
    focusTargets,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelector(selector) {
      if (selector === "[data-sw-feedback]") return feedback;
      if (selector === "[data-cache-demo-output]") return demoOutput;
      return focusTargets.get(selector) ?? null;
    },
  };
}

function createButton(action) {
  return {
    disabled: false,
    closest(selector) {
      return selector === `[${action}]` ? this : null;
    },
  };
}

test("ServiceWorkerController shows the expected invalid-scope error in the view", async () => {
  const document = createDocument();
  const controller = new ServiceWorkerController({
    document,
    diagnostics: {
      tryInvalidScope: async () => ({
        ok: false,
        errorName: "SecurityError",
        message: "The path of the provided scope is not allowed",
      }),
    },
    router: { render: async () => {} },
  });
  controller.init();
  const button = createButton("data-test-invalid-scope");

  await document.listeners.click({ target: button });

  assert.equal(button.disabled, false);
  assert.equal(document.feedback.dataset.state, "error");
  assert.match(document.feedback.textContent, /SecurityError/);
  assert.match(document.feedback.textContent, /scope is not allowed/);
});

test("ServiceWorkerController registers the narrow scope and refreshes the diagnostic", async () => {
  const document = createDocument();
  let renders = 0;
  let focused = 0;
  document.focusTargets.set("[data-register-narrow-scope]", {
    focus() { focused += 1; },
  });
  const controller = new ServiceWorkerController({
    document,
    diagnostics: {
      registerNarrowScope: async () => ({ ok: true }),
    },
    router: { render: async () => { renders += 1; } },
  });
  controller.init();
  const button = createButton("data-register-narrow-scope");

  await document.listeners.click({ target: button });

  assert.equal(renders, 1);
  assert.equal(focused, 1);
  assert.equal(document.feedback.dataset.state, "success");
  assert.match(document.feedback.textContent, /scope estrecho registrado/i);
});

test("ServiceWorkerController refreshes the route on demand", async () => {
  const document = createDocument();
  let renders = 0;
  let focused = 0;
  document.focusTargets.set("[data-refresh-sw]", {
    focus() { focused += 1; },
  });
  new ServiceWorkerController({
    document,
    diagnostics: {},
    router: { render: async () => { renders += 1; } },
  }).init();

  await document.listeners.click({ target: createButton("data-refresh-sw") });

  assert.equal(renders, 1);
  assert.equal(focused, 1);
});

test("ServiceWorkerController deletes an entry, refreshes the view and reports the result", async () => {
  const document = createDocument();
  const deletedUrls = [];
  let renders = 0;
  let focused = 0;
  document.focusTargets.set("[data-refresh-cache]", { focus() { focused += 1; } });
  new ServiceWorkerController({
    document,
    diagnostics: {},
    cacheDebug: {
      async deleteEntry(url) { deletedUrls.push(url); return true; },
    },
    router: { render: async () => { renders += 1; } },
  }).init();
  const button = createButton("data-delete-cache-entry");
  button.dataset = { cacheUrl: "https://example.com/ejercicios/cache-demo.json" };

  await document.listeners.click({ target: button });

  assert.deepEqual(deletedUrls, [button.dataset.cacheUrl]);
  assert.equal(renders, 1);
  assert.equal(focused, 1);
  assert.equal(document.feedback.dataset.state, "success");
  assert.match(document.feedback.textContent, /entrada eliminada/i);
});

test("ServiceWorkerController loads demo data and displays it as text", async () => {
  const document = createDocument();
  let renders = 0;
  let focused = 0;
  document.focusTargets.set("[data-load-cache-demo]", { focus() { focused += 1; } });
  new ServiceWorkerController({
    document,
    diagnostics: {},
    cacheDebug: {
      async requestDemoData() { return { revision: "actualizado" }; },
    },
    router: { render: async () => { renders += 1; } },
  }).init();

  await document.listeners.click({ target: createButton("data-load-cache-demo") });

  assert.equal(renders, 1);
  assert.equal(focused, 1);
  assert.equal(document.demoOutput.textContent, '{\n  "revision": "actualizado"\n}');
  assert.equal(document.feedback.dataset.state, "success");
});
