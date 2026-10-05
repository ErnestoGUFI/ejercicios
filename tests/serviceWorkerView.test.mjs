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

test("ServiceWorkerView renders Cache Storage inspection and the runtime-cache exercise", async () => {
  const html = await ServiceWorkerView({}, {
    getSnapshot: async () => ({
      supported: true,
      secureContext: true,
      registered: true,
      scope: "https://example.com/ejercicios/",
      scriptUrl: "https://example.com/ejercicios/sw.js",
      workerState: "activated",
      controlled: true,
      controllerScriptUrl: "https://example.com/ejercicios/sw.js",
      scopeChecks: [],
      registrations: [],
      narrowPageUrl: "https://example.com/ejercicios/scope-demo/",
    }),
  }, {
    listEntries: async () => ({
      cacheName: "tech-catalogo-shell-v4",
      entries: [{
        url: "https://example.com/ejercicios/cache-demo.json?x=<script>",
        path: "/ejercicios/cache-demo.json?x=&lt;script&gt;",
        status: 200,
        contentType: "application/json",
      }],
    }),
  });

  assert.match(html, /Cache Storage/);
  assert.match(html, /tech-catalogo-shell-v4/);
  assert.match(html, /cache-demo\.json/);
  assert.match(html, /data-refresh-cache/);
  assert.match(html, /data-delete-cache-entry/);
  assert.match(html, /data-load-cache-demo/);
  assert.match(html, /data-cache-demo-output/);
  assert.match(html, /cambia su contenido en el servidor sin cambiar la versión/);
  assert.doesNotMatch(html, /<script>/);
});

test("ServiceWorkerView shows an empty-state message when Cache Storage is empty", async () => {
  const html = await ServiceWorkerView({}, {
    getSnapshot: async () => ({
      scopeChecks: [],
      registrations: [],
    }),
  }, {
    listEntries: async () => ({ cacheName: "tech-catalogo-shell-v4", entries: [] }),
  });

  assert.match(html, /La caché todavía no tiene entradas/);
});

test("ServiceWorkerView explains and disables the demo until the Service Worker controls the page", async () => {
  const html = await ServiceWorkerView({}, {
    getSnapshot: async () => ({
      supported: true,
      secureContext: true,
      registered: true,
      workerState: "activated",
      controlled: false,
      scopeChecks: [],
      registrations: [],
    }),
  }, {
    listEntries: async () => ({ cacheName: "tech-catalogo-shell-v4", entries: [] }),
  });

  assert.match(html, /todavía no controla esta pestaña/i);
  assert.match(html, /vuelve a cargar la página/i);
  assert.match(html, /data-load-cache-demo disabled/);
});

test("ServiceWorkerView keeps the demo disabled while a new worker is waiting to activate", async () => {
  const html = await ServiceWorkerView({}, {
    getSnapshot: async () => ({
      supported: true,
      secureContext: true,
      registered: true,
      workerState: "installed",
      controlled: true,
      scopeChecks: [],
      registrations: [],
    }),
  }, {
    listEntries: async () => ({ cacheName: "tech-catalogo-shell-v4", entries: [] }),
  });

  assert.match(html, /versión del Service Worker instalada y esperando activación/i);
  assert.match(html, /data-load-cache-demo disabled/);
});

test("ServiceWorkerView gives an accessible notice while the worker is activating", async () => {
  const html = await ServiceWorkerView({}, {
    getSnapshot: async () => ({
      supported: true,
      secureContext: true,
      registered: true,
      workerState: "activating",
      controlled: true,
      scopeChecks: [],
      registrations: [],
    }),
  }, {
    listEntries: async () => ({ cacheName: "tech-catalogo-shell-v4", entries: [] }),
  });

  assert.match(html, /Service Worker se está activando/i);
  assert.match(html, /id="cache-control-note"/);
  assert.match(html, /data-load-cache-demo disabled aria-describedby="cache-control-note"/);
});

test("ServiceWorkerView distinguishes a worker that is still installing", async () => {
  const html = await ServiceWorkerView({}, {
    getSnapshot: async () => ({
      supported: true,
      secureContext: true,
      registered: true,
      workerState: "installing",
      controlled: false,
      scopeChecks: [],
      registrations: [],
    }),
  }, {
    listEntries: async () => ({ cacheName: "tech-catalogo-shell-v4", entries: [] }),
  });

  assert.match(html, /se está instalando/i);
  assert.doesNotMatch(html, /instalada y esperando activación/);
});
