export const NOTIFICATION_LABELS = {
  default: "Activar avisos",
  granted: "Avisos activados",
  denied: "Avisos bloqueados",
};

export const NOTIFICATION_MESSAGES = {
  granted: "Avisos activados: te avisaremos cuando tus sugerencias lleguen al servidor, aunque la app esté en segundo plano.",
  denied: "Los avisos están bloqueados para este sitio y el navegador ya no vuelve a preguntar. Para activarlos: en Chrome o Edge toca el ícono a la izquierda de la dirección › Notificaciones › Permitir; en Safari para Mac, Safari › Configuración › Sitios web › Notificaciones › Permitir; en iPhone, agrega la app a Inicio y actívalos en Configuración › Notificaciones › TechCatálogo. Después recarga la página.",
};

export default function initNotificationControl({ button, hint, notificationPermission } = {}) {
  if (!button || !notificationPermission) return () => {};

  const message = hint?.querySelector("[data-notification-message]");
  const dismissButton = hint?.querySelector("[data-notification-dismiss]");
  // Con el permiso bloqueado, la explicación para desbloquearlo se muestra desde el inicio.
  let notice = notificationPermission.getState() === "denied" ? "denied" : null;

  function render(state = notificationPermission.getState()) {
    button.hidden = state === "unsupported";
    button.dataset.state = state;
    button.textContent = NOTIFICATION_LABELS[state] ?? NOTIFICATION_LABELS.default;
    // Con el permiso concedido el botón ya no tiene acción; con "denied" solo muestra cómo desbloquear.
    button.setAttribute?.("aria-pressed", String(state === "granted"));
    button.disabled = state === "granted";

    if (notice && notice !== state) notice = null;
    if (hint) hint.hidden = notice === null;
    if (message) message.textContent = notice ? NOTIFICATION_MESSAGES[notice] : "";
  }

  button.addEventListener("click", async () => {
    const state = notificationPermission.getState();
    if (state === "denied") {
      notice = "denied";
      render();
      return;
    }

    button.disabled = true;
    const result = await notificationPermission.request();
    notice = result === "granted" || result === "denied" ? result : null;
    render(result);
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
  return unsubscribe;
}
