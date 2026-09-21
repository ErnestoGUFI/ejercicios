import { PWA_CONFIG } from "./config.js";

function currentWorker(registration) {
  return registration?.installing ?? registration?.waiting ?? registration?.active ?? null;
}

function describeRegistration(registration) {
  const worker = currentWorker(registration);
  return {
    scope: registration.scope,
    scriptUrl: worker?.scriptURL ?? "Sin script disponible",
    state: worker?.state ?? "Sin worker activo",
  };
}

export function isUrlWithinScope(candidateUrl, scopeUrl) {
  const candidate = new URL(candidateUrl);
  const scope = new URL(scopeUrl);
  return candidate.origin === scope.origin && candidate.pathname.startsWith(scope.pathname);
}

export class ServiceWorkerDiagnostics {
  constructor({
    navigatorObject = globalThis.navigator,
    windowObject = globalThis.window,
    config = PWA_CONFIG,
  } = {}) {
    this.navigator = navigatorObject;
    this.window = windowObject;
    this.config = config;
  }

  get supported() {
    return Boolean(this.navigator && "serviceWorker" in this.navigator);
  }

  getScopeChecks() {
    const scopeUrl = new URL(this.config.scope, this.config.baseUrl).href;
    const rootWithoutSlash = this.config.baseUrl.replace(/\/$/, "");
    const candidates = [
      ["Raíz de la aplicación", this.config.baseUrl],
      ["Ruta del router", new URL("#/guardados", this.config.baseUrl).href],
      ["Archivo interno", new URL("src/main.js", this.config.baseUrl).href],
      ["Raíz sin diagonal final", rootWithoutSlash],
      ["Ruta fuera del proyecto", "https://fuera.example/ruta/"],
      ["Página del scope estrecho", this.config.narrowPageUrl],
    ];

    return candidates.map(([label, url]) => ({
      label,
      url,
      withinScope: isUrlWithinScope(url, scopeUrl),
    }));
  }

  async getSnapshot() {
    const base = {
      supported: this.supported,
      secureContext: Boolean(this.window?.isSecureContext),
      registered: false,
      scope: null,
      scriptUrl: null,
      workerState: "Sin worker activo",
      controlled: false,
      controllerScriptUrl: null,
      scopeChecks: this.getScopeChecks(),
      registrations: [],
      narrowPageUrl: this.config.narrowPageUrl,
    };

    if (!this.supported) return base;

    const [registration, registrations] = await Promise.all([
      this.navigator.serviceWorker.getRegistration(this.config.scope),
      this.navigator.serviceWorker.getRegistrations(),
    ]);
    const worker = currentWorker(registration);
    const controller = this.navigator.serviceWorker.controller;

    return {
      ...base,
      registered: Boolean(registration),
      scope: registration?.scope ?? null,
      scriptUrl: worker?.scriptURL ?? null,
      workerState: worker?.state ?? base.workerState,
      controlled: Boolean(controller),
      controllerScriptUrl: controller?.scriptURL ?? null,
      registrations: registrations.map(describeRegistration),
    };
  }

  async tryInvalidScope() {
    if (!this.supported) {
      return {
        ok: false,
        errorName: "NotSupportedError",
        message: "Este navegador no soporta Service Workers.",
      };
    }

    try {
      const registration = await this.navigator.serviceWorker.register(
        this.config.invalidScriptUrl,
        { scope: this.config.invalidScope },
      );
      return {
        ok: true,
        registration,
        message: "El navegador aceptó el scope solicitado.",
      };
    } catch (error) {
      return {
        ok: false,
        errorName: error?.name ?? "Error",
        message: error?.message ?? "El navegador rechazó el scope.",
      };
    }
  }

  async registerNarrowScope() {
    if (!this.supported) {
      return {
        ok: false,
        errorName: "NotSupportedError",
        message: "Este navegador no soporta Service Workers.",
      };
    }

    try {
      const registration = await this.navigator.serviceWorker.register(
        this.config.scriptUrl,
        { scope: this.config.narrowScope },
      );
      return { ok: true, registration };
    } catch (error) {
      return {
        ok: false,
        errorName: error?.name ?? "Error",
        message: error?.message ?? "No se pudo registrar el scope estrecho.",
      };
    }
  }
}

export default new ServiceWorkerDiagnostics();
