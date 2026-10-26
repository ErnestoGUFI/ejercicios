import test from "node:test";
import assert from "node:assert/strict";

import LocationController from "../src/controllers/LocationController.js";
import LocationField, { LOCATION_MESSAGES, PERMISSION_TEXT } from "../src/components/LocationField.js";
import { LOCATION_ERROR_MESSAGES, LocationError, createLocationService } from "../src/pwa/geolocation.js";

const ZONE = { latitude: 37.77, longitude: -122.42, radiusKm: 1 };

function createElement(selector, initial = {}) {
  return {
    hidden: false,
    disabled: false,
    open: false,
    connected: true,
    value: "",
    textContent: "",
    dataset: {},
    focusCalls: 0,
    focus() {
      this.focusCalls += 1;
    },
    closest(query) {
      return query === selector ? this : null;
    },
    ...initial,
  };
}

function createDocument() {
  const elements = {
    "[data-location-request]": createElement("[data-location-request]"),
    "[data-location-clear]": createElement("[data-location-clear]", { hidden: true }),
    "[data-location-result]": createElement("[data-location-result]", { hidden: true }),
    "[data-location-permission]": createElement("[data-location-permission]", { dataset: { state: "prompt" } }),
    "[data-location-value]": createElement("[data-location-value]"),
    "[data-location-help]": createElement("[data-location-help]", { hidden: true }),
    "#suggestion-place": createElement("#suggestion-place"),
  };
  const listeners = {};
  return {
    elements,
    listeners,
    addEventListener(type, listener) {
      (listeners[type] ??= []).push(listener);
    },
    querySelector: (selector) => elements[selector] ?? null,
    contains: (element) => element.connected,
    dispatch(type, event) {
      return Promise.all((listeners[type] ?? []).map((listener) => listener(event)));
    },
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createService({ respond = async () => ({ ...ZONE }), permissionAfter = "granted" } = {}) {
  return {
    reads: 0,
    attempts: [],
    watchers: [],
    respond,
    permissionAfter,
    getApproximatePosition() {
      this.reads += 1;
      return this.respond();
    },
    async getPermissionState() {
      return this.permissionAfter;
    },
    watchPermission(listener) {
      this.watchers.push(listener);
      return () => {};
    },
    noteAttempt(outcome) {
      this.attempts.push(outcome);
    },
  };
}

function setup(serviceOptions) {
  const document = createDocument();
  const locationService = createService(serviceOptions);
  const controller = new LocationController({ document, locationService });
  controller.init();
  const click = (selector) => document.dispatch("click", { target: document.elements[selector] });
  return { document, elements: document.elements, locationService, controller, click };
}

test("rendering and init never read the position; only the click does", async () => {
  const geolocation = {
    calls: [],
    getCurrentPosition(success, _failure, options) {
      this.calls.push(options);
      success({ coords: { latitude: 37.774929, longitude: -122.419416, accuracy: 20 } });
    },
  };
  let queries = 0;
  const locationService = createLocationService({
    navigatorObject: {
      geolocation,
      permissions: {
        async query() {
          queries += 1;
          return { state: "granted", onchange: null };
        },
      },
    },
    browserWindow: { isSecureContext: true },
  });
  const document = createDocument();

  const html = LocationField({ permissionState: await locationService.getPermissionState() });
  new LocationController({ document, locationService }).init();

  assert.ok(html.indexOf("location-purpose") < html.indexOf("data-location-request"));
  assert.deepEqual(Object.keys(document.listeners).sort(), ["click", "reset"]);
  assert.equal(geolocation.calls.length, 0);
  assert.ok(queries >= 1);

  await document.dispatch("click", { target: document.elements["[data-location-request]"] });

  assert.equal(geolocation.calls.length, 1);
  assert.equal(geolocation.calls[0].maximumAge, 0);
  assert.equal(document.elements["[data-location-value]"].value, '{"latitude":37.77,"longitude":-122.42,"radiusKm":1}');
});

test("a successful reading attaches the rounded zone and offers Quitar ubicación", async () => {
  const deferred = createDeferred();
  const { elements, locationService, click } = setup({ respond: () => deferred.promise });
  const button = elements["[data-location-request]"];

  const clicking = click("[data-location-request]");
  assert.equal(button.disabled, true);
  assert.equal(elements["[data-location-result]"].textContent, LOCATION_MESSAGES.searching);
  assert.equal(elements["[data-location-result]"].dataset.feedbackState, "info");
  assert.equal(elements["[data-location-result]"].hidden, false);

  deferred.resolve({ ...ZONE });
  await clicking;

  assert.equal(button.disabled, false);
  assert.deepEqual(JSON.parse(elements["[data-location-value]"].value), ZONE);
  assert.equal(elements["[data-location-clear]"].hidden, false);
  assert.equal(elements["[data-location-result]"].dataset.feedbackState, "success");
  assert.equal(
    elements["[data-location-result]"].textContent,
    "Ubicación adjunta: zona aprox. 37.77, -122.42 (±1 km). Se enviará con la sugerencia. Si quieres, escribe también tu ciudad.",
  );
  assert.deepEqual(locationService.attempts, ["granted"]);
  assert.equal(elements["[data-location-permission]"].dataset.state, "granted");
  assert.equal(elements["[data-location-permission]"].textContent, PERMISSION_TEXT.granted);
});

test("a second click while searching does not ask again", async () => {
  const deferred = createDeferred();
  const { locationService, click } = setup({ respond: () => deferred.promise });

  const first = click("[data-location-request]");
  await click("[data-location-request]");
  deferred.resolve({ ...ZONE });
  await first;

  assert.equal(locationService.reads, 1);
});

test("a denial is neutral, opens the help and moves focus to Ciudad o zona", async () => {
  const { elements, locationService, click } = setup({
    respond: async () => {
      throw new LocationError(1);
    },
    permissionAfter: "inferred-denied",
  });

  await click("[data-location-request]");

  assert.equal(elements["[data-location-result]"].dataset.feedbackState, "info");
  assert.equal(elements["[data-location-result]"].textContent, LOCATION_ERROR_MESSAGES[1]);
  assert.equal(elements["[data-location-help]"].hidden, false);
  assert.equal(elements["[data-location-help]"].open, true);
  assert.equal(elements["#suggestion-place"].focusCalls, 1);
  assert.equal(elements["[data-location-value]"].value, "");
  assert.equal(elements["[data-location-request]"].disabled, false);
  assert.deepEqual(locationService.attempts, ["denied"]);
  assert.equal(elements["[data-location-permission]"].dataset.state, "inferred-denied");
  assert.equal(elements["[data-location-permission]"].textContent, PERMISSION_TEXT["inferred-denied"]);
});

test("a prompt state read after a dismissed prompt keeps the help open", async () => {
  const { elements, click } = setup({
    respond: async () => {
      throw new LocationError(1);
    },
    permissionAfter: "prompt",
  });

  await click("[data-location-request]");

  assert.equal(elements["[data-location-permission]"].dataset.state, "prompt");
  assert.equal(elements["[data-location-help]"].hidden, false);
});

test("unavailable, timeout and no-response show different errors and re-enable the button", async () => {
  const cases = [
    [new LocationError(2), ["granted"]],
    [new LocationError(3), ["granted"]],
    [new LocationError(3, "no-response"), []],
  ];
  const texts = [];

  for (const [error, attempts] of cases) {
    const { elements, locationService, click } = setup({
      respond: async () => {
        throw error;
      },
    });

    await click("[data-location-request]");

    assert.equal(elements["[data-location-result]"].dataset.feedbackState, "error");
    assert.equal(elements["[data-location-request]"].disabled, false);
    assert.equal(elements["[data-location-value]"].value, "");
    assert.equal(elements["[data-location-clear]"].hidden, true);
    assert.equal(elements["[data-location-help]"].hidden, true);
    assert.equal(elements["#suggestion-place"].focusCalls, 0);
    assert.deepEqual(locationService.attempts, attempts);
    texts.push(elements["[data-location-result]"].textContent);
  }

  assert.deepEqual(texts, [LOCATION_ERROR_MESSAGES[2], LOCATION_ERROR_MESSAGES[3], LOCATION_ERROR_MESSAGES["no-response"]]);
});

test("an unexpected failure is reported as position unavailable", async () => {
  const { elements, click } = setup({
    respond: async () => {
      throw new Error("");
    },
  });

  await click("[data-location-request]");

  assert.equal(elements["[data-location-result]"].textContent, LOCATION_ERROR_MESSAGES[2]);
});

test("without geolocation the click explains the alternative in a neutral tone", async () => {
  const { elements, locationService, click } = setup({
    respond: async () => {
      throw new LocationError(0);
    },
  });

  await click("[data-location-request]");

  assert.equal(elements["[data-location-result]"].dataset.feedbackState, "info");
  assert.equal(elements["[data-location-result]"].textContent, LOCATION_ERROR_MESSAGES[0]);
  assert.deepEqual(locationService.attempts, []);
});

test("a late answer is ignored when the button already left the document", async () => {
  const deferred = createDeferred();
  const { elements, click } = setup({ respond: () => deferred.promise });

  const clicking = click("[data-location-request]");
  elements["[data-location-request]"].connected = false;
  deferred.resolve({ ...ZONE });
  await clicking;

  assert.equal(elements["[data-location-value]"].value, "");
  assert.equal(elements["[data-location-clear]"].hidden, true);
  assert.notEqual(elements["[data-location-result]"].dataset.feedbackState, "success");
});

test("resetting the suggestion form empties the hidden input silently", async () => {
  const { document, elements, click } = setup();
  await click("[data-location-request]");
  assert.notEqual(elements["[data-location-value]"].value, "");

  await document.dispatch("reset", { target: { matches: () => false } });
  assert.notEqual(elements["[data-location-value]"].value, "");

  await document.dispatch("reset", { target: { matches: (selector) => selector === "[data-suggestion-form]" } });

  assert.equal(elements["[data-location-value]"].value, "");
  assert.equal(elements["[data-location-clear]"].hidden, true);
  assert.equal(elements["[data-location-result]"].hidden, true);
  assert.equal(elements["[data-location-result]"].textContent, "");
  assert.equal(elements["[data-location-request]"].focusCalls, 0);
});

test("a reset while searching discards the pending answer", async () => {
  const deferred = createDeferred();
  const { document, elements, click } = setup({ respond: () => deferred.promise });

  const clicking = click("[data-location-request]");
  await document.dispatch("reset", { target: { matches: () => true } });
  assert.equal(elements["[data-location-request]"].disabled, false);
  deferred.resolve({ ...ZONE });
  await clicking;

  assert.equal(elements["[data-location-value]"].value, "");
  assert.equal(elements["[data-location-clear]"].hidden, true);
});

test("Quitar ubicación clears the input, says so and returns focus to the button", async () => {
  const { elements, click } = setup();
  await click("[data-location-request]");

  await click("[data-location-clear]");

  assert.equal(elements["[data-location-value]"].value, "");
  assert.equal(elements["[data-location-clear]"].hidden, true);
  assert.equal(elements["[data-location-result]"].dataset.feedbackState, "info");
  assert.equal(elements["[data-location-result]"].textContent, LOCATION_MESSAGES.cleared);
  assert.equal(elements["[data-location-request]"].focusCalls, 1);
});

test("a live permission change updates the line and shows or hides the help", () => {
  const { elements, locationService } = setup();
  assert.equal(locationService.watchers.length, 1);
  const [onChange] = locationService.watchers;

  onChange("denied");
  assert.equal(elements["[data-location-permission]"].dataset.state, "denied");
  assert.equal(elements["[data-location-permission]"].textContent, PERMISSION_TEXT.denied);
  assert.equal(elements["[data-location-help]"].hidden, false);
  assert.equal(elements["[data-location-help]"].open, true);

  onChange("granted");
  assert.equal(elements["[data-location-permission]"].textContent, PERMISSION_TEXT.granted);
  assert.equal(elements["[data-location-help]"].hidden, true);
  assert.equal(elements["[data-location-request]"].disabled, false);
});

test("without a location service nothing is registered", () => {
  const document = createDocument();
  new LocationController({ document }).init();

  assert.deepEqual(document.listeners, {});
});

test("a failed retry drops the zone attached by an earlier reading", async () => {
  const { elements, locationService, click } = setup();
  await click("[data-location-request]");
  assert.equal(elements["[data-location-value]"].value, '{"latitude":37.77,"longitude":-122.42,"radiusKm":1}');
  assert.equal(elements["[data-location-clear]"].hidden, false);

  for (const code of [1, 2, 3]) {
    locationService.respond = async () => { throw new LocationError(code); };
    await click("[data-location-request]");

    assert.equal(elements["[data-location-value]"].value, "", `code ${code} must not keep the old zone`);
    assert.equal(elements["[data-location-clear]"].hidden, true);
    assert.equal(elements["[data-location-result]"].textContent, LOCATION_ERROR_MESSAGES[code]);
    locationService.respond = async () => ({ ...ZONE });
    await click("[data-location-request]");
  }
});

test("focus returns to the button after a reading, except when code 1 moves it to the city field", async () => {
  const { document, elements, locationService, click } = setup();
  const button = elements["[data-location-request]"];
  document.activeElement = button;

  await click("[data-location-request]");
  assert.equal(button.focusCalls, 1);

  document.activeElement = button;
  locationService.respond = async () => { throw new LocationError(1); };
  await click("[data-location-request]");
  assert.equal(button.focusCalls, 1);
  assert.equal(elements["#suggestion-place"].focusCalls, 1);
});

test("the code 1 message is replaced when the permission becomes available again", async () => {
  const { elements, locationService, click } = setup({
    respond: async () => { throw new LocationError(1); },
    permissionAfter: "denied",
  });
  await click("[data-location-request]");
  assert.equal(elements["[data-location-result]"].textContent, LOCATION_ERROR_MESSAGES[1]);

  locationService.watchers.forEach((listener) => listener("granted"));

  assert.equal(elements["[data-location-result]"].textContent, LOCATION_MESSAGES.reenabled);
  assert.equal(elements["[data-location-result]"].dataset.feedbackState, "info");
  assert.equal(elements["[data-location-help]"].hidden, true);
});

test("focus is not taken back from a field the person moved to while searching", async () => {
  const deferred = createDeferred();
  const { document, elements, click } = setup({ respond: () => deferred.promise });
  const button = elements["[data-location-request]"];
  document.activeElement = button;

  const reading = click("[data-location-request]");
  document.activeElement = elements["#suggestion-place"];
  deferred.resolve({ ...ZONE });
  await reading;

  assert.equal(button.focusCalls, 0);
});

test("blocking the permission with a zone attached removes the zone", async () => {
  const { elements, locationService, click } = setup();
  await click("[data-location-request]");
  assert.notEqual(elements["[data-location-value]"].value, "");

  locationService.watchers.forEach((listener) => listener("denied"));

  assert.equal(elements["[data-location-value]"].value, "");
  assert.equal(elements["[data-location-clear]"].hidden, true);
  assert.equal(elements["[data-location-result]"].textContent, LOCATION_MESSAGES.revoked);
  assert.equal(elements["[data-location-help]"].hidden, false);

  locationService.watchers.forEach((listener) => listener("granted"));
  assert.equal(elements["[data-location-result]"].textContent, LOCATION_MESSAGES.reenabled);
});
