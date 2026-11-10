// Suscripción push del dispositivo: alta, baja y reenvío al backend al abrir la app.

export function base64UrlToBytes(value) {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function sameKey(buffer, bytes) {
  if (!buffer) return false;
  const current = new Uint8Array(buffer);
  return current.length === bytes.length && current.every((value, index) => value === bytes[index]);
}

export function isPushSupported(browserWindow = globalThis.window) {
  return Boolean(browserWindow?.PushManager && browserWindow.navigator?.serviceWorker && browserWindow.Notification);
}

export function createPushSubscription({
  browserWindow = globalThis.window,
  backend,
  getRegistration = () => browserWindow.navigator.serviceWorker.ready,
  setNotificationsEnabled = async () => {},
  logger = console,
} = {}) {
  const supported = Boolean(backend) && isPushSupported(browserWindow);

  async function currentSubscription() {
    const registration = await getRegistration();
    return registration.pushManager.getSubscription();
  }

  async function expect(response, action) {
    if (!response.ok) throw new Error(`${action}: el backend respondió ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  // La llave se pide al abrir la app: Safari solo permite pushManager.subscribe() durante el gesto
  // del usuario, y esperar una respuesta de red dentro del clic lo agotaría.
  let publicKeyRequest = null;
  function loadPublicKey() {
    publicKeyRequest ??= backend.request("/push/public-key", { auth: false })
      .then((response) => expect(response, "Llave pública"))
      .then(({ publicKey }) => base64UrlToBytes(publicKey))
      .catch((error) => {
        publicKeyRequest = null;
        throw error;
      });
    return publicKeyRequest;
  }

  async function saveOnBackend(subscription) {
    await expect(await backend.request("/push/subscriptions", { method: "POST", body: subscription.toJSON() }), "Guardar suscripción");
  }

  // Requiere el permiso concedido. Si las llaves VAPID cambiaron, la suscripción vieja ya no sirve y se rehace.
  async function subscribe() {
    const applicationServerKey = await loadPublicKey();
    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();

    if (subscription && !sameKey(subscription.options?.applicationServerKey, applicationServerKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    const created = !subscription;
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    try {
      await saveOnBackend(subscription);
    } catch (error) {
      // Una suscripción que el backend no conoce no recibiría nada y además apagaría los avisos locales.
      if (created) await subscription.unsubscribe().catch(() => false);
      throw error;
    }
    await setNotificationsEnabled(true);
    return subscription;
  }

  async function unsubscribe() {
    // La preferencia se guarda primero: el Service Worker tampoco mostrará los avisos locales.
    await setNotificationsEnabled(false);
    const subscription = await currentSubscription();
    if (!subscription) return;

    try {
      await expect(await backend.request("/push/subscriptions", {
        method: "DELETE",
        body: { endpoint: subscription.endpoint },
      }), "Borrar suscripción");
    } finally {
      // Aunque el backend no responda, el navegador la da de baja; el siguiente envío recibirá 410 y la borrará.
      await subscription.unsubscribe();
    }
  }

  // Al abrir la app se vuelve a mandar la suscripción: puede haber cambiado o el backend pudo haberla borrado.
  // Devuelve si el dispositivo sigue suscrito; sin conexión lo sigue estando y se reenvía la próxima vez.
  async function resync() {
    if (!supported || browserWindow.Notification.permission !== "granted") return false;

    try {
      if (await currentSubscription()) await subscribe();
    } catch (error) {
      logger.warn("[Push] No se pudo reenviar la suscripción:", error);
    }
    // Se vuelve a leer: si las llaves cambiaron y la nueva suscripción falló, ya no hay ninguna.
    try {
      return Boolean(await currentSubscription());
    } catch {
      return false;
    }
  }

  return {
    supported,
    prepare: () => (supported ? loadPublicKey().then(() => true, () => false) : Promise.resolve(false)),
    subscribe,
    unsubscribe,
    resync,
    isSubscribed: async () => supported && Boolean(await currentSubscription()),
  };
}
