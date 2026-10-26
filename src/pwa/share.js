import { PWA_CONFIG } from "./config.js";

// `?sin-share` y `?sin-portapapeles` en la URL simulan un navegador sin esas APIs, igual que `?sin-sync`.
export function readShareFlags(search = "") {
  const params = new URLSearchParams(search);
  return {
    nativeDisabled: params.has("sin-share"),
    clipboardDisabled: params.has("sin-portapapeles"),
  };
}

// El enlace sale de la dirección publicada y nunca de location.href, para no compartir banderas de prueba.
export function buildTopicShareData(item, baseUrl = PWA_CONFIG.baseUrl) {
  const base = new URL(baseUrl);
  base.search = "";

  return {
    title: `${item.name} · Tech catálogo`,
    text: `${item.name}: ${item.description}`,
    url: new URL(`#/item/${encodeURIComponent(item.id)}`, base).href,
  };
}

export function createShareService({ navigatorObject = globalThis.navigator, search = "" } = {}) {
  const flags = readShareFlags(search);

  // Se revisa en cada llamada: la API puede desaparecer sin recargar la página.
  function getMode() {
    return !flags.nativeDisabled && typeof navigatorObject?.share === "function" ? "native" : "copy";
  }

  async function copyLink(url, details) {
    const clipboard = flags.clipboardDisabled ? null : navigatorObject?.clipboard;
    if (typeof clipboard?.writeText !== "function") return { outcome: "manual", ...details };

    try {
      await clipboard.writeText(url);
      return { outcome: "copied", ...details };
    } catch {
      // Safari rechaza la copia si el documento no tiene foco o ya se agotó la activación del clic.
      return { outcome: "manual", ...details };
    }
  }

  // No hay ningún await antes de share() ni de writeText(): Safari exige la activación del clic.
  async function share(data) {
    if (getMode() === "copy") return copyLink(data.url, { nativeFailed: false });

    const failure = { nativeFailed: true };
    try {
      // Safari antiguo no tiene canShare(); en ese caso se intenta share() directamente.
      const accepted = typeof navigatorObject.canShare !== "function" || navigatorObject.canShare(data) !== false;
      if (accepted) {
        await navigatorObject.share(data);
        return { outcome: "shared", nativeFailed: false };
      }
    } catch (error) {
      const errorName = error?.name ?? "Error";
      if (errorName === "AbortError") return { outcome: "cancelled", nativeFailed: false, errorName };
      if (errorName === "InvalidStateError") return { outcome: "busy", nativeFailed: false, errorName };
      failure.errorName = errorName;
    }
    return copyLink(data.url, failure);
  }

  return { getMode, share };
}
