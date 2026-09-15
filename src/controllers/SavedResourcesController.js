import dbService from "../services/dbService.js";
import safeUrl from "../utils/safeUrl.js";
import { renderSavedResourcesList } from "../views/SavedResourcesView.js";

function defaultCreateId() {
  return globalThis.crypto.randomUUID();
}

function defaultConfirmDelete(message) {
  return globalThis.confirm(message);
}

export default class SavedResourcesController {
  constructor({
    document = globalThis.document,
    database = dbService,
    createId = defaultCreateId,
    confirmDelete = defaultConfirmDelete,
  } = {}) {
    this.document = document;
    this.database = database;
    this.createId = createId;
    this.confirmDelete = confirmDelete;
    this.latestLoadId = 0;
  }

  init() {
    this.document.addEventListener("submit", async (event) => {
      if (!event.target.matches("[data-saved-resource-form]")) return;

      event.preventDefault();
      await this.createResource(event.target);
    });

    this.document.addEventListener("change", async (event) => {
      if (!event.target.matches("[data-resource-area-filter]")) return;
      await this.loadResources(event.target.value);
    });

    this.document.addEventListener("click", async (event) => {
      const button = event.target.closest?.("[data-delete-resource]");
      if (!button) return;
      if (!this.confirmDelete("¿Eliminar este recurso guardado?")) return;

      await this.deleteResource(button.dataset.deleteResource);
    });
  }

  getSelectedArea() {
    return this.document.querySelector("[data-resource-area-filter]")?.value ?? "all";
  }

  setFeedback(state, message) {
    const feedback = this.document.querySelector("[data-saved-resource-feedback]");
    if (!feedback) return;

    feedback.dataset.feedbackState = state;
    feedback.textContent = message;
    feedback.hidden = false;
  }

  async loadResources(area = this.getSelectedArea()) {
    const list = this.document.querySelector("[data-saved-resources-list]");
    if (!list) return false;

    const loadId = this.latestLoadId + 1;
    this.latestLoadId = loadId;
    const isCurrentLoad = () =>
      loadId === this.latestLoadId &&
      this.document.querySelector("[data-saved-resources-list]") === list;

    list.setAttribute("aria-busy", "true");
    try {
      const resources =
        area === "all"
          ? await this.database.getAllResources()
          : await this.database.getResourcesByArea(area);

      if (isCurrentLoad()) {
        list.innerHTML = renderSavedResourcesList(resources);
      }
      return true;
    } catch {
      if (isCurrentLoad()) {
        this.setFeedback(
          "error",
          "No se pudo actualizar la lista. Recarga la página e inténtalo de nuevo.",
        );
      }
      return false;
    } finally {
      if (isCurrentLoad()) list.setAttribute("aria-busy", "false");
    }
  }

  async createResource(form) {
    const submitButton = form.querySelector('button[type="submit"]');
    const enteredUrl = form.elements["resource-url"].value.trim();
    const url = safeUrl(enteredUrl);

    if (url === "#") {
      this.setFeedback("error", "Escribe una URL que comience con http:// o https://.");
      return;
    }

    submitButton.disabled = true;
    try {
      await this.database.createResource({
        id: this.createId(),
        title: form.elements["resource-title"].value.trim(),
        url,
        area: form.elements["resource-area"].value,
      });
      form.reset();

      if (await this.loadResources()) {
        this.setFeedback("success", "El recurso se guardó correctamente.");
      }
    } catch {
      this.setFeedback(
        "error",
        "No se pudo guardar el recurso. Revisa el almacenamiento del navegador e inténtalo de nuevo.",
      );
    } finally {
      submitButton.disabled = false;
    }
  }

  async deleteResource(id) {
    try {
      await this.database.deleteResource(id);
      if (await this.loadResources()) {
        this.setFeedback("success", "El recurso se eliminó correctamente.");
      }
    } catch {
      this.setFeedback(
        "error",
        "No se pudo eliminar el recurso. Recarga la página e inténtalo de nuevo.",
      );
    }
  }
}
