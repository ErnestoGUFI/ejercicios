import test from "node:test";
import assert from "node:assert/strict";

import ServiceWorkerView from "../src/views/ServiceWorkerView.js";

test("ServiceWorkerView renders the full diagnostic, scope verifier and optional challenge", async () => {
  const diagnostics = {
    getSnapshot: async () => ({
      supported: true,
      secureContext: true,
      registered: true,
      scope: "https://example.com/ejercicios/",
      scriptUrl: "https://example.com/ejercicios/sw.js",
      workerState: "activated",
      controlled: true,
      controllerScriptUrl: "https://example.com/ejercicios/sw.js",
      scopeChecks: [
        {
          label: "Raíz de la aplicación",
          url: "https://example.com/ejercicios/",
          withinScope: true,
        },
        {
          label: "Ruta fuera del proyecto",
          url: "https://other.example/",
          withinScope: false,
        },
      ],
      registrations: [
        {
          scope: "https://example.com/ejercicios/",
          scriptUrl: "https://example.com/ejercicios/sw.js",
          state: "activated",
        },
        {
          scope: "https://example.com/ejercicios/scope-demo/",
          scriptUrl: "https://example.com/ejercicios/sw.js",
          state: "installed",
        },
      ],
      narrowPageUrl: "https://example.com/ejercicios/scope-demo/",
    }),
  };

  const html = await ServiceWorkerView({}, diagnostics);

  assert.match(html, /Diagnóstico de Service Worker/);
  assert.match(html, /Sí, es compatible/);
  assert.match(html, /Contexto seguro/);
  assert.match(html, /activated/);
  assert.match(html, /Actualizar estado/);
  assert.match(html, /Probar scope inválido/);
  assert.match(html, /Registrar scope estrecho/);
  assert.match(html, /data-sw-scope-table/);
  assert.match(html, /Raíz de la aplicación/);
  assert.match(html, /Fuera/);
  assert.match(html, /Registros encontrados/);
  assert.match(html, /scope-demo/);
  assert.match(html, /scope más específico/i);
});

test("ServiceWorkerView keeps diagnostic failures visible instead of breaking the router", async () => {
  const html = await ServiceWorkerView({}, {
    getSnapshot: async () => Promise.reject(new Error("permission denied")),
  });

  assert.match(html, /No se pudo consultar el estado/);
  assert.match(html, /Actualizar estado/);
});
