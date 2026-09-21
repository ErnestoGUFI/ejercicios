function formatError(result) {
  return `${result.errorName ?? "Error"}: ${result.message ?? "La operación falló."}`;
}

export default class ServiceWorkerController {
  constructor({ document, diagnostics, router }) {
    this.document = document;
    this.diagnostics = diagnostics;
    this.router = router;
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

  async renderAndRestoreFocus(selector) {
    await this.router.render();
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
