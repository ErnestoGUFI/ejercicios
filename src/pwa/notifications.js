export const NOTIFICATION_OPEN_MESSAGE = "notification-open";

// Estados del permiso: "default", "granted", "denied" o "unsupported" si el navegador no tiene la API.
export function readNotificationPermission(browserWindow = globalThis.window) {
  const permission = browserWindow?.Notification?.permission;
  return ["default", "granted", "denied"].includes(permission) ? permission : "unsupported";
}

export function createNotificationPermission({ browserWindow = globalThis.window } = {}) {
  const listeners = new Set();
  let state = readNotificationPermission(browserWindow);

  function update() {
    const next = readNotificationPermission(browserWindow);
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  }

  async function watchBrowserChanges() {
    try {
      const status = await browserWindow.navigator?.permissions?.query({ name: "notifications" });
      if (status) status.onchange = update;
    } catch {
      // Sin Permissions API, el estado se vuelve a leer al pedir el permiso y al volver a la pestaña.
    }
  }

  function init() {
    if (state === "unsupported") return api;

    watchBrowserChanges();
    browserWindow.addEventListener?.("focus", update);
    // El clic en una notificación pide abrir una ruta de la SPA en esta pestaña.
    browserWindow.navigator?.serviceWorker?.addEventListener?.("message", (event) => {
      if (event.data?.type !== NOTIFICATION_OPEN_MESSAGE) return;
      const url = new URL(event.data.url, browserWindow.location.href);
      if (url.origin === browserWindow.location.origin) browserWindow.location.hash = url.hash;
    });
    return api;
  }

  // Solo pregunta si el permiso no se ha decidido; con "denied" el navegador ya no volvería a preguntar.
  async function request() {
    if (state !== "default") return state;

    await browserWindow.Notification.requestPermission();
    update();
    return state;
  }

  const api = {
    init,
    request,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return api;
}
