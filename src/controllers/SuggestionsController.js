import { renderOutboxItems } from "../views/SuggestionsView.js";

export default class SuggestionsController {
  constructor({ document = globalThis.document, outboxSync } = {}) {
    this.document = document;
    this.outboxSync = outboxSync;
  }

  init() {
    if (!this.outboxSync) return;

    this.document.addEventListener("submit", async (event) => {
      if (!event.target.matches("[data-suggestion-form]")) return;

      event.preventDefault();
      await this.queueSuggestion(event.target);
    });

    this.document.addEventListener("click", async (event) => {
      if (!event.target.closest?.("[data-outbox-retry]")) return;

      this.setConfirmation("Reintentando el envío de la cola…");
      await this.outboxSync.retryNow();
    });

    this.outboxSync.subscribe((message) => this.handleOutboxMessage(message));
  }

  setFeedback(state, text) {
    const feedback = this.document.querySelector("[data-suggestion-feedback]");
    if (!feedback) return;

    feedback.dataset.feedbackState = state;
    feedback.textContent = text;
    feedback.hidden = false;
  }

  setConfirmation(text) {
    const confirmation = this.document.querySelector("[data-outbox-confirmation]");
    if (!confirmation) return;

    confirmation.textContent = text;
    confirmation.hidden = false;
  }

  async refreshList() {
    const list = this.document.querySelector("[data-outbox-list]");
    if (!list) return;

    try {
      list.innerHTML = renderOutboxItems(await this.outboxSync.getPending());
    } catch {
      this.setConfirmation("No se pudo actualizar la cola de envíos.");
    }
  }

  async handleOutboxMessage(message) {
    if (message.type === "outbox-sent") {
      const serverId = message.serverId === null ? "" : ` (id ${message.serverId})`;
      this.setConfirmation(`«${message.topic}» se envió: el servidor respondió ${message.status}${serverId}.`);
    } else if (message.type === "outbox-failed") {
      this.setConfirmation(`No se pudo enviar «${message.topic}» (${message.reason}). Sigue en la cola y se volverá a intentar.`);
    }
    await this.refreshList();
  }

  async queueSuggestion(form) {
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      await this.outboxSync.enqueue({
        topic: form.elements["suggestion-topic"].value.trim(),
        area: form.elements["suggestion-area"].value,
        comment: form.elements["suggestion-comment"].value.trim(),
      });
      form.reset();
      this.setFeedback("success", "La sugerencia quedó guardada en la cola de envío.");
    } catch {
      this.setFeedback("error", "No se pudo guardar la sugerencia. Revisa el almacenamiento del navegador.");
    } finally {
      submitButton.disabled = false;
    }
  }
}
