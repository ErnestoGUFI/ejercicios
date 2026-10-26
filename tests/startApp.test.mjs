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

function createBrowser({ location = { hash: "#/" }, navigator = { onLine: true }, isSecureContext } = {}) {
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
  const networkStatus = { hidden: false, textContent: "" };
  const cookieValues = new Map();
  const browserDocument = {
    documentElement: root,
    querySelector(selector) {
      return {
        "#app": app,
        "#theme-select": select,
        "#persistence-warning": warning,
        "#network-status": networkStatus,
      }[selector];
    },
    addEventListener(type, listener) {
      documentListeners[type] ??= [];
      documentListeners[type].push(listener);
    },
    contains: () => true,
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
    location,
    navigator,
    isSecureContext,
    localStorage: createStorage({ "tech-catalog-theme": "dark" }),
    sessionStorage: createStorage(),
    addEventListener(type, listener) {
      const previous = windowListeners[type];
      windowListeners[type] = previous
        ? (...args) => { previous(...args); listener(...args); }
        : listener;
    },
  };
  return {
    app,
    browserDocument,
    browserWindow,
    cookieValues,
    documentListeners,
    networkStatus,
    root,
    select,
    selectListeners,
    windowListeners,
    getHtmlWrites: () => htmlWrites,
  };
}

// El router usa window y document globales, así que cada prueba los cambia y los restaura.
function useGlobals(t, { browserWindow, browserDocument }) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = browserWindow;
  globalThis.document = browserDocument;
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("startApp restores theme, registers the visit and starts the router", async (t) => {
  const browser = createBrowser();
  const {
    app,
    browserDocument,
    browserWindow,
    cookieValues,
    documentListeners,
    networkStatus,
    root,
    select,
    selectListeners,
    windowListeners,
  } = browser;
  useGlobals(t, browser);

  const { locationService, outboxSync, router, shareService } = startApp({ browserWindow, browserDocument });
  await settle();

  assert.equal(root.dataset.theme, "dark");
  assert.equal(select.value, "dark");
  assert.equal(cookieValues.get("tech-catalog-visits"), "1");
  assert.equal(networkStatus.hidden, true);
  assert.match(app.innerHTML, /Catálogo de tecnología/);
  windowListeners.offline();
  assert.equal(networkStatus.hidden, false);
  assert.match(networkStatus.textContent, /Sin conexión/);
  windowListeners.online();
  assert.equal(networkStatus.hidden, true);
  assert.equal(typeof windowListeners.hashchange, "function");
  assert.equal(typeof windowListeners.beforeinstallprompt, "function", "install capture starts with the app");
  assert.equal(typeof windowListeners.appinstalled, "function");
  assert.equal(outboxSync.mode, "plan-b", "a window without SyncManager starts the outbox in plan B");
  assert.equal(documentListeners.submit.length, 3);
  assert.equal(documentListeners.change.length, 1);
  assert.equal(documentListeners.reset.length, 1, "only the location field listens to the form reset");
  assert.equal(locationService.isSupported(), false, "a navigator without geolocation is not an error");
  assert.equal(await locationService.getPermissionState(), "unsupported");
  assert.equal(shareService.getMode(), "copy", "a navigator without share falls back to copying the link");

  const writesBeforeThemeChange = browser.getHtmlWrites();
  select.value = "light";
  selectListeners.change({ target: select });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    browser.getHtmlWrites(),
    writesBeforeThemeChange,
    "changing the shell theme must not rerender an unrelated view",
  );

  browserWindow.location.hash = "#/persistencia";
  await router.render();
  const writesBeforePersistenceThemeChange = browser.getHtmlWrites();
  select.value = "dark";
  selectListeners.change({ target: select });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(browser.getHtmlWrites() > writesBeforePersistenceThemeChange);
});

test("startApp wires location and sharing to the views without reading the position on its own", async (t) => {
  const positionCalls = [];
  const copied = [];
  const browser = createBrowser({
    location: { hash: "#/sugerencias", search: "?sin-share" },
    isSecureContext: true,
    navigator: {
      onLine: true,
      geolocation: {
        getCurrentPosition(success, _failure, options) {
          positionCalls.push(options);
          success({ coords: { latitude: 19.432608, longitude: -99.133209, accuracy: 30 } });
        },
      },
      permissions: { query: async () => ({ state: "prompt", onchange: null }) },
      share: async () => {
        throw new Error("?sin-share must skip the native menu");
      },
      clipboard: { writeText: async (text) => copied.push(text) },
    },
  });
  const { app, browserDocument, browserWindow, documentListeners } = browser;
  useGlobals(t, browser);
  const database = { getOutbox: async () => [], addToOutbox: async () => {} };
  const click = (target) => Promise.all(documentListeners.click.map((listener) => listener({ target })));

  const { router, shareService } = startApp({ browserWindow, browserDocument, database });
  await settle();

  assert.match(app.innerHTML, /data-location-permission data-state="prompt"/);
  assert.match(app.innerHTML, /data-location-request/);
  assert.equal(positionCalls.length, 0, "rendering and init never ask for the position");

  const locationButton = {
    disabled: false,
    closest: (selector) => (selector === "[data-location-request]" ? locationButton : null),
  };
  await click(locationButton);
  assert.equal(positionCalls.length, 1);
  assert.equal(positionCalls[0].maximumAge, 0);

  browserWindow.location.hash = "#/item/javascript";
  await router.render();
  assert.equal(shareService.getMode(), "copy");
  assert.match(app.innerHTML, /data-share-topic="javascript">Copiar enlace del tema</);

  const shareButton = {
    disabled: false,
    textContent: "",
    dataset: { shareTopic: "javascript" },
    closest: (selector) => (selector === "[data-share-topic]" ? shareButton : null),
  };
  await click(shareButton);
  assert.equal(copied.length, 1);
  assert.match(copied[0], /#\/item\/javascript$/);
  assert.doesNotMatch(copied[0], /sin-share/);
});
