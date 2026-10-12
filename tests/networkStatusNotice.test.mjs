import test from "node:test";
import assert from "node:assert/strict";

import initNetworkStatusNotice from "../src/components/NetworkStatusNotice.js";

function makeEventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type) { listeners.get(type)?.(); },
  };
}

function makeNotice() {
  return { hidden: false, textContent: "" };
}

test("NetworkStatusNotice initializes hidden while the browser is online", () => {
  const notice = makeNotice();
  const eventTarget = makeEventTarget();

  const cleanup = initNetworkStatusNotice({
    notice,
    eventTarget,
    navigatorObject: { onLine: true },
  });

  assert.equal(notice.hidden, true);
  assert.equal(notice.textContent, "");
  cleanup();
});

test("NetworkStatusNotice displays and clears its message as connectivity changes", () => {
  const notice = makeNotice();
  const eventTarget = makeEventTarget();
  const cleanup = initNetworkStatusNotice({
    notice,
    eventTarget,
    navigatorObject: { onLine: true },
  });

  eventTarget.dispatch("offline");
  assert.equal(notice.hidden, false);
  assert.equal(
    notice.textContent,
    "Sin conexión. Se mostrará el contenido que ya está guardado en este dispositivo.",
  );

  eventTarget.dispatch("online");
  assert.equal(notice.hidden, true);
  assert.equal(notice.textContent, "");
  cleanup();
});

test("NetworkStatusNotice starts visible when the browser is already offline", () => {
  const notice = makeNotice();
  const cleanup = initNetworkStatusNotice({
    notice,
    eventTarget: makeEventTarget(),
    navigatorObject: { onLine: false },
  });

  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /Sin conexión/);
  cleanup();
});

test("NetworkStatusNotice removes its connectivity listeners during cleanup", () => {
  const eventTarget = makeEventTarget();
  const cleanup = initNetworkStatusNotice({
    notice: makeNotice(),
    eventTarget,
    navigatorObject: { onLine: true },
  });

  cleanup();

  assert.equal(eventTarget.listeners.size, 0);
});
