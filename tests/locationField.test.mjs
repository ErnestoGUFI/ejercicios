import test from "node:test";
import assert from "node:assert/strict";

import LocationField, {
  LOCATION_MESSAGES,
  LOCATION_PURPOSE,
  PERMISSION_TEXT,
  describeLocation,
  renderPermissionStatus,
} from "../src/components/LocationField.js";

const PERMISSION_STATES = ["granted", "prompt", "denied", "unknown", "inferred-granted", "inferred-denied", "unsupported"];

test("the fieldset explains the purpose before the button and keeps the city field visible", () => {
  const html = LocationField({ permissionState: "prompt" });

  assert.match(html, /<fieldset class="location-field" data-location-field>/);
  assert.match(html, /<legend>¿Desde dónde sugieres\? \(opcional\)<\/legend>/);
  assert.match(html, /<p class="location-purpose" id="location-purpose">Si nos dices desde qué zona sugieres el tema/);
  assert.ok(html.includes(LOCATION_PURPOSE));
  assert.ok(html.indexOf('id="location-purpose"') < html.indexOf("data-location-request"));
  assert.match(
    html,
    /<button class="sw-button sw-button-secondary" type="button" data-location-request aria-describedby="location-purpose">Usar mi ubicación aproximada<\/button>/,
  );
  assert.match(html, /<button class="sw-button sw-button-secondary" type="button" data-location-clear hidden>Quitar ubicación<\/button>/);
  assert.match(html, /data-location-permission data-state="prompt">Permiso de ubicación: aún sin decidir\./);
  assert.match(html, /<label for="suggestion-place">Ciudad o zona \(opcional\)<\/label>/);
  assert.match(html, /<input id="suggestion-place" name="suggestion-place" type="text" maxlength="80" autocomplete="address-level2"/);
  assert.match(html, /Basta con la ciudad o la colonia; no escribas tu dirección\./);
  assert.match(html, /<input type="hidden" name="suggestion-location" value="" data-location-value>/);
  assert.match(html, /<p class="saved-resource-feedback location-result" data-location-result aria-live="polite" hidden><\/p>/);
});

test("the help to turn location back on starts hidden unless the permission is blocked", () => {
  const prompt = LocationField({ permissionState: "prompt" });
  assert.match(prompt, /<details class="location-help sw-cache-guide" data-location-help hidden>/);
  assert.match(prompt, /<summary>Cómo volver a activar la ubicación<\/summary>/);
  for (const platform of ["iPhone o iPad (Safari):", "Chrome o Edge (computadora o Android):", "Safari en Mac:", "Si el navegador ya tiene permiso y sigue fallando:"]) {
    assert.ok(prompt.includes(`<strong>${platform}</strong>`), platform);
  }
  assert.match(prompt, /Después vuelve a pulsar «Usar mi ubicación aproximada»; si no responde, recarga la página\./);

  for (const state of ["denied", "inferred-denied"]) {
    assert.match(LocationField({ permissionState: state }), /data-location-help open>/);
  }
});

test("without geolocation the button is not rendered but the city field is", () => {
  const html = LocationField({ permissionState: "unsupported" });

  assert.doesNotMatch(html, /data-location-request/);
  assert.doesNotMatch(html, /data-location-clear/);
  assert.match(html, /data-state="unsupported">Este navegador no puede obtener tu ubicación; escribe tu ciudad o zona\./);
  assert.match(html, /id="suggestion-place"/);
  assert.match(html, /data-location-value/);
});

test("every permission state has its own text and unknown values fall back to unknown", () => {
  assert.deepEqual(Object.keys(PERMISSION_TEXT).sort(), [...PERMISSION_STATES].sort());
  assert.equal(new Set(Object.values(PERMISSION_TEXT)).size, PERMISSION_STATES.length);
  assert.match(PERMISSION_TEXT.unknown, /no permite consultarlo por adelantado/);
  assert.equal(PERMISSION_TEXT["inferred-granted"], "Permiso de ubicación: concedido (según el último intento).");
  assert.equal(PERMISSION_TEXT["inferred-denied"], "Permiso de ubicación: bloqueado (según el último intento).");

  assert.match(renderPermissionStatus("denied"), /data-state="denied">Permiso de ubicación: bloqueado para este sitio\./);
  assert.match(renderPermissionStatus('"><script>'), /data-state="unknown">/);
  assert.match(LocationField(), /data-state="unknown"/);
});

test("the success message shows the rounded zone and the radius", () => {
  assert.equal(
    LOCATION_MESSAGES.success({ latitude: 37.77, longitude: -122.42, radiusKm: 1 }),
    "Ubicación adjunta: zona aprox. 37.77, -122.42 (±1 km). Se enviará con la sugerencia. Si quieres, escribe también tu ciudad.",
  );
  assert.equal(LOCATION_MESSAGES.searching, "Buscando tu ubicación aproximada…");
  assert.equal(LOCATION_MESSAGES.cleared, "Quitaste la ubicación. La sugerencia se enviará sin coordenadas.");
});

test("describeLocation summarizes the attachment and escapes the typed place", () => {
  assert.equal(describeLocation({ source: "manual", place: "La Paz, B.C.S." }), "desde La Paz, B.C.S.");
  assert.equal(
    describeLocation({ source: "device", latitude: 37.77, longitude: -122.42, radiusKm: 1, place: null }),
    "zona aprox. 37.77, -122.42",
  );
  assert.equal(
    describeLocation({ source: "device", latitude: 19.4, longitude: -99.13, radiusKm: 2, place: "Coyoacán" }),
    "desde Coyoacán (zona aprox. 19.40, -99.13)",
  );
  assert.equal(describeLocation({ source: "manual", place: "<img src=x>" }), "desde &lt;img src=x&gt;");
  assert.equal(describeLocation({ source: "device", latitude: "37.77", longitude: null }), "");
  assert.equal(describeLocation(null), "");
  assert.equal(describeLocation(undefined), "");
});

test("without geolocation the purpose does not mention a button that is not shown", () => {
  const html = LocationField({ permissionState: "unsupported" });

  assert.doesNotMatch(html, /Usar mi ubicación aproximada/);
  assert.match(html, /desde qué ciudad o zona sugieres el tema/);
});

test("the iPhone help uses the Mexican Spanish name of the Settings app", () => {
  const html = LocationField({ permissionState: "denied" });

  assert.match(html, /Configuración › Privacidad y seguridad › Localización/);
  assert.doesNotMatch(html, /Ajustes/);
});
