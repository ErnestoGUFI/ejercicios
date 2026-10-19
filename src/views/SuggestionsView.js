import { RESOURCE_AREAS, getResourceAreaLabel } from "../data/resourceAreas.js";
import escapeHtml from "../utils/escapeHtml.js";

const MODE_TEXT = {
  "background-sync": {
    label: "Modo: Background Sync.",
    detail: "El navegador enviará la cola cuando vuelva la conexión, aunque cierres la app.",
  },
  "plan-b": {
    label: "Modo: reintento manual.",
    detail: "Este navegador no tiene Background Sync: la cola se envía al recuperar la conexión, al abrir la app o con «Reintentar ahora».",
  },
};

function formatDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function renderOutboxItems(items) {
  if (items.length === 0) {
    return '<li class="saved-resources-empty">No hay sugerencias pendientes de envío.</li>';
  }

  return items
    .map((item) => {
      const status = item.lastError
        ? `Último intento: ${escapeHtml(item.lastError)}. Se volverá a intentar.`
        : "Pendiente de envío.";

      return `
        <li class="outbox-item" data-outbox-item="${escapeHtml(item.id)}">
          <h3>${escapeHtml(item.topic)}</h3>
          <p>${escapeHtml(getResourceAreaLabel(item.area))} · guardada ${escapeHtml(formatDate(item.createdAt))}</p>
          <p class="outbox-item-status" ${item.lastError ? 'data-outbox-state="error"' : ""}>${status}</p>
        </li>
      `;
    })
    .join("");
}

export default async function SuggestionsView(_params = {}, outboxSync) {
  let items = [];
  let feedback = "";

  try {
    items = (await outboxSync?.getPending()) ?? [];
  } catch {
    feedback = "No se pudo leer la cola de envíos. Recarga la página e inténtalo de nuevo.";
  }

  const mode = outboxSync?.mode ?? "plan-b";
  const modeText = MODE_TEXT[mode];

  return `
    <section class="suggestions-view" aria-labelledby="suggestions-title">
      <h1 id="suggestions-title">Sugerir un tema</h1>
      <p class="page-summary">¿Falta un tema en el catálogo? Propónlo. La sugerencia se guarda primero en este dispositivo y se envía al servidor en cuanto haya conexión.</p>

      <form class="saved-resource-form suggestion-form" data-suggestion-form>
        <div class="form-field">
          <label for="suggestion-topic">Tema</label>
          <input id="suggestion-topic" name="suggestion-topic" type="text" maxlength="60" required>
        </div>
        <div class="form-field">
          <label for="suggestion-area">Área</label>
          <select id="suggestion-area" name="suggestion-area" required>
            ${RESOURCE_AREAS.map(({ value, label }) => `<option value="${value}">${label}</option>`).join("")}
          </select>
        </div>
        <div class="form-field suggestion-comment-field">
          <label for="suggestion-comment">¿Por qué agregarlo?</label>
          <textarea id="suggestion-comment" name="suggestion-comment" rows="3" maxlength="280" required></textarea>
        </div>
        <button class="save-resource-button" type="submit">Enviar sugerencia</button>
        <p class="saved-resource-feedback" data-suggestion-feedback aria-live="polite" ${feedback ? 'data-feedback-state="error"' : "hidden"}>${feedback}</p>
      </form>

      <section class="saved-resources-section" aria-labelledby="outbox-title">
        <div class="outbox-header">
          <h2 id="outbox-title">Envíos pendientes</h2>
          <p class="outbox-mode" data-outbox-mode="${mode}"><strong>${modeText.label}</strong> ${modeText.detail}</p>
          ${mode === "plan-b" ? '<button class="sw-button sw-button-secondary" type="button" data-outbox-retry>Reintentar ahora</button>' : ""}
        </div>
        <ul class="saved-resources-list" data-outbox-list>
          ${renderOutboxItems(items)}
        </ul>
        <p class="outbox-confirmation" data-outbox-confirmation aria-live="polite" hidden></p>
      </section>
    </section>
  `;
}
