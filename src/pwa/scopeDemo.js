import { PWA_CONFIG } from "./config.js";

export async function renderScopeDemo({ document, navigator }) {
  const controllerOutput = document.querySelector("[data-scope-demo-controller]");
  const scopeOutput = document.querySelector("[data-scope-demo-scope]");
  const feedback = document.querySelector("[data-scope-demo-feedback]");

  try {
    const registration = await navigator.serviceWorker?.getRegistration(
      PWA_CONFIG.narrowScope,
    );

    controllerOutput.textContent = navigator.serviceWorker?.controller?.scriptURL
      ?? "Sin controller; recarga después de activar el registro.";
    scopeOutput.textContent = registration?.scope ?? "Scope estrecho aún no registrado.";
  } catch (error) {
    controllerOutput.textContent = "Sin controller.";
    scopeOutput.textContent = "No disponible";
    feedback.dataset.state = "error";
    feedback.textContent = `${error?.name ?? "Error"}: ${error?.message ?? "No se pudo consultar el registro."}`;
  }
}

if (typeof document !== "undefined" && typeof navigator !== "undefined") {
  renderScopeDemo({ document, navigator });

  document.querySelector("[data-reload-scope-demo]")
    ?.addEventListener("click", () => window.location.reload());
}
