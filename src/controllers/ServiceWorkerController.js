import cacheDebugService from "../services/CacheDebugService.js";

function formatError(result) {
  return `${result.errorName ?? "Error"}: ${result.message ?? "La operación falló."}`;
}

export default class ServiceWorkerController {
  constructor({ document, diagnostics, router, cacheDebug = cacheDebugService }) {
    this.document = document;
    this.diagnostics = diagnostics;
    this.router = router;
    this.cacheDebug = cacheDebug;
  }

  init() {
    this.document.addEventListener("click", async (event) => {
      const refreshButton = event.target.closest?.("[data-refresh-sw]");
      if (refreshButton) {
        await this.run(refreshButton, async () => {
          await this.renderAndRestoreFocus("[data-refresh-sw]");
        });
        return;
      }

      const refreshCacheButton = event.target.closest?.("[data-refresh-cache]");
      if (refreshCacheButton) {
        await this.run(refreshCacheButton, async () => {
          await this.renderAndRestoreFocus("[data-refresh-cache]");
        });
        return;
      }

      const deleteCacheButton = event.target.closest?.("[data-delete-cache-entry]");
      if (deleteCacheButton) {
        await this.run(deleteCacheButton, async () => {
          const deleted = await this.cacheDebug.deleteEntry(deleteCacheButton.dataset.cacheUrl);
          await this.renderAndRestoreFocus("[data-refresh-cache]");
          this.setFeedback(
            deleted ? "success" : "error",
            deleted
              ? "Entrada eliminada. Carga de nuevo el dato para solicitarlo a la red."
              : "La entrada ya no existe en la caché activa.",
          );
        });
        return;
      }

      const loadCacheDemoButton = event.target.closest?.("[data-load-cache-demo]");
      if (loadCacheDemoButton) {
        await this.run(loadCacheDemoButton, async () => {
          const demoData = await this.cacheDebug.requestDemoData();
          await this.renderAndRestoreFocus(
            "[data-load-cache-demo]",
            JSON.stringify(demoData, null, 2),
          );
          this.setFeedback("success", "Dato recibido. Revisa Cache Storage y la consola del Service Worker.");
        });
        return;
      }

      const invalidButton = event.target.closest?.("[data-test-invalid-scope]");
      if (invalidButton) {
        await this.run(invalidButton, async () => {
          const result = await this.diagnostics.tryInvalidScope();
          this.setFeedback(
            result.ok ? "success" : "error",
            result.ok ? result.message : formatError(result),
          );
        });
        return;
      }

      const narrowButton = event.target.closest?.("[data-register-narrow-scope]");
      if (!narrowButton) return;

      await this.run(narrowButton, async () => {
        const result = await this.diagnostics.registerNarrowScope();
        if (!result.ok) {
          this.setFeedback("error", formatError(result));
          return;
        }

        await this.renderAndRestoreFocus("[data-register-narrow-scope]");
        this.setFeedback(
          "success",
          "Scope estrecho registrado. Ya aparece en la lista de registros.",
        );
      });
    });
  }

  async renderAndRestoreFocus(selector, demoContent) {
    const previousDemoContent = this.document.querySelector("[data-cache-demo-output]")?.textContent;
    await this.router.render();
    const demoOutput = this.document.querySelector("[data-cache-demo-output]");
    if (demoOutput && (demoContent !== undefined || previousDemoContent)) {
      demoOutput.textContent = demoContent ?? previousDemoContent;
    }
    this.document.querySelector(selector)?.focus();
  }

  async run(button, operation) {
    button.disabled = true;
    try {
      await operation();
    } catch (error) {
      this.setFeedback(
        "error",
        `${error?.name ?? "Error"}: ${error?.message ?? "La operación falló."}`,
      );
    } finally {
      button.disabled = false;
    }
  }

  setFeedback(state, message) {
    const feedback = this.document.querySelector("[data-sw-feedback]");
    if (!feedback) return;
    feedback.dataset.state = state;
    feedback.textContent = message;
  }
}
