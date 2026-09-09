import test from "node:test";
import assert from "node:assert/strict";

import startApp from "../src/app/startApp.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("startApp restores theme, registers the visit and starts the router", async (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const windowListeners = {};
  const documentListeners = {};
  let appHtml = "";
  let htmlWrites = 0;
  const app = {
    attributes: {},
    get innerHTML() {
      return appHtml;
    },
    set innerHTML(value) {
      appHtml = value;
      htmlWrites += 1;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus() {},
  };
  const selectListeners = {};
  const select = {
    value: "",
    addEventListener(type, listener) {
      selectListeners[type] = listener;
    },
  };
  const root = { dataset: {} };
  const warning = { hidden: true, textContent: "" };
  const cookieValues = new Map();
  const browserDocument = {
    documentElement: root,
    querySelector(selector) {
      return {
        "#app": app,
        "#theme-select": select,
        "#persistence-warning": warning,
      }[selector];
    },
    addEventListener(type, listener) {
      documentListeners[type] = listener;
    },
    get cookie() {
      return [...cookieValues.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(cookie) {
      const [pair] = cookie.split(";");
      const [key, value] = pair.split("=");
      cookieValues.set(key, value);
    },
  };
  const browserWindow = {
    location: { hash: "#/" },
    localStorage: createStorage({ "tech-catalog-theme": "dark" }),
    sessionStorage: createStorage(),
    addEventListener(type, listener) {
      windowListeners[type] = listener;
    },
  };
  globalThis.window = browserWindow;
  globalThis.document = browserDocument;
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });

  const { router } = startApp({ browserWindow, browserDocument });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(root.dataset.theme, "dark");
  assert.equal(select.value, "dark");
  assert.equal(cookieValues.get("tech-catalog-visits"), "1");
  assert.match(app.innerHTML, /Catálogo de tecnología/);
  assert.equal(typeof windowListeners.hashchange, "function");
  assert.equal(typeof documentListeners.submit, "function");

  const writesBeforeThemeChange = htmlWrites;
  select.value = "light";
  selectListeners.change({ target: select });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    htmlWrites,
    writesBeforeThemeChange,
    "changing the shell theme must not rerender an unrelated view",
  );

  browserWindow.location.hash = "#/persistencia";
  await router.render();
  const writesBeforePersistenceThemeChange = htmlWrites;
  select.value = "dark";
  selectListeners.change({ target: select });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(htmlWrites > writesBeforePersistenceThemeChange);
});
