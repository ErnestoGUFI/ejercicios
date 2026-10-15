import test from "node:test";
import assert from "node:assert/strict";

import initInstallControl, { INSTALL_HINT_KEY, INSTALL_MESSAGES } from "../src/components/InstallControl.js";

function createElement() {
  const listeners = {};
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    listeners,
    addEventListener(type, listener) { listeners[type] = listener; },
  };
}

function createHint() {
  const hint = createElement();
  hint.message = createElement();
  hint.dismiss = createElement();
  hint.querySelector = (selector) => ({
    "[data-install-message]": hint.message,
    "[data-install-dismiss]": hint.dismiss,
  })[selector];
  return hint;
}

function createFakePrompt(initial = {}) {
  let state = { canPrompt: false, runningInstalled: false, installedThisSession: false, platform: "other", ...initial };
  const listeners = new Set();
  return {
    choice: "accepted",
    prompts: 0,
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set(changes) {
      state = { ...state, ...changes };
      listeners.forEach((listener) => listener(state));
    },
    async promptInstall() {
      this.prompts += 1;
      this.set({ canPrompt: false });
      return { outcome: this.choice, platform: "web" };
    },
  };
}

function createTimers() {
  const pending = [];
  return {
    setTimeout(callback, ms) { pending.push({ callback, ms }); return pending.length; },
    clearTimeout() {},
    runAll() { pending.splice(0).forEach(({ callback }) => callback()); },
    pending,
  };
}

function createStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("the install button appears only while an install event is saved", () => {
  const button = createElement();
  const hint = createHint();
  const installPrompt = createFakePrompt();
  initInstallControl({ button, hint, installPrompt, timers: createTimers() });

  assert.equal(button.hidden, true);
  assert.equal(hint.hidden, true);
  installPrompt.set({ canPrompt: true });
  assert.equal(button.hidden, false);
  assert.equal(hint.hidden, true);
});

test("nothing is offered while the app already runs installed", () => {
  const button = createElement();
  const hint = createHint();
  const timers = createTimers();
  const installPrompt = createFakePrompt({ canPrompt: true, runningInstalled: true, platform: "ios" });
  initInstallControl({ button, hint, installPrompt, timers });
  timers.runAll();

  assert.equal(button.hidden, true);
  assert.equal(hint.hidden, true);
});

test("iOS and iPadOS get the Share instructions right away", () => {
  const button = createElement();
  const hint = createHint();
  initInstallControl({ button, hint, installPrompt: createFakePrompt({ platform: "ios" }), timers: createTimers() });

  assert.equal(button.hidden, true);
  assert.equal(hint.hidden, false);
  assert.equal(hint.message.textContent, INSTALL_MESSAGES.ios);
  assert.match(hint.message.textContent, /Compartir.*Agregar a pantalla de inicio/);
});

test("other browsers get a clear message only after the grace period, and a late event replaces it", () => {
  const button = createElement();
  const hint = createHint();
  const timers = createTimers();
  const installPrompt = createFakePrompt();
  initInstallControl({ button, hint, installPrompt, timers, graceMs: 4000 });

  assert.equal(hint.hidden, true);
  assert.equal(timers.pending[0].ms, 4000);
  timers.runAll();
  assert.equal(hint.hidden, false);
  assert.equal(hint.message.textContent, INSTALL_MESSAGES.unavailable);

  installPrompt.set({ canPrompt: true });
  assert.equal(hint.hidden, true);
  assert.equal(button.hidden, false);
});

test("the button prompts once and explains a dismissed installation", async () => {
  const button = createElement();
  const hint = createHint();
  const installPrompt = createFakePrompt({ canPrompt: true });
  installPrompt.choice = "dismissed";
  initInstallControl({ button, hint, installPrompt, timers: createTimers() });

  await button.listeners.click();

  assert.equal(installPrompt.prompts, 1);
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, false);
  assert.equal(hint.message.textContent, INSTALL_MESSAGES.dismissed);
});

test("an open install dialog never turns into the no-event message", async () => {
  const button = createElement();
  const hint = createHint();
  const timers = createTimers();
  const installPrompt = createFakePrompt();
  let finishPrompt;
  installPrompt.promptInstall = function promptInstall() {
    this.set({ canPrompt: false });
    return new Promise((resolve) => { finishPrompt = resolve; });
  };
  initInstallControl({ button, hint, installPrompt, timers });
  installPrompt.set({ canPrompt: true });

  const click = button.listeners.click();
  timers.runAll();
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
  assert.equal(hint.hidden, true, "the browser did offer installation");

  finishPrompt({ outcome: "accepted", platform: "web" });
  await click;
  assert.equal(hint.hidden, true);
});

test("a completed installation is announced in the browser tab", async () => {
  const button = createElement();
  const hint = createHint();
  const installPrompt = createFakePrompt({ canPrompt: true });
  initInstallControl({ button, hint, installPrompt, timers: createTimers() });

  await button.listeners.click();
  installPrompt.set({ installedThisSession: true });

  assert.equal(button.hidden, true);
  assert.equal(hint.hidden, false);
  assert.equal(hint.message.textContent, INSTALL_MESSAGES.installed);
});

test("Entendido hides the hint for the rest of the session", () => {
  const storage = createStorage();
  const hint = createHint();
  initInstallControl({ button: createElement(), hint, installPrompt: createFakePrompt({ platform: "ios" }), storage, timers: createTimers() });

  hint.dismiss.listeners.click();
  assert.equal(hint.hidden, true);
  assert.equal(storage.values.get(INSTALL_HINT_KEY), "1");

  const nextHint = createHint();
  initInstallControl({ button: createElement(), hint: nextHint, installPrompt: createFakePrompt({ platform: "ios" }), storage, timers: createTimers() });
  assert.equal(nextHint.hidden, true);
});

test("a blocked session storage never stops the install control", () => {
  const storage = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("SecurityError"); },
  };
  const hint = createHint();
  initInstallControl({ button: createElement(), hint, installPrompt: createFakePrompt({ platform: "ios" }), storage, timers: createTimers() });

  assert.equal(hint.hidden, false);
  hint.dismiss.listeners.click();
  assert.equal(hint.hidden, true);
});
