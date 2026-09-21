import test from "node:test";
import assert from "node:assert/strict";

import {
  ServiceWorkerDiagnostics,
  isUrlWithinScope,
} from "../src/pwa/diagnostics.js";

const config = {
  baseUrl: "https://example.com/ejercicios/",
  scriptUrl: "https://example.com/ejercicios/sw.js",
  scope: "/ejercicios/",
  narrowScope: "/ejercicios/scope-demo/",
  narrowPageUrl: "https://example.com/ejercicios/scope-demo/",
  invalidScriptUrl: "https://example.com/ejercicios/scope-test/sw.js",
  invalidScope: "/ejercicios/",
};

test("isUrlWithinScope requires the same origin and a matching path prefix", () => {
  const scope = "https://example.com/ejercicios/";

  assert.equal(isUrlWithinScope("https://example.com/ejercicios/#/guardados", scope), true);
  assert.equal(isUrlWithinScope("https://example.com/ejercicios/src/main.js", scope), true);
  assert.equal(isUrlWithinScope("https://example.com/ejercicios", scope), false);
  assert.equal(isUrlWithinScope("https://other.example/ejercicios/", scope), false);
});

test("getScopeChecks includes every route requested by the exercise", () => {
  const diagnostics = new ServiceWorkerDiagnostics({ config });
  const checks = diagnostics.getScopeChecks();

  assert.equal(checks.length >= 5, true);
  assert.deepEqual(
    checks.slice(0, 5).map(({ label, withinScope }) => [label, withinScope]),
    [
      ["Raíz de la aplicación", true],
      ["Ruta del router", true],
      ["Archivo interno", true],
      ["Raíz sin diagonal final", false],
      ["Ruta fuera del proyecto", false],
    ],
  );
});

test("getSnapshot reports support, security, registration, worker and controller state", async () => {
  const registration = {
    scope: "https://example.com/ejercicios/",
    active: {
      state: "activated",
      scriptURL: "https://example.com/ejercicios/sw.js",
    },
  };
  const narrowRegistration = {
    scope: "https://example.com/ejercicios/scope-demo/",
    waiting: {
      state: "installed",
      scriptURL: "https://example.com/ejercicios/sw.js",
    },
  };
  const serviceWorker = {
    controller: { scriptURL: "https://example.com/ejercicios/sw.js" },
    getRegistration: async (scope) => {
      assert.equal(scope, config.scope);
      return registration;
    },
    getRegistrations: async () => [registration, narrowRegistration],
  };
  const diagnostics = new ServiceWorkerDiagnostics({
    navigatorObject: { serviceWorker },
    windowObject: { isSecureContext: true },
    config,
  });

  const snapshot = await diagnostics.getSnapshot();

  assert.equal(snapshot.supported, true);
  assert.equal(snapshot.secureContext, true);
  assert.equal(snapshot.registered, true);
  assert.equal(snapshot.scope, registration.scope);
  assert.equal(snapshot.scriptUrl, registration.active.scriptURL);
  assert.equal(snapshot.workerState, "activated");
  assert.equal(snapshot.controlled, true);
  assert.equal(snapshot.controllerScriptUrl, serviceWorker.controller.scriptURL);
  assert.equal(snapshot.registrations.length, 2);
  assert.equal(snapshot.scopeChecks.length >= 5, true);
});

test("getSnapshot returns a useful unsupported state without calling browser APIs", async () => {
  const diagnostics = new ServiceWorkerDiagnostics({
    navigatorObject: {},
    windowObject: { isSecureContext: false },
    config,
  });

  const snapshot = await diagnostics.getSnapshot();

  assert.equal(snapshot.supported, false);
  assert.equal(snapshot.registered, false);
  assert.equal(snapshot.controlled, false);
  assert.deepEqual(snapshot.registrations, []);
});

test("tryInvalidScope attempts the intentionally broader scope and exposes the browser error", async () => {
  const failure = Object.assign(new Error("The path of the provided scope is not allowed"), {
    name: "SecurityError",
  });
  const calls = [];
  const diagnostics = new ServiceWorkerDiagnostics({
    navigatorObject: {
      serviceWorker: {
        register: async (...args) => {
          calls.push(args);
          throw failure;
        },
      },
    },
    config,
  });

  const result = await diagnostics.tryInvalidScope();

  assert.deepEqual(calls, [[config.invalidScriptUrl, { scope: config.invalidScope }]]);
  assert.equal(result.ok, false);
  assert.equal(result.errorName, "SecurityError");
  assert.match(result.message, /scope is not allowed/i);
});

test("registerNarrowScope creates the optional registration using the same root sw.js", async () => {
  const calls = [];
  const registration = { scope: "https://example.com/ejercicios/scope-demo/" };
  const diagnostics = new ServiceWorkerDiagnostics({
    navigatorObject: {
      serviceWorker: {
        register: async (...args) => {
          calls.push(args);
          return registration;
        },
      },
    },
    config,
  });

  const result = await diagnostics.registerNarrowScope();

  assert.deepEqual(calls, [[config.scriptUrl, { scope: config.narrowScope }]]);
  assert.equal(result.ok, true);
  assert.equal(result.registration, registration);
});
