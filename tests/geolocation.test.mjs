import test from "node:test";
import assert from "node:assert/strict";

import {
  LOCATION_ERROR_MESSAGES,
  LOCATION_OPTIONS,
  LocationError,
  NO_RESPONSE_MS,
  PROMPT_NO_RESPONSE_MS,
  createLocationService,
  parseLocationAttachment,
  readPosition,
  resolveLocationOptions,
  roundCoordinate,
  serializeLocation,
  toApproximateLocation,
} from "../src/pwa/geolocation.js";

const SAN_FRANCISCO = { latitude: 37.774929, longitude: -122.419416, accuracy: 35 };

// Doble de navigator.geolocation: guarda los callbacks para responder cuando la prueba quiera.
function createGeolocation({ respond } = {}) {
  return {
    calls: [],
    getCurrentPosition(success, failure, options) {
      this.calls.push({ success, failure, options });
      respond?.(success, failure);
    },
  };
}

// readPosition llama a los timers como funciones sueltas, así que no usan this.
function createTimers() {
  const pending = [];
  const cleared = [];
  return {
    pending,
    cleared,
    setTimer: (callback, ms) => pending.push({ callback, ms }),
    clearTimer: (id) => cleared.push(id),
  };
}

function createPermissionStatus(state) {
  return { state, onchange: null };
}

function createPermissions(states) {
  const statuses = [];
  return {
    statuses,
    async query(descriptor) {
      assert.deepEqual(descriptor, { name: "geolocation" });
      const status = createPermissionStatus(states.shift() ?? "prompt");
      statuses.push(status);
      return status;
    },
  };
}

test("the location options are frozen and ask for a fresh, coarse reading", () => {
  assert.equal(Object.isFrozen(LOCATION_OPTIONS), true);
  assert.deepEqual(LOCATION_OPTIONS, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 });
  assert.equal(NO_RESPONSE_MS, 45_000);
});

test("?timeout-ubicacion only turns the timeout into 0", () => {
  assert.equal(resolveLocationOptions(""), LOCATION_OPTIONS);
  assert.equal(resolveLocationOptions("?sin-sync"), LOCATION_OPTIONS);
  assert.equal(resolveLocationOptions(), LOCATION_OPTIONS);
  assert.deepEqual(resolveLocationOptions("?sin-sync&timeout-ubicacion"), {
    enableHighAccuracy: false,
    timeout: 0,
    maximumAge: 0,
  });
});

test("readPosition wraps getCurrentPosition in a Promise and stops the watchdog", async () => {
  const timers = createTimers();
  const geolocation = createGeolocation({ respond: (success) => success({ coords: SAN_FRANCISCO }) });

  const reading = readPosition({ geolocation, ...timers });

  assert.ok(reading instanceof Promise);
  assert.deepEqual(await reading, SAN_FRANCISCO);
  assert.equal(geolocation.calls.length, 1);
  assert.equal(geolocation.calls[0].options, LOCATION_OPTIONS);
  assert.equal(timers.pending[0].ms, NO_RESPONSE_MS);
  assert.deepEqual(timers.cleared, [1]);
});

test("each error code becomes a LocationError with its own message, ignoring error.message", async () => {
  const expected = [
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ];

  for (const [code, reason] of expected) {
    const geolocation = createGeolocation({ respond: (_success, failure) => failure({ code, message: "" }) });
    await assert.rejects(readPosition({ geolocation, ...createTimers() }), (error) => {
      assert.ok(error instanceof LocationError);
      assert.equal(error.name, "LocationError");
      assert.equal(error.code, code);
      assert.equal(error.reason, reason);
      assert.equal(error.message, LOCATION_ERROR_MESSAGES[code]);
      return true;
    });
  }

  const messages = [0, 1, 2, 3, "no-response"].map((key) => LOCATION_ERROR_MESSAGES[key]);
  assert.equal(new Set(messages).size, 5);
  assert.ok(messages.every((message) => message.length > 0));
  assert.doesNotMatch(LOCATION_ERROR_MESSAGES[3], /segundo/);
});

