import test from "node:test";
import assert from "node:assert/strict";

import {
  SUGGESTION_PUSH_OPTIONS,
  createApi,
  createPushSender,
  parseLocation,
  parseSubscription,
  readAllowedOrigins,
  suggestionPushMessage,
} from "../supabase/functions/api/handler.js";

const SITE = "https://ernestogufi.github.io";
const API = "https://proyecto.supabase.co/functions/v1/api";
const silent = { info() {}, warn() {}, error() {} };

function createStore(subscriptions = []) {
  const rows = new Map(subscriptions.map((row) => [row.endpoint, row]));
  const suggestions = new Map();
  return {
    rows,
    suggestions,
    async listSubscriptions(userId) {
      return [...rows.values()].filter((row) => row.user_id === userId);
    },
    async findSubscription(endpoint) {
      return rows.get(endpoint) ?? null;
    },
    async saveSubscription(row) {
      rows.set(row.endpoint, row);
    },
    async deleteSubscription(endpoint, userId) {
      if (!userId || rows.get(endpoint)?.user_id === userId) rows.delete(endpoint);
    },
    async createSuggestion(userId, suggestion) {
      const key = `${userId}:${suggestion.clientId}`;
      if (suggestions.has(key)) return { id: suggestions.get(key).id, created: false };
      suggestions.set(key, { id: `s-${suggestions.size + 1}`, ...suggestion });
      return { id: suggestions.get(key).id, created: true };
    },
  };
}

function setup({ subscriptions = [] } = {}) {
  const store = createStore(subscriptions);
  const pushes = [];
  const background = [];
  const api = createApi({
    allowedOrigins: [SITE],
    publicKey: "llave-publica",
    auth: { getUser: async (token) => ({ "token-ana": { id: "ana" }, "token-beto": { id: "beto" } })[token] ?? null },
    store,
    sender: { sendToUser: async (...args) => pushes.push(args) },
    runInBackground: (promise) => background.push(promise),
    logger: silent,
  });
  const call = (method, path, { body, token = "token-ana", origin = SITE } = {}) => api(new Request(`${API}${path}`, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { store, pushes, background, call };
}

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "BClave", auth: "secreto" },
};

test("CORS only allows the exact GitHub Pages origin, without the repo path and without *", async () => {
  const { call } = setup();

  const preflight = await call("OPTIONS", "/push/subscriptions", { token: null });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), SITE);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers"), /Authorization/);

  const foreign = await call("GET", "/push/public-key", { origin: "https://otro.github.io" });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get("Access-Control-Allow-Origin"), null);

  assert.deepEqual(readAllowedOrigins(" https://ernestogufi.github.io , "), [SITE]);
});

test("the public key is served without a session; every other route needs one", async () => {
  const { call } = setup();

  const key = await call("GET", "/push/public-key", { token: null });
  assert.equal(key.status, 200);
  assert.deepEqual(await key.json(), { publicKey: "llave-publica" });

  assert.equal((await call("POST", "/push/subscriptions", { body: subscription, token: null })).status, 401);
  assert.equal((await call("POST", "/push/subscriptions", { body: subscription, token: "token-vencido" })).status, 401);
  assert.equal((await call("POST", "/push/enviar", { body: {} })).status, 404);
});

test("a subscription is stored with the session's user and removed only by its owner", async () => {
  const { call, store } = setup();

  assert.equal((await call("POST", "/push/subscriptions", { body: subscription })).status, 201);
  assert.deepEqual(
    { ...store.rows.get(subscription.endpoint), user_agent: undefined },
    { endpoint: subscription.endpoint, p256dh: "BClave", auth: "secreto", user_id: "ana", user_agent: undefined },
  );

  assert.equal((await call("POST", "/push/subscriptions", { body: { endpoint: "http://inseguro/", keys: subscription.keys } })).status, 400);
  assert.equal((await call("DELETE", "/push/subscriptions", { body: { endpoint: subscription.endpoint } })).status, 204);
  assert.equal(store.rows.size, 0);
});

test("a new suggestion is the event that sends the push; a Background Sync retry does not repeat it", async () => {
  const { call, pushes, background } = setup();
  const body = { clientId: "c1", title: "Docker", body: "Contenedores", area: "backend", createdAt: "2026-11-10T10:00:00.000Z" };

  const first = await call("POST", "/suggestions", { body });
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { id: "s-1" });
  assert.equal(background.length, 1);
  assert.deepEqual(pushes, [["ana", suggestionPushMessage({ topic: "Docker" }), SUGGESTION_PUSH_OPTIONS]]);

  const retry = await call("POST", "/suggestions", { body });
  assert.equal(retry.status, 200);
  assert.equal(pushes.length, 1);

  assert.equal((await call("POST", "/suggestions", { body: { title: "Sin id" } })).status, 400);
});

