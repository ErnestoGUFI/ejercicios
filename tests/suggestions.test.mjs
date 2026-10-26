import test from "node:test";
import assert from "node:assert/strict";

import SuggestionsController from "../src/controllers/SuggestionsController.js";
import SuggestionsView, { renderOutboxItems } from "../src/views/SuggestionsView.js";

function createOutbox({ mode = "background-sync", pending = [] } = {}) {
  const listeners = new Set();
  return {
    mode,
    pending,
    queued: [],
    retries: 0,
    async getPending() {
      return [...this.pending];
    },
    async enqueue(suggestion) {
      this.queued.push(suggestion);
      this.pending.push({ id: `s-${this.queued.length}`, ...suggestion, createdAt: "2026-10-19T10:00:00.000Z" });
      return { item: suggestion, sending: Promise.resolve("sync") };
    },
    async retryNow() {
      this.retries += 1;
      return "flush";
    },
    subscribe(listener) {
      listeners.add(listener);
    },
    emit(message) {
      return Promise.all([...listeners].map((listener) => listener(message)));
    },
  };
}

function createDocument() {
  const elements = {
    "[data-suggestion-feedback]": { hidden: true, textContent: "", dataset: {} },
    "[data-outbox-confirmation]": { hidden: true, textContent: "" },
    "[data-outbox-list]": { innerHTML: "" },
  };
  const listeners = {};
  return {
    elements,
    listeners,
    querySelector: (selector) => elements[selector] ?? null,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
}

function createForm(values) {
  const button = { disabled: false };
  return {
    button,
    resetCalls: 0,
    elements: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value }])),
    matches: (selector) => selector === "[data-suggestion-form]",
    querySelector: () => button,
    reset() {
      this.resetCalls += 1;
    },
  };
}

test("the suggestions view says it uses Background Sync and hides the manual retry", async () => {
  const html = await SuggestionsView({}, createOutbox());

  assert.match(html, /<h1 id="suggestions-title">Sugerir un tema<\/h1>/);
  assert.match(html, /data-suggestion-form/);
  assert.match(html, /<textarea id="suggestion-comment"/);
  assert.match(html, /data-outbox-mode="background-sync"><strong>Modo: Background Sync\.<\/strong>/);
  assert.doesNotMatch(html, /data-outbox-retry/);
  assert.match(html, /No hay sugerencias pendientes de envío/);
});

test("plan B is stated clearly and offers Reintentar ahora", async () => {
  const html = await SuggestionsView({}, createOutbox({ mode: "plan-b" }));

  assert.match(html, /data-outbox-mode="plan-b"><strong>Modo: reintento manual\.<\/strong>/);
  assert.match(html, /<button class="sw-button sw-button-secondary" type="button" data-outbox-retry>Reintentar ahora<\/button>/);
});

test("pending items show their state and escape what the user typed", () => {
  const html = renderOutboxItems([
    { id: "s-1", topic: "<script>alert(1)</script>", area: "backend", createdAt: "2026-10-19T10:00:00.000Z", lastError: null },
    { id: "s-2", topic: "Rust", area: "backend", createdAt: "2026-10-19T10:05:00.000Z", lastError: "HTTP 500" },
  ]);

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Backend · guardada/);
  assert.match(html, /Pendiente de envío\./);
  assert.match(html, /data-outbox-state="error">Último intento: HTTP 500\. Se volverá a intentar\./);
});

test("pending items say where they were suggested from, escaping the typed place", () => {
  const html = renderOutboxItems([
    { id: "s-1", topic: "Go", area: "backend", createdAt: "2026-10-19T10:00:00.000Z", location: { source: "manual", place: "La Paz, B.C.S." } },
    { id: "s-2", topic: "Rust", area: "backend", createdAt: "2026-10-19T10:05:00.000Z", location: { source: "device", latitude: 37.77, longitude: -122.42, radiusKm: 1, place: null } },
    { id: "s-3", topic: "Deno", area: "backend", createdAt: "2026-10-19T10:10:00.000Z", location: { source: "manual", place: "<b>Centro</b>" } },
    { id: "s-4", topic: "Bun", area: "backend", createdAt: "2026-10-19T10:15:00.000Z", location: null },
  ]);

  assert.match(html, /Backend · desde La Paz, B\.C\.S\. · guardada/);
  assert.match(html, /Backend · zona aprox\. 37\.77, -122\.42 · guardada/);
  assert.match(html, /Backend · desde &lt;b&gt;Centro&lt;\/b&gt; · guardada/);
  assert.doesNotMatch(html, /<b>Centro/);
  assert.equal((html.match(/Backend · guardada/g) ?? []).length, 1);
});

function createLocationService({ supported = true, state = "prompt", fail = false } = {}) {
  return {
    reads: 0,
    isSupported: () => supported,
    async getPermissionState() {
      if (fail) throw new Error("query falló");
      return state;
    },
    async getApproximatePosition() {
      this.reads += 1;
      return { latitude: 37.77, longitude: -122.42, radiusKm: 1 };
    },
  };
}

test("the location field sits between the comment and the submit button without reading the position", async () => {
  const locationService = createLocationService({ state: "granted" });
  const html = await SuggestionsView({}, createOutbox(), locationService);

  const comment = html.indexOf("suggestion-comment-field");
  const field = html.indexOf('class="location-field"');
  const submit = html.indexOf("Enviar sugerencia");
  assert.ok(comment < field && field < submit);
  assert.match(html, /data-location-permission data-state="granted"/);
  assert.match(html, /data-location-request/);
  assert.match(html, /name="suggestion-location"/);
  assert.equal(locationService.reads, 0);
});

