// Lógica de la API sin dependencias de Deno ni de Supabase: index.ts le pasa la base de datos,
// la verificación de sesión y web-push, y los tests de node le pasan dobles.

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

// Un acuse de sugerencia ya no sirve si llega horas después: el servicio push lo descarta pasada una hora.
export const SUGGESTION_PUSH_OPTIONS = Object.freeze({ TTL: 60 * 60, urgency: "normal", topic: "sugerencias" });

export function readAllowedOrigins(value = "") {
  return value.split(",").map((origin) => origin.trim()).filter(Boolean);
}

function corsHeaders(origin, allowedOrigins) {
  const headers = { Vary: "Origin" };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function json(status, body, headers) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? headers : { ...JSON_HEADERS, ...headers },
  });
}

function text(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

export function parseSubscription(body) {
  const endpoint = text(body?.endpoint, 2048);
  const p256dh = text(body?.keys?.p256dh, 200);
  const auth = text(body?.keys?.auth, 100);
  if (!endpoint || !p256dh || !auth) return null;

  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth };
}

export function parseSuggestion(body) {
  const clientId = text(body?.clientId, 100);
  const topic = text(body?.title, 120);
  const area = text(body?.area, 40);
  if (!clientId || !topic || !area) return null;

  const comment = typeof body.body === "string" ? body.body.trim().slice(0, 1000) : "";
  const location = parseLocation(body.location);
  const queuedAt = typeof body.createdAt === "string" && !Number.isNaN(Date.parse(body.createdAt)) ? body.createdAt : null;
  return { clientId, topic, area, comment, location, queuedAt };
}

const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const shortText = (value) => (typeof value === "string" && value.length <= 120 ? value : null);

// Solo los campos que manda la app (ejercicio 4): nada de objetos arbitrarios en la base de datos.
export function parseLocation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value.source === "device" || value.source === "manual" ? value.source : null;
  if (!source) return null;

  return {
    source,
    latitude: finite(value.latitude),
    longitude: finite(value.longitude),
    radiusKm: finite(value.radiusKm),
    place: shortText(value.place),
  };
}

export function suggestionPushMessage(suggestion) {
  return {
    title: "Sugerencia recibida",
    body: `Guardamos «${suggestion.topic}» en el servidor. Toca para ver tus envíos.`,
    // Ruta relativa: el Service Worker la resuelve contra su scope (/ejercicios/ en GitHub Pages).
    url: "#/sugerencias",
    tag: "sugerencias-enviadas",
  };
}

// Envía un aviso a todas las suscripciones del usuario y limpia las que ya no existen.
export function createPushSender({ store, webpush, vapid, logger = console }) {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  async function sendToUser(userId, message, options) {
    const subscriptions = await store.listSubscriptions(userId);
    const payload = JSON.stringify(message);
    const results = await Promise.allSettled(subscriptions.map((subscription) => webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      options,
    )));

    const summary = { sent: 0, removed: 0, failed: 0 };
    for (const [index, result] of results.entries()) {
      const { endpoint } = subscriptions[index];
      if (result.status === "fulfilled") {
        summary.sent += 1;
        continue;
      }

      const status = result.reason?.statusCode;
      if (status === 404 || status === 410) {
        // El navegador dio de baja la suscripción o caducó: ya no se volverá a usar.
        logger.info(`[push] ${status} de ${new URL(endpoint).host}: se borra la suscripción`);
        await store.deleteSubscription(endpoint);
        summary.removed += 1;
      } else {
        // 429 o fallas del servicio push: se registran y la app sigue; este aviso se pierde.
        const retryAfter = result.reason?.headers?.["retry-after"];
        logger.warn(`[push] ${status ?? "sin respuesta"} al enviar a ${new URL(endpoint).host}${retryAfter ? `, reintentar en ${retryAfter}s` : ""}`);
        summary.failed += 1;
      }
    }
    logger.info(`[push] usuario ${userId}: ${summary.sent} enviado(s), ${summary.removed} eliminada(s), ${summary.failed} con error`);
    return summary;
  }

  return { sendToUser };
}

export function createApi({ allowedOrigins, publicKey, auth, store, sender, runInBackground = (promise) => promise, logger = console }) {
  async function readJson(request) {
    try {
      return await request.json();
    } catch {
      return null;
    }
  }

  async function currentUser(request) {
    const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    return token ? auth.getUser(token) : null;
  }

  // EVENTO QUE DISPARA EL PUSH: el servidor guardó una sugerencia nueva del usuario.
  function notifySuggestionReceived(userId, suggestion) {
    const delivery = sender.sendToUser(userId, suggestionPushMessage(suggestion), SUGGESTION_PUSH_OPTIONS)
      .catch((error) => logger.error("[push] no se pudo enviar el aviso:", error));
    // La respuesta a la app no espera al servicio push.
    runInBackground(delivery);
  }

  const routes = {
    "GET /push/public-key": async () => json(200, { publicKey }),

    "POST /push/subscriptions": async (request, user) => {
      const subscription = parseSubscription(await readJson(request));
      if (!subscription) return json(400, { error: "Suscripción incompleta." });

      // Un endpoint ya registrado solo cambia de usuario si quien lo manda tiene sus mismas llaves,
      // es decir, si es el mismo navegador (por ejemplo, tras una sesión anónima nueva).
      const existing = await store.findSubscription(subscription.endpoint);
      if (existing && existing.user_id !== user.id && (existing.p256dh !== subscription.p256dh || existing.auth !== subscription.auth)) {
        return json(409, { error: "La suscripción pertenece a otro dispositivo." });
      }

      await store.saveSubscription({
        ...subscription,
        user_id: user.id,
        user_agent: request.headers.get("User-Agent")?.slice(0, 300) ?? null,
      });
      return json(201, { saved: true });
    },

    "DELETE /push/subscriptions": async (request, user) => {
      const endpoint = text((await readJson(request))?.endpoint, 2048);
      if (!endpoint) return json(400, { error: "Falta el endpoint." });

      await store.deleteSubscription(endpoint, user.id);
      return json(204);
    },

    "POST /suggestions": async (request, user) => {
      const suggestion = parseSuggestion(await readJson(request));
      if (!suggestion) return json(400, { error: "Sugerencia incompleta." });

      const { id, created } = await store.createSuggestion(user.id, suggestion);
      // Un reintento de Background Sync con el mismo clientId no repite el aviso.
      if (created) notifySuggestionReceived(user.id, suggestion);
      return json(created ? 201 : 200, { id });
    },
  };

  return async function handle(request) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, allowedOrigins);
    // Solo el sitio publicado puede llamar a la API desde un navegador.
    if (origin && !cors["Access-Control-Allow-Origin"]) return json(403, { error: "Origen no permitido." }, cors);
    if (request.method === "OPTIONS") return json(204, undefined, cors);

    const path = new URL(request.url).pathname.replace(/^.*?\/api(?=\/|$)/, "") || "/";
    const route = routes[`${request.method} ${path}`];
    if (!route) return json(404, { error: "Ruta no encontrada." }, cors);

    try {
      let user = null;
      if (path !== "/push/public-key") {
        user = await currentUser(request);
        if (!user) return json(401, { error: "Sesión inválida o vencida." }, cors);
      }
      const response = await route(request, user);
      Object.entries(cors).forEach(([name, value]) => response.headers.set(name, value));
      return response;
    } catch (error) {
      logger.error("[api]", request.method, path, error);
      return json(500, { error: "Error del servidor." }, cors);
    }
  };
}