test("the push message uses a relative route and a TTL of one hour", () => {
  assert.deepEqual(suggestionPushMessage({ topic: "Rust" }), {
    title: "Sugerencia recibida",
    body: "Guardamos «Rust» en el servidor. Toca para ver tus envíos.",
    url: "#/sugerencias",
    tag: "sugerencias-enviadas",
  });
  assert.deepEqual({ ...SUGGESTION_PUSH_OPTIONS }, { TTL: 3600, urgency: "normal", topic: "sugerencias" });
  assert.equal(parseSubscription({ endpoint: "https://x", keys: {} }), null);
});

test("the sender removes 404/410 subscriptions and keeps going after 429 or service errors", async () => {
  const subscriptions = ["vivo", "caducado", "borrado", "saturado", "caido", "de-otro"].map((name) => ({
    endpoint: `https://push.example/${name}`,
    p256dh: "p",
    auth: "a",
    user_id: name === "de-otro" ? "beto" : "ana",
  }));
  const store = createStore(subscriptions);
  const failures = { caducado: 410, borrado: 404, saturado: 429, caido: 503 };
  const sent = [];
  const warnings = [];
  const webpush = {
    setVapidDetails(...args) { this.vapid = args; },
    async sendNotification(target, payload, options) {
      const name = target.endpoint.split("/").pop();
      if (failures[name]) throw Object.assign(new Error(name), { statusCode: failures[name], headers: { "retry-after": "30" } });
      sent.push({ name, payload: JSON.parse(payload), options });
    },
  };
  const sender = createPushSender({
    store,
    webpush,
    vapid: { subject: "https://github.com/ErnestoGUFI/ejercicios", publicKey: "pub", privateKey: "priv" },
    logger: { info() {}, warn: (line) => warnings.push(line) },
  });

  const summary = await sender.sendToUser("ana", { title: "Hola" }, SUGGESTION_PUSH_OPTIONS);

  assert.deepEqual(webpush.vapid, ["https://github.com/ErnestoGUFI/ejercicios", "pub", "priv"]);
  assert.deepEqual(summary, { sent: 1, removed: 2, failed: 2 });
  assert.deepEqual(sent, [{ name: "vivo", payload: { title: "Hola" }, options: SUGGESTION_PUSH_OPTIONS }]);
  assert.deepEqual([...store.rows.keys()].map((endpoint) => endpoint.split("/").pop()), ["vivo", "saturado", "caido", "de-otro"]);
  assert.match(warnings[0], /429 .*reintentar en 30s/);
});

test("an endpoint only moves to another user when it comes with the same keys (same browser)", async () => {
  const { call, store } = setup();
  await call("POST", "/push/subscriptions", { body: subscription });

  const stolen = await call("POST", "/push/subscriptions", { token: "token-beto", body: { ...subscription, keys: { p256dh: "BOtra", auth: "otro" } } });
  assert.equal(stolen.status, 409);
  assert.equal(store.rows.get(subscription.endpoint).user_id, "ana");

  // El mismo navegador con una sesión anónima nueva sí puede reclamarlo.
  assert.equal((await call("POST", "/push/subscriptions", { token: "token-beto", body: subscription })).status, 201);
  assert.equal(store.rows.get(subscription.endpoint).user_id, "beto");
});

test("an auth service failure is a 500, not a 401, so the app keeps its session", async () => {
  const api = createApi({
    allowedOrigins: [SITE],
    publicKey: "k",
    auth: { getUser: async () => { throw Object.assign(new Error("GoTrue caído"), { status: 503 }); } },
    store: createStore(),
    sender: { sendToUser: async () => {} },
    logger: silent,
  });

  const response = await api(new Request(`${API}/suggestions`, { method: "POST", headers: { Authorization: "Bearer t" }, body: "{}" }));
  assert.equal(response.status, 500);
});

test("location keeps only the fields the app sends", () => {
  assert.deepEqual(parseLocation({ source: "device", latitude: 24.14, longitude: -110.31, radiusKm: 1, place: null, extra: "x".repeat(10000) }), {
    source: "device", latitude: 24.14, longitude: -110.31, radiusKm: 1, place: null,
  });
  assert.deepEqual(parseLocation({ source: "manual", place: "La Paz, B.C.S." }), {
    source: "manual", latitude: null, longitude: null, radiusKm: null, place: "La Paz, B.C.S.",
  });
  assert.equal(parseLocation([1, 2]), null);
  assert.equal(parseLocation({ source: "otro" }), null);
  assert.equal(parseLocation({ source: "manual", place: "x".repeat(500) }).place, null);
});
