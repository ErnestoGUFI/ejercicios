import serviceWorkerDiagnostics from "../pwa/diagnostics.js";
import escapeHtml from "../utils/escapeHtml.js";

function yesNo(value, yes, no) {
  return value ? yes : no;
}

function renderScopeRows(checks) {
  return checks.map((check) => `
    <tr>
      <th scope="row">${escapeHtml(check.label)}</th>
      <td><code>${escapeHtml(check.url)}</code></td>
      <td><strong>${check.withinScope ? "Dentro" : "Fuera"}</strong></td>
    </tr>
  `).join("");
}

function renderRegistrations(registrations) {
  if (registrations.length === 0) {
    return '<p class="sw-empty">No hay registros de Service Worker en este origen.</p>';
  }

  return `
    <ol class="sw-registration-list">
      ${registrations.map((registration) => `
        <li>
          <dl>
            <div><dt>Scope</dt><dd><code>${escapeHtml(registration.scope)}</code></dd></div>
            <div><dt>Script</dt><dd><code>${escapeHtml(registration.scriptUrl)}</code></dd></div>
            <div><dt>Estado</dt><dd>${escapeHtml(registration.state)}</dd></div>
          </dl>
        </li>
      `).join("")}
    </ol>
  `;
}

function renderView(snapshot) {
  return `
    <section class="service-worker-view" aria-labelledby="sw-title">
      <h1 id="sw-title">Diagnóstico de Service Worker</h1>
      <p class="page-summary">Estado del registro, control de la página y alcance de las rutas del proyecto.</p>

      <dl class="sw-status-list">
        <div><dt>Soporte del navegador</dt><dd>${yesNo(snapshot.supported, "Sí, es compatible", "No es compatible")}</dd></div>
        <div><dt>Contexto seguro</dt><dd>${yesNo(snapshot.secureContext, "Sí", "No")}</dd></div>
        <div><dt>SW registrado</dt><dd>${yesNo(snapshot.registered, "Sí", "No")}</dd></div>
        <div><dt>Scope</dt><dd><code>${escapeHtml(snapshot.scope ?? "Sin registro")}</code></dd></div>
        <div><dt>URL del script</dt><dd><code>${escapeHtml(snapshot.scriptUrl ?? "Sin registro")}</code></dd></div>
        <div><dt>Estado del worker</dt><dd>${escapeHtml(snapshot.workerState)}</dd></div>
        <div><dt>Controla esta página</dt><dd>${yesNo(snapshot.controlled, "Sí", "No")}</dd></div>
        <div><dt>Controller</dt><dd><code>${escapeHtml(snapshot.controllerScriptUrl ?? "Sin controller")}</code></dd></div>
      </dl>

      <button class="sw-button" type="button" data-refresh-sw>Actualizar estado</button>

      <section class="sw-section" aria-labelledby="scope-title">
        <h2 id="scope-title">Verificador de scope</h2>
        <div class="sw-table-wrap">
          <table data-sw-scope-table>
            <caption class="sr-only">Rutas comprobadas contra el scope del Service Worker principal</caption>
            <thead><tr><th>Recurso</th><th>URL</th><th>Resultado</th></tr></thead>
            <tbody>${renderScopeRows(snapshot.scopeChecks)}</tbody>
          </table>
        </div>
      </section>

      <section class="sw-section" aria-labelledby="invalid-scope-title">
        <h2 id="invalid-scope-title">Prueba de scope inválido</h2>
        <p>El experimento usa una copia de <code>sw.js</code> dentro de <code>scope-test/</code> e intenta darle el scope de toda la aplicación. El navegador debe rechazarlo.</p>
        <button class="sw-button sw-button-secondary" type="button" data-test-invalid-scope>Probar scope inválido</button>
      </section>

      <section class="sw-section" aria-labelledby="narrow-scope-title">
        <h2 id="narrow-scope-title">Reto +10: scope estrecho</h2>
        <p>Este segundo registro usa el mismo <code>sw.js</code> con el scope <code>scope-demo/</code>. Dentro de esa carpeta gana el registro con el scope más específico.</p>
        <div class="sw-actions">
          <button class="sw-button sw-button-secondary" type="button" data-register-narrow-scope>Registrar scope estrecho</button>
          <a class="text-link" href="${escapeHtml(snapshot.narrowPageUrl)}">Abrir página del scope estrecho</a>
        </div>
        <h3>Registros encontrados</h3>
        ${renderRegistrations(snapshot.registrations)}
      </section>

      <p class="sw-feedback" data-sw-feedback aria-live="polite"></p>
    </section>
  `;
}

export default async function ServiceWorkerView(
  _params = {},
  diagnostics = serviceWorkerDiagnostics,
) {
  try {
    return renderView(await diagnostics.getSnapshot());
  } catch (error) {
    return `
      <section class="service-worker-view" aria-labelledby="sw-title">
        <h1 id="sw-title">Diagnóstico de Service Worker</h1>
        <div class="api-error" role="alert">
          <h2>No se pudo consultar el estado</h2>
          <p>${escapeHtml(error?.message ?? "El navegador rechazó la consulta.")}</p>
          <button class="sw-button" type="button" data-refresh-sw>Actualizar estado</button>
        </div>
      </section>
    `;
  }
}
