import escapeHtml from "../utils/escapeHtml.js";

export const LOCATION_PURPOSE = "Si nos dices desde qué zona sugieres el tema, podremos priorizar contenido para esa región. Solo leemos tu ubicación al pulsar «Usar mi ubicación aproximada», la redondeamos a cerca de 1 km y la enviamos únicamente con esta sugerencia. También puedes escribir tu ciudad.";
// Sin geolocalización no hay botón, así que el texto no lo menciona.
export const LOCATION_PURPOSE_TEXT_ONLY = "Si nos dices desde qué ciudad o zona sugieres el tema, podremos priorizar contenido para esa región.";

export const PERMISSION_TEXT = Object.freeze({
  prompt: "Permiso de ubicación: aún sin decidir. El navegador te preguntará al pulsar el botón.",
  granted: "Permiso de ubicación: concedido. Solo se lee cuando pulsas el botón.",
  denied: "Permiso de ubicación: bloqueado para este sitio. Puedes escribir tu ciudad o zona, o reactivarlo con los pasos de abajo.",
  unknown: "Permiso de ubicación: este navegador no permite consultarlo por adelantado; lo sabrás al pulsar el botón.",
  "inferred-granted": "Permiso de ubicación: concedido (según el último intento).",
  "inferred-denied": "Permiso de ubicación: bloqueado (según el último intento).",
  unsupported: "Este navegador no puede obtener tu ubicación; escribe tu ciudad o zona.",
});

function hasCoordinates(location) {
  return Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude);
}

function formatCoordinates({ latitude, longitude }) {
  return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}

export const LOCATION_MESSAGES = Object.freeze({
  searching: "Buscando tu ubicación aproximada…",
  success: (location) => `Ubicación adjunta: zona aprox. ${formatCoordinates(location)} (±${location.radiusKm ?? 1} km). Se enviará con la sugerencia. Si quieres, escribe también tu ciudad.`,
  cleared: "Quitaste la ubicación. La sugerencia se enviará sin coordenadas.",
  reenabled: "El permiso de ubicación volvió a estar disponible. Ya puedes pulsar «Usar mi ubicación aproximada».",
  revoked: "Bloqueaste el permiso de ubicación, así que quitamos la zona que habías adjuntado. Puedes escribir tu ciudad o zona.",
});

export function isPermissionBlocked(state) {
  return state === "denied" || state === "inferred-denied";
}

export function renderPermissionStatus(state) {
  const key = Object.hasOwn(PERMISSION_TEXT, state) ? state : "unknown";
  return `<p class="location-permission" id="location-permission" data-location-permission data-state="${key}">${escapeHtml(PERMISSION_TEXT[key])}</p>`;
}

// Devuelve HTML ya escapado: el lugar lo escribió la persona.
export function describeLocation(location) {
  const place = location?.place ? `desde ${escapeHtml(location.place)}` : "";
  if (location?.source !== "device" || !hasCoordinates(location)) return place;

  const zone = `zona aprox. ${formatCoordinates(location)}`;
  return place ? `${place} (${zone})` : zone;
}

function renderHelp(open) {
  return `
    <details class="location-help sw-cache-guide" data-location-help ${open ? "open" : "hidden"}>
      <summary>Cómo volver a activar la ubicación</summary>
      <ul>
        <li><strong>iPhone o iPad (Safari):</strong> recarga la página y vuelve a pulsar el botón. Si ya no te pregunta, ve a Configuración › Apps › Safari › Ubicación y elige «Preguntar» o «Permitir». Si sigue bloqueada, revisa Configuración › Privacidad y seguridad › Localización: que esté activada y que «Sitios web de Safari» esté en «Al usar la app».</li>
        <li><strong>Chrome o Edge (computadora o Android):</strong> toca el ícono a la izquierda de la dirección (Ver información del sitio o Permisos) › Ubicación › Permitir.</li>
        <li><strong>App instalada:</strong> el permiso es el mismo que el del sitio. Abre la página en Chrome o Edge y sigue el paso anterior; después vuelve a la app.</li>
        <li><strong>Safari en Mac:</strong> Safari › Configuración › Sitios web › Ubicación › este sitio › Preguntar o Permitir.</li>
        <li><strong>Si el navegador ya tiene permiso y sigue fallando:</strong> activa la ubicación del sistema (Servicios de localización).</li>
      </ul>
      <p>Después vuelve a pulsar «Usar mi ubicación aproximada»; si no responde, recarga la página.</p>
    </details>
  `;
}

export default function LocationField({ permissionState = "unknown" } = {}) {
  // Sin geolocalización no se ofrece el botón: solo queda el campo de texto.
  const actions = permissionState === "unsupported"
    ? ""
    : `
      <div class="location-actions">
        <button class="sw-button sw-button-secondary" type="button" data-location-request aria-describedby="location-purpose">Usar mi ubicación aproximada</button>
        <button class="sw-button sw-button-secondary" type="button" data-location-clear hidden>Quitar ubicación</button>
      </div>
    `;

  return `
    <fieldset class="location-field" data-location-field>
      <legend>¿Desde dónde sugieres? (opcional)</legend>
      <div class="location-field-body">
        <p class="location-purpose" id="location-purpose">${escapeHtml(permissionState === "unsupported" ? LOCATION_PURPOSE_TEXT_ONLY : LOCATION_PURPOSE)}</p>
        ${renderPermissionStatus(permissionState)}
        ${actions}
        <p class="saved-resource-feedback location-result" data-location-result aria-live="polite" hidden></p>
        <div class="form-field">
          <label for="suggestion-place">Ciudad o zona (opcional)</label>
          <input id="suggestion-place" name="suggestion-place" type="text" maxlength="80" autocomplete="address-level2" aria-describedby="suggestion-place-hint">
          <p class="location-hint" id="suggestion-place-hint">Basta con la ciudad o la colonia; no escribas tu dirección.</p>
        </div>
        <input type="hidden" name="suggestion-location" value="" data-location-value>
        ${permissionState === "unsupported" ? "" : renderHelp(isPermissionBlocked(permissionState))}
      </div>
    </fieldset>
  `;
}
