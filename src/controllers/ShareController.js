import { SHARE_LABELS } from "../components/ShareControl.js";
import { items } from "../data/items.js";
import { PWA_CONFIG } from "../pwa/config.js";
import { buildTopicShareData } from "../pwa/share.js";

export const SHARE_MESSAGES = {
  // share() se resuelve al entregar los datos a la app elegida, no cuando la persona termina de enviarlos.
  shared: (name) => `Listo: enviamos «${name}» a la app que elegiste.`,
  cancelled: () => "Cerraste el menú sin compartir. Puedes intentarlo cuando quieras.",
  busy: () => "Ya hay un menú de compartir abierto.",
  copied: (name) => `Copiamos el enlace de «${name}» al portapapeles. Pégalo en el chat o correo que quieras.`,
  copiedAfterFailure: (name) => `No se pudo abrir el menú para compartir; copiamos el enlace de «${name}» al portapapeles.`,
  manual: () => "No pudimos copiar automáticamente. El enlace ya está seleccionado: cópialo con Ctrl+C (⌘C en Mac) o mantenlo presionado en el teléfono.",
};

const FEEDBACK_STATES = {
  shared: "success",
  copied: "success",
  cancelled: "info",
  busy: "info",
  manual: "info",
};

export default class ShareController {
  constructor({
    document = globalThis.document,
    shareService,
    items: catalog = items,
    baseUrl = PWA_CONFIG.baseUrl,
  } = {}) {
    this.document = document;
    this.shareService = shareService;
    this.items = catalog;
    this.baseUrl = baseUrl;
  }

  init() {
    if (!this.shareService) return;

    this.document.addEventListener("click", async (event) => {
      const button = event.target.closest?.("[data-share-topic]");
      if (!button) return;

      await this.shareTopic(button);
    });
  }

  async shareTopic(button) {
    const item = this.items.find((entry) => entry.id === button.dataset.shareTopic);
    if (!item) return null;

    const data = buildTopicShareData(item, this.baseUrl);
    // Al deshabilitar el botón el navegador mueve el foco a <body>; se devuelve al terminar.
    const hadFocus = this.document?.activeElement === button;
    button.disabled = true;

    let result;
    try {
      // share() se llama sin await previo para no perder la activación del clic.
      result = await this.shareService.share(data);
    } finally {
      button.disabled = false;
    }

    if (button.isConnected === false) return result.outcome;
    this.renderResult(button, item, data, result);
    // Devuelve el foco solo si el navegador lo dejó en <body>; no lo quita de otro control.
    const active = this.document?.activeElement;
    if (hadFocus && result.outcome !== "manual" && (!active || active === this.document.body || active === button)) {
      button.focus();
    }
    return result.outcome;
  }

  renderResult(button, item, data, { outcome, nativeFailed }) {
    const control = button.closest?.(".share-control");
    const feedback = control?.querySelector("[data-share-feedback]");
    const fallback = control?.querySelector("[data-share-fallback]");
    const link = control?.querySelector("[data-share-link]");
    const messageKey = outcome === "copied" && nativeFailed ? "copiedAfterFailure" : outcome;

    const label = SHARE_LABELS[this.shareService.getMode?.()];
    if (label) button.textContent = label;

    if (feedback) {
      feedback.dataset.feedbackState = FEEDBACK_STATES[outcome] ?? "info";
      feedback.textContent = SHARE_MESSAGES[messageKey]?.(item.name) ?? "";
      feedback.hidden = false;
    }

    if (fallback) fallback.hidden = outcome !== "manual";
    if (outcome === "manual" && link) {
      link.value = data.url;
      link.focus();
      link.select();
    }
  }
}