test("an unknown error code is treated as position unavailable", async () => {
  for (const nativeError of [{ code: 7, message: "raro" }, {}, undefined]) {
    const geolocation = createGeolocation({ respond: (_success, failure) => failure(nativeError) });
    await assert.rejects(readPosition({ geolocation, ...createTimers() }), { code: 2, reason: "unavailable" });
  }

  const throwing = { getCurrentPosition() { throw new TypeError("Illegal invocation"); } };
  await assert.rejects(readPosition({ geolocation: throwing, ...createTimers() }), { code: 2 });
});

test("without geolocation the reading fails with code 0", async () => {
  await assert.rejects(readPosition({ geolocation: undefined, ...createTimers() }), (error) => {
    assert.equal(error.code, 0);
    assert.equal(error.reason, "unsupported");
    assert.equal(error.message, LOCATION_ERROR_MESSAGES[0]);
    return true;
  });
});

test("the settled guard keeps only the first callback", async () => {
  const successFirst = createGeolocation({
    respond: (success, failure) => {
      success({ coords: SAN_FRANCISCO });
      failure({ code: 1 });
      success({ coords: { latitude: 0, longitude: 0, accuracy: 1 } });
    },
  });
  assert.deepEqual(await readPosition({ geolocation: successFirst, ...createTimers() }), SAN_FRANCISCO);

  const errorFirst = createGeolocation({
    respond: (success, failure) => {
      failure({ code: 3 });
      success({ coords: SAN_FRANCISCO });
    },
  });
  await assert.rejects(readPosition({ geolocation: errorFirst, ...createTimers() }), { code: 3, reason: "timeout" });
});

test("the watchdog rejects with no-response when the browser never answers", async () => {
  const timers = createTimers();
  const geolocation = createGeolocation();

  const reading = readPosition({ geolocation, watchdogMs: 45_000, ...timers });
  assert.equal(timers.pending.length, 1);
  assert.equal(timers.pending[0].ms, 45_000);
  timers.pending[0].callback();
  // Una respuesta que llega después del watchdog ya no cuenta.
  geolocation.calls[0].success({ coords: SAN_FRANCISCO });

  await assert.rejects(reading, (error) => {
    assert.equal(error.code, 3);
    assert.equal(error.reason, "no-response");
    assert.equal(error.message, LOCATION_ERROR_MESSAGES["no-response"]);
    assert.notEqual(error.message, LOCATION_ERROR_MESSAGES[3]);
    return true;
  });
});

test("coordinates are rounded to about 1 km and accuracy becomes a radius", () => {
  assert.equal(roundCoordinate(37.774929), 37.77);
  assert.equal(roundCoordinate(-122.419416), -122.42);
  assert.equal(roundCoordinate(19.43261, 3), 19.433);
  assert.deepEqual(toApproximateLocation(SAN_FRANCISCO), { latitude: 37.77, longitude: -122.42, radiusKm: 1 });
  assert.equal(toApproximateLocation({ ...SAN_FRANCISCO, accuracy: 2500 }).radiusKm, 3);
  assert.equal(toApproximateLocation({ latitude: 1, longitude: 1 }).radiusKm, 1);
});

test("a serialized location travels through the hidden input and is validated again", () => {
  const serialized = serializeLocation({ latitude: 37.77, longitude: -122.42, radiusKm: 1, accuracy: 35 });

  assert.equal(serialized, '{"latitude":37.77,"longitude":-122.42,"radiusKm":1}');
  assert.equal(serializeLocation(null), "");
  assert.deepEqual(parseLocationAttachment(serialized, ""), {
    source: "device",
    latitude: 37.77,
    longitude: -122.42,
    radiusKm: 1,
    place: null,
  });
  assert.deepEqual(
    parseLocationAttachment('{"latitude":37.774929,"longitude":-122.419416,"radiusKm":0.2}', "  San Francisco "),
    { source: "device", latitude: 37.77, longitude: -122.42, radiusKm: 1, place: "San Francisco" },
  );
});

