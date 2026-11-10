export const NOTIFICATION_LABELS = {
  default: "Activar avisos",
  granted: "Avisos activados",
  denied: "Avisos bloqueados",
};

export const NOTIFICATION_MESSAGES = {
  // Sin Push API (o sin backend) quedan los avisos locales del Service Worker.
  granted: "Avisos activados: te avisaremos cuando tus sugerencias lleguen al servidor, aunque la app esté en segundo plano.",
  subscribed: "Avisos activados: el servidor te avisará cuando reciba tus sugerencias, aunque la pestaña esté cerrada. Para desactivarlos, toca «Avisos activados».",
  unsubscribed: "Avisos desactivados en este dispositivo. Puedes volver a activarlos cuando quieras.",
  failed: "No pudimos activar los avisos porque el servidor no respondió. Revisa tu conexión e inténtalo de nuevo.",
  denied: "Los avisos están bloqueados para este sitio y el navegador ya no vuelve a preguntar. Para activarlos: en Chrome o Edge toca el ícono a la izquierda de la dirección › Notificaciones › Permitir; en Safari para Mac, Safari › Configuración › Sitios web › Notificaciones › Permitir; en iPhone, agrega la app a Inicio y actívalos en Configuración › Notificaciones › TechCatálogo. Después recarga la página.",
};

export default function initNotificationControl({
  button,
  hint,
  notificationPermission,
  pushSubscription,
  setNotificationsEnabled = async () => {},
} = {}) {
  if (!button || !notificationPermission) return () => {};

  const message = hint?.querySelector("[data-notification-message]");
  const dismissButton = hint?.querySelector("[data-notification-dismiss]");
  const usesPush = Boolean(pushSubscription?.supported);
  // Con el permiso bloqueado, la explicación para desbloquearlo se muestra desde el inicio.
  let notice = notificationPermission.getState() === "denied" ? "denied" : null;
  let subscribed = false;
  let busy = false;

  function active(state) {
    return state === "granted" && (!usesPush || subscribed);
  }

  function render(state = notificationPermission.getState()) {
    button.hidden = state === "unsupported";
    button.dataset.state = state;
    button.textContent = active(state) ? NOTIFICATION_LABELS.granted : NOTIFICATION_LABELS[state === "denied" ? "denied" : "default"];
    button.setAttribute?.("aria-pressed", String(active(state)));
    // Con push, "Avisos activados" sirve para darse de baja; sin push ya no tiene acción.
    button.disabled = busy || (state === "granted" && !usesPush);

    if (notice === "denied" && state !== "denied") notice = null;
    if (hint) hint.hidden = notice === null;
    if (message) message.textContent = notice ? NOTIFICATION_MESSAGES[notice] : "";
  }

  async function run(action) {
    busy = true;
    render();
    try {
      notice = await action();
    } finally {
      busy = false;
      render();
    }
  }

  async function activate() {
    const result = await notificationPermission.request();
    if (result === "denied") return "denied";
    if (result !== "granted") return null;
    if (!usesPush) {
      await setNotificationsEnabled(true);
      return "granted";
    }

    try {
      await pushSubscription.subscribe();
      subscribed = true;
      return "subscribed";
    } catch (error) {
      console.warn("[Push] No se pudo activar la suscripción:", error);
      return "failed";
    }
  }

  async function deactivate() {
    try {
      await pushSubscription.unsubscribe();
    } catch (error) {
      console.warn("[Push] La baja no llegó al servidor:", error);
    }
    subscribed = false;
    return "unsubscribed";
  }

  button.addEventListener("click", () => {
    const state = notificationPermission.getState();
    if (state === "denied") {
      notice = "denied";
      render();
      return undefined;
    }
    return run(active(state) ? deactivate : activate);
  });

  dismissButton?.addEventListener("click", () => {
    notice = null;
    render();
    button.focus?.();
  });

  const unsubscribe = notificationPermission.subscribe((state) => {
    if (state === "denied") notice = "denied";
    render(state);
  });
  render();

  // Sin push, el permiso concedido basta para los avisos locales (como en el ejercicio 5).
  if (!usesPush && notificationPermission.getState() === "granted") setNotificationsEnabled(true).catch(() => {});

  // Estado inicial de la suscripción y reenvío al backend al abrir la app.
  if (usesPush) {
    pushSubscription.prepare?.();
    pushSubscription.resync().then((current) => {
      subscribed = current;
      render();
    });
  }
  return unsubscribe;
}
