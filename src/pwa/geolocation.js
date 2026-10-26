// enableHighAccuracy: false → solo necesitamos la zona y la redondeamos a ~1 km. Pedir GPS fino tarda más,
//   gasta batería y recoge más precisión de la que guardamos. Con Wi-Fi o red celular basta.
// timeout: 10 000 ms → por defecto es Infinity y el botón podría quedarse en «Buscando…». Diez segundos alcanzan
//   para una lectura en frío; si no llega, ofrecemos escribir la ciudad. El tiempo que la persona tarda en
//   decidir el permiso no cuenta para este plazo.
// maximumAge: 0 → solo se lee una vez por clic, así que pedir una posición nueva no cuesta lecturas repetidas.
//   La zona corresponde al momento de la sugerencia. Además, cada cambio en DevTools › Sensors se refleja en el
//   siguiente clic: con maximumAge > 0, Chrome devuelve la posición en caché aunque Sensors diga «Location unavailable».
// ?timeout-ubicacion (gancho de prueba, igual que ?sin-sync) → timeout: 0 para provocar un TIMEOUT real.
// El watchdog de 45 s (NO_RESPONSE_MS) no es una opción de la API: cubre a los navegadores que nunca llaman a los callbacks.
//   Si el permiso aún no está concedido, el aviso puede seguir abierto mientras la persona decide; entonces espera 3 min.
export const LOCATION_OPTIONS = Object.freeze({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 });
export const NO_RESPONSE_MS = 45_000;
export const PROMPT_NO_RESPONSE_MS = 180_000;

export const LOCATION_ERROR_MESSAGES = Object.freeze({
  0: "Este navegador no puede obtener tu ubicación. Escribe tu ciudad o zona; la sugerencia funciona igual.",
  1: "No diste permiso para usar tu ubicación. No pasa nada: escribe tu ciudad o zona en el campo de abajo y la sugerencia se envía igual. Abajo te explicamos cómo volver a activarla.",
  2: "Tu dispositivo no pudo calcular dónde estás: puede que la ubicación del sistema esté apagada o que no haya señal de GPS, Wi-Fi o red móvil. Inténtalo de nuevo en un momento o escribe tu ciudad o zona.",
  3: "La ubicación tardó demasiado en llegar y dejamos de esperar. Vuelve a intentarlo (suele ser más rápido con el Wi-Fi encendido) o escribe tu ciudad o zona.",
  "no-response": "El navegador no respondió a la solicitud de ubicación. Vuelve a intentarlo o escribe tu ciudad o zona.",
});

const ERROR_REASONS = { 0: "unsupported", 1: "denied", 2: "unavailable", 3: "timeout" };
const PERMISSION_STATES = ["granted", "prompt", "denied"];
const MAX_PLACE_LENGTH = 80;

export class LocationError extends Error {
  constructor(code, reason = ERROR_REASONS[code]) {
    super(LOCATION_ERROR_MESSAGES[reason === "no-response" ? "no-response" : code]);
    this.name = "LocationError";
    this.code = code;
    this.reason = reason;
  }
}

// Solo cuenta error.code: Chrome manda el código 2 con el mensaje vacío.
function toLocationError(error) {
  return new LocationError([1, 2, 3].includes(error?.code) ? error.code : 2);
}

export function resolveLocationOptions(search = "") {
  const params = new URLSearchParams(search ?? "");
  return params.has("timeout-ubicacion") ? { ...LOCATION_OPTIONS, timeout: 0 } : LOCATION_OPTIONS;
}

export function roundCoordinate(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toRadiusKm(meters) {
  return Number.isFinite(meters) ? Math.max(1, Math.ceil(meters / 1000)) : 1;
}

export function toApproximateLocation(coords) {
  return {
    latitude: roundCoordinate(coords.latitude),
    longitude: roundCoordinate(coords.longitude),
    radiusKm: toRadiusKm(coords.accuracy),
  };
}

export function readPosition({
  geolocation,
  options = LOCATION_OPTIONS,
  watchdogMs = NO_RESPONSE_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  return new Promise((resolve, reject) => {
    if (typeof geolocation?.getCurrentPosition !== "function") {
      reject(new LocationError(0));
      return;
    }

    let settled = false;
    let timer;
    function finish(settle, value) {
      if (settled) return;
      settled = true;
      clearTimer(timer);
      settle(value);
    }

    // El watchdog se arma antes de la llamada por si el navegador responde de forma síncrona.
    timer = setTimer(() => finish(reject, new LocationError(3, "no-response")), watchdogMs);
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => finish(resolve, {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }),
        (error) => finish(reject, toLocationError(error)),
        options,
      );
    } catch (error) {
      finish(reject, toLocationError(error));
    }
  });
}