test("without coordinates the typed place is attached as manual, and nothing gives null", () => {
  assert.deepEqual(parseLocationAttachment("", " La Paz, B.C.S. "), { source: "manual", place: "La Paz, B.C.S." });
  assert.deepEqual(parseLocationAttachment(undefined, "Mérida"), { source: "manual", place: "Mérida" });
  assert.equal(parseLocationAttachment("", "   "), null);
  assert.equal(parseLocationAttachment(undefined, undefined), null);
  assert.equal(parseLocationAttachment("", "x".repeat(120))?.place.length, 80);
});

test("invalid or out-of-range coordinates are discarded", () => {
  for (const serialized of [
    "{no es json",
    "null",
    "42",
    '{"latitude":"37.77","longitude":"-122.42"}',
    '{"latitude":91,"longitude":0}',
    '{"latitude":0,"longitude":-180.5}',
    '{"latitude":null,"longitude":10}',
  ]) {
    assert.equal(parseLocationAttachment(serialized, ""), null, serialized);
  }
  assert.deepEqual(parseLocationAttachment("{no es json", "Tijuana"), { source: "manual", place: "Tijuana" });
  assert.deepEqual(parseLocationAttachment('{"latitude":-90,"longitude":180}', ""), {
    source: "device",
    latitude: -90,
    longitude: 180,
    radiusKm: 1,
    place: null,
  });
});

test("support needs geolocation and a secure context, read on every call", () => {
  const navigatorObject = {};
  const browserWindow = { isSecureContext: true };
  const service = createLocationService({ navigatorObject, browserWindow });

  assert.equal(service.isSupported(), false);
  navigatorObject.geolocation = createGeolocation();
  assert.equal(service.isSupported(), true);
  browserWindow.isSecureContext = false;
  assert.equal(service.isSupported(), false);
  assert.equal(createLocationService({ navigatorObject, browserWindow: undefined }).isSupported(), true);
});

test("getApproximatePosition returns a rounded location and honors ?timeout-ubicacion", async () => {
  const geolocation = createGeolocation({ respond: (success) => success({ coords: SAN_FRANCISCO }) });
  const service = createLocationService({
    navigatorObject: { geolocation },
    browserWindow: { isSecureContext: true },
    search: "?timeout-ubicacion",
  });

  assert.deepEqual(await service.getApproximatePosition(), { latitude: 37.77, longitude: -122.42, radiusKm: 1 });
  assert.deepEqual(geolocation.calls[0].options, { enableHighAccuracy: false, timeout: 0, maximumAge: 0 });
});

test("getApproximatePosition rejects with code 0 without touching an unsupported API", async () => {
  const geolocation = createGeolocation();
  const service = createLocationService({
    navigatorObject: { geolocation },
    browserWindow: { isSecureContext: false },
  });

  await assert.rejects(service.getApproximatePosition(), { name: "LocationError", code: 0 });
  assert.equal(geolocation.calls.length, 0);
});

test("the permission state comes from the Permissions API without asking for a position", async () => {
  for (const state of ["granted", "prompt", "denied"]) {
    const geolocation = createGeolocation();
    const service = createLocationService({
      navigatorObject: { geolocation, permissions: createPermissions([state]) },
      browserWindow: {},
    });

    assert.equal(await service.getPermissionState(), state);
    assert.equal(geolocation.calls.length, 0);
  }

  const unsupported = createLocationService({ navigatorObject: { permissions: createPermissions(["granted"]) } });
  assert.equal(await unsupported.getPermissionState(), "unsupported");
});

