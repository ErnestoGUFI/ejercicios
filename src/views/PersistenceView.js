import PersistenceService from "../services/PersistenceService.js";
import escapeHtml from "../utils/escapeHtml.js";

export default function PersistenceView(
  _params = {},
  persistence = new PersistenceService(),
) {
  const { theme, newsSearch, visits } = persistence.getSnapshot();
  const themeLabel = theme === "dark" ? "Oscuro" : "Claro";
  const searchLabel = newsSearch || "Sin búsqueda guardada";
  const visitsLabel = `${visits} ${visits === 1 ? "apertura" : "aperturas"}`;

  return `
    <section class="persistence-view" aria-labelledby="persistence-title">
      <h1 id="persistence-title">Persistencia</h1>
      <p class="page-summary">Datos que la aplicación conserva en este navegador.</p>
      <ul class="persistence-list">
        <li class="persistence-row">
          <div>
            <h2>Tema <span>localStorage</span></h2>
            <p>${themeLabel}</p>
          </div>
          <button type="button" data-clear-persistence="theme">Limpiar tema</button>
        </li>
        <li class="persistence-row">
          <div>
            <h2>Búsqueda de noticias <span>sessionStorage</span></h2>
            <p>${escapeHtml(searchLabel)}</p>
          </div>
          <button type="button" data-clear-persistence="news-search">Limpiar búsqueda</button>
        </li>
        <li class="persistence-row">
          <div>
            <h2>Contador de aperturas <span>Cookie</span></h2>
            <p>${visitsLabel}</p>
          </div>
          <button type="button" data-clear-persistence="visits">Limpiar contador</button>
        </li>
      </ul>
    </section>
  `;
}
