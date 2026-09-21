import test from "node:test";
import assert from "node:assert/strict";

import {
  registerServiceWorker,
  scheduleServiceWorkerRegistration,
} from "../src/pwa/registerSW.js";

const config = {
  scriptUrl: "https://example.com/app/sw.js",
  scope: "/app/",
};

test("registerServiceWorker reports when the browser has no Service Worker support", async () => {
  const messages = [];
  const result = await registerServiceWorker({
    navigatorObject: {},
    config,
    logger: { info: (message) => messages.push(message), error() {} },
  });

  assert.deepEqual(result, {
    supported: false,
    registered: false,
    registration: null,
    error: null,
  });
  assert.match(messages[0], /no soporta Service Workers/i);
});

test("registerServiceWorker registers the configured script with its explicit scope", async () => {
  const calls = [];
  const registration = { scope: "https://example.com/app/" };
  const result = await registerServiceWorker({
    navigatorObject: {
      serviceWorker: {
        register: async (...args) => {
          calls.push(args);
          return registration;
        },
      },
    },
    config,
    logger: { info() {}, error() {} },
  });

  assert.deepEqual(calls, [[config.scriptUrl, { scope: config.scope }]]);
  assert.equal(result.registered, true);
  assert.equal(result.registration, registration);
});

test("registerServiceWorker catches registration errors and reports them clearly", async () => {
  const errors = [];
  const failure = new Error("scope denied");
  const result = await registerServiceWorker({
    navigatorObject: {
      serviceWorker: { register: async () => Promise.reject(failure) },
    },
    config,
    logger: { info() {}, error: (...args) => errors.push(args) },
  });

  assert.equal(result.registered, false);
  assert.equal(result.error, failure);
  assert.match(errors[0][0], /No se pudo registrar/i);
});

test("scheduleServiceWorkerRegistration waits for the window load event", async () => {
  let loadHandler;
  let registrations = 0;
  const browserWindow = {
    addEventListener(type, listener, options) {
      assert.equal(type, "load");
      assert.deepEqual(options, { once: true });
      loadHandler = listener;
    },
  };

  scheduleServiceWorkerRegistration(browserWindow, async () => {
    registrations += 1;
  });

  assert.equal(registrations, 0);
  await loadHandler();
  assert.equal(registrations, 1);
});