test("the permission line falls back to unknown or unsupported without breaking the form", async () => {
  const failing = await SuggestionsView({}, createOutbox(), createLocationService({ fail: true }));
  assert.match(failing, /data-location-permission data-state="unknown"/);
  assert.match(failing, /data-location-request/);

  const unsupported = await SuggestionsView({}, createOutbox(), createLocationService({ supported: false }));
  assert.match(unsupported, /data-location-permission data-state="unsupported"/);
  assert.doesNotMatch(unsupported, /data-location-request/);
  assert.match(unsupported, /id="suggestion-place"/);

  const withoutService = await SuggestionsView({}, createOutbox());
  assert.match(withoutService, /data-location-permission data-state="unsupported"/);
  assert.match(withoutService, /data-suggestion-form/);
});

test("submitting the form queues the suggestion and reports that it was saved", async () => {
  const document = createDocument();
  const outboxSync = createOutbox();
  new SuggestionsController({ document, outboxSync }).init();
  const form = createForm({
    "suggestion-topic": "  Docker ",
    "suggestion-area": "backend",
    "suggestion-comment": " Contenedores para desplegar ",
  });

  await document.listeners.submit({ target: form, preventDefault() {} });

  assert.deepEqual(outboxSync.queued, [{ topic: "Docker", area: "backend", comment: "Contenedores para desplegar", location: null }]);
  assert.equal(form.resetCalls, 1);
  assert.equal(form.button.disabled, false);
  assert.equal(document.elements["[data-suggestion-feedback]"].textContent, "La sugerencia quedó guardada en la cola de envío.");
});

test("an attached device location is read before the reset and queued with the suggestion", async () => {
  const document = createDocument();
  const outboxSync = createOutbox();
  new SuggestionsController({ document, outboxSync }).init();
  const form = createForm({
    "suggestion-topic": "Docker",
    "suggestion-area": "backend",
    "suggestion-comment": "Contenedores",
    "suggestion-location": '{"latitude":37.774929,"longitude":-122.419416,"radiusKm":1}',
    "suggestion-place": "  ",
  });
  // Igual que en el navegador: el evento reset vacía el campo oculto.
  form.reset = function reset() {
    this.resetCalls += 1;
    this.elements["suggestion-location"].value = "";
  };

  await document.listeners.submit({ target: form, preventDefault() {} });

  assert.deepEqual(outboxSync.queued[0].location, {
    source: "device",
    latitude: 37.77,
    longitude: -122.42,
    radiusKm: 1,
    place: null,
  });
  assert.equal(form.resetCalls, 1);
  assert.equal(form.elements["suggestion-location"].value, "");
  assert.equal(
    document.elements["[data-suggestion-feedback]"].textContent,
    "La sugerencia quedó guardada en la cola de envío con tu ubicación aproximada.",
  );
});

test("a typed city is queued as a manual location and keeps the usual message", async () => {
  const document = createDocument();
  const outboxSync = createOutbox();
  new SuggestionsController({ document, outboxSync }).init();
  const form = createForm({
    "suggestion-topic": "Rust",
    "suggestion-area": "backend",
    "suggestion-comment": "Sistemas",
    "suggestion-location": "",
    "suggestion-place": " La Paz, B.C.S. ",
  });

  await document.listeners.submit({ target: form, preventDefault() {} });

  assert.deepEqual(outboxSync.queued[0].location, { source: "manual", place: "La Paz, B.C.S." });
  assert.equal(document.elements["[data-suggestion-feedback]"].textContent, "La sugerencia quedó guardada en la cola de envío.");
});

test("service worker messages update the confirmation and the pending list", async () => {
  const document = createDocument();
  const outboxSync = createOutbox({ pending: [{ id: "s-9", topic: "Rust", area: "backend", createdAt: "2026-10-19T10:00:00.000Z", lastError: "HTTP 500" }] });
  new SuggestionsController({ document, outboxSync }).init();

  await outboxSync.emit({ type: "outbox-failed", topic: "Rust", reason: "HTTP 500" });
  assert.match(document.elements["[data-outbox-confirmation]"].textContent, /No se pudo enviar «Rust» \(HTTP 500\)\. Sigue en la cola/);
  assert.match(document.elements["[data-outbox-list]"].innerHTML, /Rust/);

  outboxSync.pending = [];
  await outboxSync.emit({ type: "outbox-sent", topic: "Rust", status: 201, serverId: 101 });
  assert.equal(document.elements["[data-outbox-confirmation]"].textContent, "«Rust» se envió: el servidor respondió 201 (id 101).");
  assert.match(document.elements["[data-outbox-list]"].innerHTML, /No hay sugerencias pendientes/);
});

test("Reintentar ahora asks the outbox to send again", async () => {
  const document = createDocument();
  const outboxSync = createOutbox({ mode: "plan-b" });
  new SuggestionsController({ document, outboxSync }).init();

  await document.listeners.click({ target: { closest: (selector) => (selector === "[data-outbox-retry]" ? {} : null) } });

  assert.equal(outboxSync.retries, 1);
  assert.equal(document.elements["[data-outbox-confirmation]"].textContent, "Reintentando el envío de la cola…");
});
