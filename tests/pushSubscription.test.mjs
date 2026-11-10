import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { base64UrlToBytes, createPushSubscription } from "../src/pwa/pushSubscription.js";
import initNotificationControl, { NOTIFICATION_LABELS, NOTIFICATION_MESSAGES } from "../src/components/NotificationControl.js";

const backendSource = await readFile(new URL("../src/pwa/backend.js", import.meta.url), "utf8");

function loadBackend() {
  const scope = {};
  vm.runInNewContext(backendSource, { self: scope });
  return scope.TechBackend;
}

test("backend.js is the single place with the backend URLs and exposes a frozen config", () => {
  const { config } = loadBackend();

  assert.ok(Object.isFrozen(config));
  assert.match(config.apiUrl, /^https:\/\/.+\.supabase\.co\/functions\/v1\/api$/);
  assert.match(config.authUrl, /^https:\/\/.+\.supabase\.co\/auth\/v1$/);
});

function createSessionStore(initial = null) {
  let saved = initial;
  return {
    get: async () => saved,
    set: async (session) => { saved = session; },
    peek: () => saved,
  };
}

test("the backend client signs in anonymously once, refreshes before expiry and retries a 401 after refreshing", async () => {
  const { config, createBackendClient } = loadBackend();
  const calls = [];
  let issued = 0;
  let apiStatus = [200];
  const fetcher = async (url, options) => {
    calls.push([options.method, url.replace(config.apiUrl, "api").replace(config.authUrl, "auth"), options.headers.Authorization]);
    if (url.startsWith(config.authUrl)) {
      issued += 1;
      return { ok: true, status: 200, json: async () => ({ access_token: `t${issued}`, refresh_token: `r${issued}`, expires_in: 3600, user: { id: "u1" } }) };
    }
    return { ok: true, status: apiStatus.shift() ?? 200 };
  };
  let clock = 0;
  const store = createSessionStore();
  const client = createBackendClient({ sessionStore: store, fetcher, now: () => clock });

  await Promise.all([client.request("/a"), client.request("/b")]);
  assert.deepEqual(calls.slice(0, 1), [["POST", "auth/signup", undefined]]);
  assert.equal(calls.filter(([, url]) => url.startsWith("auth")).length, 1);
  assert.equal(store.peek().userId, "u1");

  clock = 3600 * 1000 - 30 * 1000;
  await client.request("/c");
  assert.deepEqual(calls.at(-2), ["POST", "auth/token?grant_type=refresh_token", undefined]);
  assert.deepEqual(calls.at(-1), ["GET", "api/c", "Bearer t2"]);

  apiStatus = [401, 200];
  const response = await client.request("/d", { method: "POST", body: { x: 1 } });
  assert.equal(response.status, 200);
  // Un 401 renueva con el refresh token: el usuario sigue siendo el mismo.
  assert.deepEqual(calls.slice(-3).map(([method, url, token]) => [method, url, token]), [
    ["POST", "api/d", "Bearer t2"],
    ["POST", "auth/token?grant_type=refresh_token", undefined],
    ["POST", "api/d", "Bearer t3"],
  ]);
  assert.equal(calls.filter(([, url]) => url === "auth/signup").length, 1);

  await client.request("/push/public-key", { auth: false });
  assert.deepEqual(calls.at(-1), ["GET", "api/push/public-key", undefined]);
});

test("base64UrlToBytes decodes the VAPID public key", () => {
  assert.deepEqual([...base64UrlToBytes("AQID_-8")], [1, 2, 3, 255, 239]);
});

function createPushWindow({ permission = "granted", existing = null, key = "AQID" } = {}) {
  const log = [];
  let current = existing;
  const pushManager = {
    getSubscription: async () => current,
    async subscribe(options) {
      log.push(["subscribe", options.userVisibleOnly, [...options.applicationServerKey]]);
      current = createSubscription("https://push.example/nueva", options.applicationServerKey);
      return current;
    },
  };
  function createSubscription(endpoint, applicationServerKey) {
    return {
      endpoint,
      options: { applicationServerKey: applicationServerKey.buffer ?? applicationServerKey },
      toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
      async unsubscribe() {
        log.push(["unsubscribe", endpoint]);
        current = null;
        return true;
      },
    };
  }
  const backendResponses = [];
  const backend = {
    async request(path, options = {}) {
      log.push(["backend", options.method ?? "GET", path, options.body?.endpoint ?? null]);
      const next = backendResponses.shift();
      if (next instanceof Error) throw next;
      if (path === "/push/public-key") return { ok: true, status: 200, json: async () => ({ publicKey: key }) };
      return next ?? { ok: true, status: options.method === "DELETE" ? 204 : 201, json: async () => ({}) };
    },
  };
  const browserWindow = {
    PushManager: function PushManager() {},
    Notification: { permission },
    navigator: { serviceWorker: {} },
  };
  return {
    log,
    backend,
    backendResponses,
    browserWindow,
    createSubscription,
    service: createPushSubscription({ browserWindow, backend, getRegistration: async () => ({ pushManager }), logger: { warn() {} } }),
  };
}

