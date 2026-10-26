import { LOCATION_MESSAGES, PERMISSION_TEXT, isPermissionBlocked } from "../components/LocationField.js";
import { LocationError, serializeLocation } from "../pwa/geolocation.js";

// Los códigos 2 y 3 solo llegan después de conceder el permiso; sin respuesta no se deduce nada.
function attemptOutcome(location, error) {
  if (location || error?.code === 2 || error?.reason === "timeout") return "granted";
  if (error?.code === 1) return "denied";
  return null;
}

export default class LocationController {
  constructor({ document = globalThis.document, locationService } = {}) {
    this.document = document;
    this.locationService = locationService;
    this.pending = null;
    this.requestId = 0;
  }

  init() {
    if (!this.locationService) return;

    this.document.addEventListener("click", async (event) => {
      const requestButton = event.target.closest?.("[data-location-request]");
      if (requestButton) {
        await this.requestLocation(requestButton);
        return;
      }

      if (event.target.closest?.("[data-location-clear]")) this.clear();
    });

    // form.reset() no vacía los input hidden; sin esto la ubicación pasaría a la siguiente sugerencia.
    this.document.addEventListener("reset", (event) => {
      if (!event.target.matches?.("[data-suggestion-form]")) return;
      this.clear({ silent: true });
    });

    this.unwatchPermission = this.locationService.watchPermission((state) => {
      this.renderPermission(state);
      if (isPermissionBlocked(state)) {
        this.dropRevokedLocation();
        return;
      }
      if (state !== "granted" && state !== "prompt") return;

      this.toggleHelp(false);
      // El aviso del código 1 ya no aplica cuando el permiso se reactiva.
      const result = this.document.querySelector("[data-location-result]");
      if (result?.dataset.reason === "denied") this.renderResult({ state: "info", text: LOCATION_MESSAGES.reenabled });
    });
  }

  async requestLocation(button) {
    if (this.pending === button) return;

    this.requestId += 1;
    const requestId = this.requestId;
    // Al deshabilitar el botón el navegador mueve el foco a <body>; se devuelve al terminar.
    const hadFocus = this.document?.activeElement === button;
    this.pending = button;
    button.disabled = true;
    this.renderResult({ state: "info", text: LOCATION_MESSAGES.searching });

    let location = null;
    let error = null;
    try {
      location = await this.locationService.getApproximatePosition();
    } catch (reason) {
      error = reason instanceof LocationError ? reason : new LocationError(2);
    }

    const outcome = attemptOutcome(location, error);
    if (outcome) this.locationService.noteAttempt(outcome);
    // Una respuesta tardía no toca una vista nueva ni un formulario que ya se limpió.
    if (requestId !== this.requestId) return;

    this.pending = null;
    button.disabled = false;
    if (!this.document.contains(button)) return;

    if (location) {
      this.attach(location);
    } else {
      this.showError(error);
    }
    if (hadFocus && error?.code !== 1) this.restoreFocus(button);
    await this.refreshPermission();
  }

  // Si el permiso se bloquea con una zona ya adjunta, esa zona no se envía.
  dropRevokedLocation() {
    const input = this.document.querySelector("[data-location-value]");
    if (!input?.value) return;

    input.value = "";
    this.toggleClear(false);
    this.renderResult({ state: "info", text: LOCATION_MESSAGES.revoked, reason: "denied" });
  }

  // Devuelve el foco solo si el navegador lo dejó en <body>; no lo quita de otro campo.
  restoreFocus(button) {
    const active = this.document.activeElement;
    if (!active || active === this.document.body || active === button) button.focus();
  }

  attach(location) {
    const input = this.document.querySelector("[data-location-value]");
    if (input) input.value = serializeLocation(location);
    this.toggleClear(true);
    this.toggleHelp(false);
    this.renderResult({ state: "success", text: LOCATION_MESSAGES.success(location) });
  }

  showError(error) {
    // Un intento fallido no deja adjunta la ubicación de un intento anterior.
    const input = this.document.querySelector("[data-location-value]");
    if (input) input.value = "";
    this.toggleClear(false);

    const neutral = error.code === 0 || error.code === 1;
    this.renderResult({ state: neutral ? "info" : "error", text: error.message, reason: error.reason });
    if (error.code !== 1) return;

    this.toggleHelp(true);
    this.document.querySelector("#suggestion-place")?.focus();
  }

  clear({ silent = false } = {}) {
    if (this.pending) {
      this.requestId += 1;
      this.pending.disabled = false;
      this.pending = null;
    }

    const input = this.document.querySelector("[data-location-value]");
    if (input) input.value = "";
    this.toggleClear(false);

    if (silent) {
      this.renderResult({ state: "info", text: "" });
      return;
    }
    this.renderResult({ state: "info", text: LOCATION_MESSAGES.cleared });
    this.document.querySelector("[data-location-request]")?.focus();
  }

  async refreshPermission() {
    try {
      this.renderPermission(await this.locationService.getPermissionState());
    } catch {
      // Si la consulta falla, la línea conserva el último estado conocido.
    }
  }

  renderPermission(state) {
    const key = Object.hasOwn(PERMISSION_TEXT, state) ? state : "unknown";
    const line = this.document.querySelector("[data-location-permission]");
    if (line) {
      line.dataset.state = key;
      line.textContent = PERMISSION_TEXT[key];
    }
    if (isPermissionBlocked(key)) this.toggleHelp(true);
  }

  renderResult({ state, text, reason = "" }) {
    const result = this.document.querySelector("[data-location-result]");
    if (!result) return;

    result.dataset.feedbackState = state;
    result.dataset.reason = reason;
    result.textContent = text;
    result.hidden = !text;
  }

  toggleClear(visible) {
    const clearButton = this.document.querySelector("[data-location-clear]");
    if (clearButton) clearButton.hidden = !visible;
  }

  toggleHelp(visible) {
    const help = this.document.querySelector("[data-location-help]");
    if (!help) return;

    help.hidden = !visible;
    help.open = visible;
  }
}
