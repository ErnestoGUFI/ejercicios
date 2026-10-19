export const SUGGESTION_SYNC_TAG = "enviar-sugerencias";

// `?sin-sync` en la URL simula un navegador sin Background Sync para probar el plan B.
export function supportsBackgroundSync(browserWindow = globalThis.window) {
  if (!browserWindow) return false;
  const params = new URLSearchParams(browserWindow.location?.search ?? "");
  return !params.has("sin-sync") && "SyncManager" in browserWindow;
}

export function createOutboxSync({
  browserWindow = globalThis.window,
  database,
  serviceWorker = browserWindow?.navigator?.serviceWorker,
  createId = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString(),
} = {}) {
  const mode = supportsBackgroundSync(browserWindow) ? "background-sync" : "plan-b";
  const listeners = new Set();

  function notify(event) {
    listeners.forEach((listener) => listener(event));
  }

  async function postFlush(registration, trigger) {
    registration.active?.postMessage({ type: "outbox-flush", trigger });
    return "flush";
  }

  async function requestSend(trigger) {
    const registration = await serviceWorker?.ready;
    if (!registration) return "unavailable";

    if (mode === "plan-b") return postFlush(registration, trigger);

    try {
      await registration.sync.register(SUGGESTION_SYNC_TAG);
      return "sync";
    } catch {
      // Si el navegador niega el registro, se intenta igual sin esperar a la sincronización.
      return postFlush(registration, trigger);
    }
  }

  async function enqueue(suggestion) {
    const item = {
      id: createId(),
      ...suggestion,
      createdAt: now(),
      attempts: 0,
      lastError: null,
    };

    // Primero se guarda en la cola; el envío llega después y puede fallar sin perder nada.
    await database.addToOutbox(item);
    notify({ type: "outbox-queued", id: item.id, topic: item.topic });
    const sending = requestSend("nueva sugerencia").catch(() => "unavailable");
    return { item, sending };
  }

  function init() {
    serviceWorker?.addEventListener?.("message", (event) => {
      if (String(event.data?.type).startsWith("outbox-")) notify(event.data);
    });

    if (mode === "plan-b") {
      browserWindow?.addEventListener("online", () => {
        requestSend("conexión recuperada").catch(() => undefined);
      });
      requestSend("apertura de la app").catch(() => undefined);
    } else {
      // Al abrir la app se vuelve a registrar la tag por si quedaron envíos de otra sesión.
      database.getOutbox()
        .then((items) => (items.length > 0 ? requestSend("apertura de la app") : null))
        .catch(() => undefined);
    }
    return api;
  }

  const api = {
    mode,
    init,
    enqueue,
    getPending: () => database.getOutbox(),
    retryNow: () => requestSend("botón Reintentar ahora"),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return api;
}