test("subscribe asks for a user-visible subscription with the backend key and sends it to the backend", async () => {
  const { service, log } = createPushWindow();

  await service.subscribe();

  assert.deepEqual(log, [
    ["backend", "GET", "/push/public-key", null],
    ["subscribe", true, [1, 2, 3]],
    ["backend", "POST", "/push/subscriptions", "https://push.example/nueva"],
  ]);
  assert.equal(await service.isSubscribed(), true);
});

test("if the VAPID key changed, the old subscription is replaced before saving", async () => {
  const setupWindow = createPushWindow({ key: "AQID" });
  const old = setupWindow.createSubscription("https://push.example/vieja", new Uint8Array([9, 9, 9]));
  const { service, log } = createPushWindow({ key: "AQID", existing: old });

  await service.subscribe();

  // La suscripción vieja (firmada con otra llave) se da de baja antes de crear la nueva.
  assert.deepEqual(setupWindow.log, [["unsubscribe", "https://push.example/vieja"]]);
  assert.deepEqual(log.map(([kind, ...rest]) => [kind, rest.at(-1)]), [
    ["backend", null],
    ["subscribe", [1, 2, 3]],
    ["backend", "https://push.example/nueva"],
  ]);
});

test("unsubscribe removes it from the backend and from the browser, even if the backend fails", async () => {
  const { service, log, backendResponses, createSubscription } = createPushWindow();
  await service.subscribe();
  log.length = 0;

  backendResponses.push(new TypeError("Failed to fetch"));
  await assert.rejects(service.unsubscribe(), /Failed to fetch/);

  assert.deepEqual(log, [
    ["backend", "DELETE", "/push/subscriptions", "https://push.example/nueva"],
    ["unsubscribe", "https://push.example/nueva"],
  ]);
  assert.equal(await service.isSubscribed(), false);
  assert.ok(createSubscription);
});

test("resync re-sends an existing subscription when the app opens, and only with the permission granted", async () => {
  const existing = createPushWindow().createSubscription("https://push.example/actual", new Uint8Array([1, 2, 3]));
  const opened = createPushWindow({ existing });
  assert.equal(await opened.service.resync(), true);
  assert.deepEqual(opened.log.at(-1), ["backend", "POST", "/push/subscriptions", "https://push.example/actual"]);

  const offline = createPushWindow({ existing });
  offline.backendResponses.push(new TypeError("Failed to fetch"));
  assert.equal(await offline.service.resync(), true);

  const notSubscribed = createPushWindow();
  assert.equal(await notSubscribed.service.resync(), false);
  assert.deepEqual(notSubscribed.log, []);

  const denied = createPushWindow({ permission: "denied", existing });
  assert.equal(await denied.service.resync(), false);
  assert.deepEqual(denied.log, []);
});

