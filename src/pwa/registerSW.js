import { PWA_CONFIG } from "./config.js";

export async function registerServiceWorker({
  navigatorObject = globalThis.navigator,
  config = PWA_CONFIG,
  logger = console,
} = {}) {
  if (!navigatorObject || !("serviceWorker" in navigatorObject)) {
    logger.info("[PWA] Este navegador no soporta Service Workers.");
    return {
      supported: false,
      registered: false,
      registration: null,
      error: null,
    };
  }

  try {
    const registration = await navigatorObject.serviceWorker.register(
      config.scriptUrl,
      { scope: config.scope },
    );
    logger.info("[PWA] Service Worker registrado.", {
      script: config.scriptUrl,
      scope: registration.scope,
    });
    return {
      supported: true,
      registered: true,
      registration,
      error: null,
    };
  } catch (error) {
    logger.error("[PWA] No se pudo registrar el Service Worker.", error);
    return {
      supported: true,
      registered: false,
      registration: null,
      error,
    };
  }
}

export function scheduleServiceWorkerRegistration(
  browserWindow = globalThis.window,
  register = registerServiceWorker,
) {
  browserWindow?.addEventListener("load", register, { once: true });
}
