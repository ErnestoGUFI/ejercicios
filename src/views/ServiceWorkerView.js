import serviceWorkerDiagnostics from "../pwa/diagnostics.js";
import cacheDebugService from "../services/CacheDebugService.js";
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

function renderCacheEntries(cacheSnapshot) {
  if (cacheSnapshot.error) {
    return `<p class="sw-empty" role="status">No se pudo consultar Cache Storage: ${escapeHtml(cacheSnapshot.error)}</p>`;
  }

  if (cacheSnapshot.entries.length === 0) {
    return '<p class="sw-empty" data-cache-empty>La caché todavía no tiene entradas.</p>';
  }

  return `
    <div class="sw-table-wrap">
      <table data-cache-entries>
        <caption class="sr-only">Recursos almacenados en la versión actual de la caché</caption>
        <thead><tr><th>Recurso</th><th>Estado</th><th>Tipo</th><th>Acción</th></tr></thead>
        <tbody>
          ${cacheSnapshot.entries.map((entry) => `
            <tr>
              <th scope="row"><code>${escapeHtml(entry.path)}</code></th>
              <td>${escapeHtml(entry.status ?? "—")}</td>
              <td>${escapeHtml(entry.contentType)}</td>
              <td><button class="sw-button sw-button-secondary" type="button" data-delete-cache-entry data-cache-url="${escapeHtml(entry.url)}">Eliminar</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function cacheDemoNotice(snapshot) {
  if (!snapshot.supported) {
    return "Este navegador no soporta Service Workers; la demostración de caché requiere un navegador compatible.";
  }

  if (snapshot.workerState === "installing") {
    return "La nueva versión del Service Worker se está instalando. Espera a que termine y actualiza el estado antes de probar la caché.";
  }

  if (snapshot.workerState === "installed") {
    return "Hay una versión del Service Worker instalada y esperando activación. Cierra otras pestañas del proyecto y vuelve a cargar la página.";
  }

  if (snapshot.workerState === "activating") {
    return "El Service Worker se está activando. Espera a que termine y vuelve a cargar la página.";
  }

  if (!snapshot.controlled) {
    return "El Service Worker todavía no controla esta pestaña. Vuelve a cargar la página cuando el registro esté activo para probar el almacenamiento.";
  }

  return "";
}

function renderView(snapshot, cacheSnapshot) {
  const demoNotice = cacheDemoNotice(snapshot);
  const canLoadDemo = snapshot.controlled && snapshot.workerState === "activated";

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

      <section class="sw-section" aria-labelledby="cache-storage-title">
        <h2 id="cache-storage-title">Cache Storage</h2>
        <p>Inspecciona la caché activa y elimina una entrada para comprobar cómo se vuelve a solicitar desde la red.</p>
        <p class="sw-cache-guide">Para comprobar un dato obsoleto, carga este JSON, cambia su contenido en el servidor sin cambiar la versión de caché y vuelve a cargarlo. Se servirá el valor guardado; después elimínalo de la lista y cárgalo otra vez para recibir el valor nuevo.</p>
        <p class="sw-cache-version">Versión actual: <code>${escapeHtml(cacheSnapshot.cacheName ?? "Sin caché activa")}</code></p>
        ${demoNotice ? `<p class="sw-cache-notice" id="cache-control-note" role="status">${escapeHtml(demoNotice)}</p>` : ""}
        <div class="sw-actions">
          <button class="sw-button sw-button-secondary" type="button" data-refresh-cache>Actualizar lista</button>
          <button class="sw-button sw-button-secondary" type="button" data-load-cache-demo${canLoadDemo ? "" : ' disabled aria-describedby="cache-control-note"'}>Cargar dato de demostración</button>
        </div>
        ${renderCacheEntries(cacheSnapshot)}
        <pre class="sw-cache-output" data-cache-demo-output aria-live="polite">Aún no se ha solicitado el dato de demostración.</pre>
      </section>

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
  cacheDebug = cacheDebugService,
) {
  try {
    const snapshot = await diagnostics.getSnapshot();
    const cacheSnapshot = await cacheDebug.listEntries().catch((error) => ({
      cacheName: null,
      entries: [],
      error: error?.message ?? "La consulta fue rechazada.",
    }));
    return renderView(snapshot, cacheSnapshot);
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