function createControl({ permission = "default", decide = "granted", subscribed = false, failSubscribe = false } = {}) {
  let state = permission;
  const listeners = new Set();
  const calls = [];
  const notificationPermission = {
    getState: () => state,
    async request() {
      calls.push("permission");
      if (state === "default") state = decide;
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const pushSubscription = {
    supported: true,
    async subscribe() {
      calls.push("subscribe");
      if (failSubscribe) throw new Error("503");
      subscribed = true;
    },
    async unsubscribe() {
      calls.push("unsubscribe");
      subscribed = false;
    },
    resync: async () => subscribed,
  };
  const handlers = {};
  const button = {
    hidden: false,
    disabled: false,
    textContent: "",
    dataset: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, handler) { handlers[type] = handler; },
  };
  const message = { textContent: "" };
  const hint = { hidden: true, querySelector: (selector) => (selector === "[data-notification-message]" ? message : null) };
  initNotificationControl({ button, hint, notificationPermission, pushSubscription });
  return { button, hint, message, calls, click: () => handlers.click() };
}

test("the shell control subscribes after the permission and unsubscribes from the same button", async () => {
  const control = createControl();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(control.button.textContent, NOTIFICATION_LABELS.default);

  await control.click();
  assert.deepEqual(control.calls, ["permission", "subscribe"]);
  assert.equal(control.button.textContent, NOTIFICATION_LABELS.granted);
  assert.equal(control.button.attributes["aria-pressed"], "true");
  assert.equal(control.button.disabled, false);
  assert.equal(control.message.textContent, NOTIFICATION_MESSAGES.subscribed);

  await control.click();
  assert.deepEqual(control.calls, ["permission", "subscribe", "unsubscribe"]);
  assert.equal(control.button.textContent, NOTIFICATION_LABELS.default);
  assert.equal(control.button.attributes["aria-pressed"], "false");
  assert.equal(control.message.textContent, NOTIFICATION_MESSAGES.unsubscribed);
});

test("an already subscribed device opens with Avisos activados; a failed subscription explains it", async () => {
  const subscribed = createControl({ permission: "granted", subscribed: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(subscribed.button.textContent, NOTIFICATION_LABELS.granted);
  assert.equal(subscribed.hint.hidden, true);

  const failing = createControl({ permission: "granted", failSubscribe: true });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await failing.click();
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(failing.calls, ["permission", "subscribe"]);
  assert.equal(failing.button.textContent, NOTIFICATION_LABELS.default);
  assert.equal(failing.message.textContent, `${NOTIFICATION_MESSAGES.failed} (Detalle: Error: 503)`);
});

test("a refresh token rejected by Supabase starts a new anonymous user; a network failure keeps the session", async () => {
  const { config, createBackendClient } = loadBackend();
  const store = createSessionStore({ userId: "u1", accessToken: "viejo", refreshToken: "r1", expiresAt: 0 });
  let refreshStatus = 503;
  const fetcher = async (url) => {
    if (url.includes("grant_type=refresh_token")) return { ok: false, status: refreshStatus };
    if (url.endsWith("/signup")) return { ok: true, status: 200, json: async () => ({ access_token: "nuevo", refresh_token: "r2", expires_in: 3600, user: { id: "u2" } }) };
    return { ok: true, status: 200 };
  };
  const client = createBackendClient({ sessionStore: store, fetcher, now: () => 1000 });

  await assert.rejects(client.request("/x"), /503/);
  assert.equal(store.peek().userId, "u1");

  refreshStatus = 400;
  await client.request("/x");
  assert.equal(store.peek().userId, "u2");
  assert.ok(config.authUrl);
});

test("if the backend cannot save a new subscription, it is removed from the browser too", async () => {
  const { service, log, backendResponses } = createPushWindow();
  // La primera respuesta es la llave pública; la segunda, el guardado que falla.
  backendResponses.push(undefined, { ok: false, status: 503 });

  await assert.rejects(service.subscribe(), /503/);

  assert.deepEqual(log.map(([kind]) => kind), ["backend", "subscribe", "backend", "unsubscribe"]);
  assert.equal(await service.isSubscribed(), false);
});

test("turning avisos on and off is stored for the service worker", async () => {
  const saved = [];
  const window = createPushWindow();
  const service = createPushSubscription({
    browserWindow: window.browserWindow,
    backend: window.backend,
    getRegistration: async () => ({ pushManager: { getSubscription: async () => window.current ?? null, subscribe: async () => (window.current = window.createSubscription("https://push.example/z", new Uint8Array([1, 2, 3]))) } }),
    setNotificationsEnabled: async (enabled) => saved.push(enabled),
  });

  await service.subscribe();
  await service.unsubscribe();

  assert.deepEqual(saved, [true, false]);
});

test("resync reports false when a VAPID rotation could not create the new subscription", async () => {
  const old = createPushWindow().createSubscription("https://push.example/vieja", new Uint8Array([9]));
  let current = old;
  old.unsubscribe = async () => { current = null; };
  const window = createPushWindow({ existing: old });
  const service = createPushSubscription({
    browserWindow: window.browserWindow,
    backend: window.backend,
    getRegistration: async () => ({ pushManager: { getSubscription: async () => current, subscribe: async () => { throw new Error("AbortError"); } } }),
    logger: { warn() {} },
  });

  assert.equal(await service.resync(), false);
});

test("without Push API the granted permission turns on the local avisos, as in exercise 5", async () => {
  const saved = [];
  const button = { dataset: {}, setAttribute() {}, addEventListener() {} };
  const notificationPermission = { getState: () => "granted", subscribe: () => () => {}, request: async () => "granted" };

  initNotificationControl({ button, notificationPermission, pushSubscription: { supported: false }, setNotificationsEnabled: async (value) => saved.push(value) });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(saved, [true]);
  assert.equal(button.textContent, NOTIFICATION_LABELS.granted);
  assert.equal(button.disabled, true);
});

test("the VAPID key is fetched once when the app opens, so the tap goes straight to pushManager.subscribe", async () => {
  const { service, log } = createPushWindow();

  assert.equal(await service.prepare(), true);
  log.length = 0;
  await service.subscribe();

  // Lo primero tras el toque es pushManager.subscribe(); la llave ya estaba descargada.
  assert.deepEqual(log.map(([kind]) => kind), ["subscribe", "backend"]);
  assert.equal(log.filter(([, , path]) => path === "/push/public-key").length, 0);
});