export function serializeLocation(location) {
  if (!location) return "";
  const { latitude, longitude, radiusKm } = location;
  return JSON.stringify({ latitude, longitude, radiusKm });
}

function parseDeviceLocation(serialized) {
  if (typeof serialized !== "string" || serialized.trim() === "") return null;

  let data;
  try {
    data = JSON.parse(serialized);
  } catch {
    return null;
  }

  const { latitude, longitude, radiusKm } = data ?? {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
    radiusKm: Number.isFinite(radiusKm) ? Math.max(1, Math.ceil(radiusKm)) : 1,
  };
}

function cleanPlace(placeText) {
  const place = String(placeText ?? "").trim().slice(0, MAX_PLACE_LENGTH).trim();
  return place || null;
}

export function parseLocationAttachment(serialized, placeText) {
  const device = parseDeviceLocation(serialized);
  const place = cleanPlace(placeText);

  if (device) return { source: "device", ...device, place };
  return place ? { source: "manual", place } : null;
}

export function createLocationService({
  navigatorObject = globalThis.navigator,
  browserWindow = globalThis.window,
  search = "",
  options,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const readOptions = options ?? resolveLocationOptions(search);
  const listeners = new Set();
  let currentStatus = null;
  let lastAttempt = null;

  function isSupported() {
    return Boolean(navigatorObject && "geolocation" in navigatorObject)
      && browserWindow?.isSecureContext !== false;
  }

  function inferredState() {
    if (lastAttempt === "granted") return "inferred-granted";
    if (lastAttempt === "denied") return "inferred-denied";
    return "unknown";
  }

  function stateOf(status) {
    return PERMISSION_STATES.includes(status?.state) ? status.state : inferredState();
  }

  // Solo el PermissionStatus más reciente avisa de cambios; el anterior se desconecta.
  function watchStatus(status) {
    if (listeners.size === 0) return;
    if (currentStatus && currentStatus !== status) currentStatus.onchange = null;
    currentStatus = status;
    status.onchange = () => listeners.forEach((listener) => listener(stateOf(status)));
  }

  // query() no abre ningún aviso; si no existe o lanza, se usa el estado deducido.
  async function queryPermission() {
    if (typeof navigatorObject?.permissions?.query !== "function") return null;

    let status;
    try {
      status = await navigatorObject.permissions.query({ name: "geolocation" });
    } catch {
      return null;
    }
    if (status) watchStatus(status);
    return status ?? null;
  }

  async function getApproximatePosition() {
    if (!isSupported()) throw new LocationError(0);
    // El plazo se elige con el último estado conocido, sin otra consulta que retrase la lectura.
    const known = currentStatus ? stateOf(currentStatus) : inferredState();
    const watchdogMs = known === "granted" || known === "inferred-granted" ? NO_RESPONSE_MS : PROMPT_NO_RESPONSE_MS;
    const coords = await readPosition({
      geolocation: navigatorObject.geolocation,
      options: readOptions,
      watchdogMs,
      setTimer,
      clearTimer,
    });
    return toApproximateLocation(coords);
  }

  async function getPermissionState() {
    if (!isSupported()) return "unsupported";
    const status = await queryPermission();
    return status ? stateOf(status) : inferredState();
  }

  function watchPermission(listener) {
    listeners.add(listener);
    if (isSupported()) queryPermission();

    return () => {
      listeners.delete(listener);
      if (listeners.size > 0 || !currentStatus) return;
      currentStatus.onchange = null;
      currentStatus = null;
    };
  }

  function noteAttempt(outcome) {
    if (outcome === "granted" || outcome === "denied") lastAttempt = outcome;
  }

  return { isSupported, getApproximatePosition, getPermissionState, watchPermission, noteAttempt };
}