test("without the Permissions API the state is unknown until an attempt is noted", async () => {
  const withoutApi = createLocationService({ navigatorObject: { geolocation: createGeolocation() }, browserWindow: {} });
  assert.equal(await withoutApi.getPermissionState(), "unknown");
  withoutApi.noteAttempt("granted");
  assert.equal(await withoutApi.getPermissionState(), "inferred-granted");
  withoutApi.noteAttempt("algo raro");
  assert.equal(await withoutApi.getPermissionState(), "inferred-granted");
  withoutApi.noteAttempt("denied");
  assert.equal(await withoutApi.getPermissionState(), "inferred-denied");

  const queryThrows = createLocationService({
    navigatorObject: {
      geolocation: createGeolocation(),
      permissions: {
        query() {
          throw new TypeError("geolocation is not a valid permission name");
        },
      },
    },
    browserWindow: {},
  });
  assert.equal(await queryThrows.getPermissionState(), "unknown");

  const queryMissing = createLocationService({
    navigatorObject: { geolocation: createGeolocation(), permissions: {} },
    browserWindow: {},
  });
  queryMissing.noteAttempt("denied");
  assert.equal(await queryMissing.getPermissionState(), "inferred-denied");
});

test("only the newest PermissionStatus keeps an onchange handler", async () => {
  const permissions = createPermissions(["prompt", "prompt", "denied"]);
  const service = createLocationService({
    navigatorObject: { geolocation: createGeolocation(), permissions },
    browserWindow: {},
  });
  const received = [];

  const unsubscribe = service.watchPermission((state) => received.push(state));
  await service.getPermissionState();
  await service.getPermissionState();

  const [first, second, newest] = permissions.statuses;
  assert.equal(first.onchange, null);
  assert.equal(second.onchange, null);
  assert.equal(typeof newest.onchange, "function");

  newest.state = "granted";
  newest.onchange();
  assert.deepEqual(received, ["granted"]);

  unsubscribe();
  assert.equal(newest.onchange, null);
});

test("watchPermission does nothing without the Permissions API", () => {
  const service = createLocationService({ navigatorObject: { geolocation: createGeolocation() }, browserWindow: {} });
  const unsubscribe = service.watchPermission(() => assert.fail("no debe avisar"));

  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
});

test("the watchdog waits longer while the permission prompt may still be open", async () => {
  for (const [state, expected] of [["granted", NO_RESPONSE_MS], ["prompt", PROMPT_NO_RESPONSE_MS]]) {
    const timers = [];
    const locationService = createLocationService({
      navigatorObject: {
        geolocation: {
          getCurrentPosition(success) {
            success({ coords: { latitude: 24.1426, longitude: -110.3128, accuracy: 30 } });
          },
        },
        permissions: { query: async () => ({ state, onchange: null }) },
      },
      browserWindow: { isSecureContext: true },
      setTimer: (callback, ms) => {
        timers.push(ms);
        return timers.length;
      },
      clearTimer() {},
    });

    locationService.watchPermission(() => {});
    await new Promise((resolve) => setImmediate(resolve));
    await locationService.getApproximatePosition();
    assert.deepEqual(timers, [expected], `${state} → ${expected} ms`);
  }
  assert.equal(PROMPT_NO_RESPONSE_MS, 180_000);
});

test("a Permissions API that never answers does not delay the reading", async () => {
  let reads = 0;
  const locationService = createLocationService({
    navigatorObject: {
      geolocation: {
        getCurrentPosition(success) {
          reads += 1;
          success({ coords: { latitude: 24.1426, longitude: -110.3128, accuracy: 30 } });
        },
      },
      permissions: { query: () => new Promise(() => {}) },
    },
    browserWindow: { isSecureContext: true },
  });
  locationService.watchPermission(() => {});

  const location = await locationService.getApproximatePosition();

  assert.equal(reads, 1);
  assert.deepEqual(location, { latitude: 24.14, longitude: -110.31, radiusKm: 1 });
});
