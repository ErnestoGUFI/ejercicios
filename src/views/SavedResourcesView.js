import { RESOURCE_AREAS, getResourceAreaLabel } from "../data/resourceAreas.js";
import dbService from "../services/dbService.js";
import escapeHtml from "../utils/escapeHtml.js";
import safeUrl from "../utils/safeUrl.js";

function renderAreaOptions(includeAll = false) {
  const options = RESOURCE_AREAS.map(
    ({ value, label }) => `<option value="${value}">${label}</option>`,
  );

  if (includeAll) options.unshift('<option value="all">Todas las áreas</option>');
  return options.join("");
}

export function renderSavedResourcesList(resources) {
  if (resources.length === 0) {
    return '<li class="saved-resources-empty">Todavía no hay recursos guardados.</li>';
  }

  return resources
    .map((resource) => {
      const title = escapeHtml(resource.title);
      const id = escapeHtml(resource.id);
      const url = escapeHtml(safeUrl(resource.url));
      const area = escapeHtml(getResourceAreaLabel(resource.area));

      return `
        <li class="saved-resource-item">
          <div>
            <h3><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
            <p>${area}</p>
          </div>
          <button type="button" data-delete-resource="${id}" aria-label="Eliminar ${title}">Eliminar</button>
        </li>
      `;
    })
    .join("");
}

export default async function SavedResourcesView(
  _params = {},
  database = dbService,
) {
  let resources = [];
  let feedback = "";

  try {
    resources = await database.getAllResources();
  } catch {
    feedback = "No se pudieron leer los recursos guardados. Inténtalo de nuevo.";
  }

  return `
    <section class="saved-resources-view" aria-labelledby="saved-resources-title">
      <h1 id="saved-resources-title">Recursos guardados</h1>
      <p class="page-summary">Guarda enlaces de programación para consultarlos después.</p>

      <form class="saved-resource-form" data-saved-resource-form>
        <div class="form-field">
          <label for="resource-title">Título</label>
          <input id="resource-title" name="resource-title" type="text" maxlength="100" required>
        </div>
        <div class="form-field">
          <label for="resource-url">URL</label>
          <input id="resource-url" name="resource-url" type="url" inputmode="url" required>
        </div>
        <div class="form-field">
          <label for="resource-area">Área</label>
          <select id="resource-area" name="resource-area" required>
            ${renderAreaOptions()}
          </select>
        </div>
        <button class="save-resource-button" type="submit">Guardar recurso</button>
        <p class="saved-resource-feedback" data-saved-resource-feedback aria-live="polite" ${feedback ? 'data-feedback-state="error"' : "hidden"}>${feedback}</p>
      </form>

      <section class="saved-resources-section" aria-labelledby="saved-resources-list-title">
        <div class="saved-resources-toolbar">
          <h2 id="saved-resources-list-title">Lista guardada</h2>
          <div class="filter-field">
            <label for="resource-area-filter">Filtrar por área</label>
            <select id="resource-area-filter" data-resource-area-filter>
              ${renderAreaOptions(true)}
            </select>
          </div>
        </div>
        <ul class="saved-resources-list" data-saved-resources-list>
          ${renderSavedResourcesList(resources)}
        </ul>
      </section>
    </section>
  `;
}
