import test from "node:test";
import assert from "node:assert/strict";

import initNotificationControl, { NOTIFICATION_LABELS, NOTIFICATION_MESSAGES } from "../src/components/NotificationControl.js";
import { createNotificationPermission, readNotificationPermission } from "../src/pwa/notifications.js";

function createWindow({ permission = "default", decide = "granted", permissions } = {}) {
  const listeners = {};
  const swListeners = {};
  const Notification = {
    permission,
    requests: 0,
    async requestPermission() {
      this.requests += 1;
      this.permission = decide;
      return decide;
    },
  };
  return {
    Notification,
    listeners,
    swListeners,
    location: { href: "https://example.com/ejercicios/#/", origin: "https://example.com", hash: "#/" },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    navigator: {
      permissions,
      serviceWorker: {
        addEventListener(type, listener) {
          swListeners[type] = listener;
        },
      },
    },
  };
}

function createElement() {
  const listeners = {};
  return {
    hidden: true,
    disabled: false,
    textContent: "",
    dataset: {},
    attributes: {},
    focusCalls: 0,
    listeners,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus() {
      this.focusCalls += 1;
    },
  };
}

function createHint() {
  const hint = createElement();
  hint.message = createElement();
  hint.dismiss = createElement();
  hint.querySelector = (selector) => ({
    "[data-notification-message]": hint.message,
    "[data-notification-dismiss]": hint.dismiss,
  })[selector];
  return hint;
}

function setup(windowOptions) {
  const browserWindow = createWindow(windowOptions);
  const notificationPermission = createNotificationPermission({ browserWindow }).init();
  const button = createElement();
  const hint = createHint();
  initNotificationControl({ button, hint, notificationPermission });
  return { browserWindow, notificationPermission, button, hint };
}

test("the permission reads default, granted, denied or unsupported", () => {
  assert.equal(readNotificationPermission(createWindow({ permission: "default" })), "default");
  assert.equal(readNotificationPermission(createWindow({ permission: "granted" })), "granted");
  assert.equal(readNotificationPermission(createWindow({ permission: "denied" })), "denied");
  assert.equal(readNotificationPermission({ navigator: {} }), "unsupported");
  assert.equal(readNotificationPermission(undefined), "unsupported");
});

test("default: one click asks for the permission and the button turns into Avisos activados", async () => {
  const { browserWindow, button, hint } = setup({ permission: "default", decide: "granted" });

  assert.equal(button.hidden, false);
  assert.equal(button.textContent, NOTIFICATION_LABELS.default);
  assert.equal(button.dataset.state, "default");
  assert.equal(browserWindow.Notification.requests, 0, "nothing is asked before the click");

  await button.listeners.click();

  assert.equal(browserWindow.Notification.requests, 1);
  assert.equal(button.textContent, NOTIFICATION_LABELS.granted);
  assert.equal(button.dataset.state, "granted");
  assert.equal(button.attributes["aria-pressed"], "true");
  assert.equal(button.disabled, true);
  assert.equal(hint.hidden, false);
  assert.equal(hint.message.textContent, NOTIFICATION_MESSAGES.granted);
});

test("denied shows how to unblock it and a click never asks again", async () => {
  const { browserWindow, button, hint } = setup({ permission: "denied" });

  assert.equal(button.textContent, NOTIFICATION_LABELS.denied);
  assert.equal(button.disabled, false);
  assert.equal(hint.hidden, false, "the help is visible from the start");
  assert.match(hint.message.textContent, /Notificaciones › Permitir/);

  hint.dismiss.listeners.click();
  assert.equal(hint.hidden, true);
  assert.equal(button.focusCalls, 1);

  await button.listeners.click();
  assert.equal(browserWindow.Notification.requests, 0);
  assert.equal(hint.hidden, false);
  assert.equal(hint.message.textContent, NOTIFICATION_MESSAGES.denied);
});

test("rejecting the prompt moves the control to denied with the unblock help", async () => {
  const { button, hint } = setup({ permission: "default", decide: "denied" });

  await button.listeners.click();

  assert.equal(button.textContent, NOTIFICATION_LABELS.denied);
  assert.equal(hint.message.textContent, NOTIFICATION_MESSAGES.denied);
});

test("closing the prompt without deciding keeps default and shows no message", async () => {
  const { button, hint } = setup({ permission: "default", decide: "default" });

  await button.listeners.click();

  assert.equal(button.textContent, NOTIFICATION_LABELS.default);
  assert.equal(button.disabled, false);
  assert.equal(hint.hidden, true);
});

test("without the Notification API the control is hidden", () => {
  const button = createElement();
  const notificationPermission = createNotificationPermission({ browserWindow: { navigator: {} } }).init();
  initNotificationControl({ button, hint: createHint(), notificationPermission });

  assert.equal(button.hidden, true);
  assert.equal(notificationPermission.getState(), "unsupported");
});

test("a permission changed in the browser settings updates the control", async () => {
  let status;
  const permissions = {
    async query({ name }) {
      assert.equal(name, "notifications");
      status = { onchange: null };
      return status;
    },
  };
  const { browserWindow, button, hint } = setup({ permission: "granted", permissions });
  await new Promise((resolve) => setImmediate(resolve));

  browserWindow.Notification.permission = "denied";
  status.onchange();

  assert.equal(button.textContent, NOTIFICATION_LABELS.denied);
  assert.equal(hint.message.textContent, NOTIFICATION_MESSAGES.denied);

  browserWindow.Notification.permission = "granted";
  browserWindow.listeners.focus();
  assert.equal(button.textContent, NOTIFICATION_LABELS.granted);
});

test("a notification click message opens the route in the SPA, only for the same origin", () => {
  const { browserWindow } = setup({ permission: "granted" });

  browserWindow.swListeners.message({ data: { type: "notification-open", url: "https://example.com/ejercicios/#/sugerencias" } });
  assert.equal(browserWindow.location.hash, "#/sugerencias");

  browserWindow.swListeners.message({ data: { type: "notification-open", url: "https://otro.example/#/x" } });
  browserWindow.swListeners.message({ data: { type: "outbox-sent" } });
  assert.equal(browserWindow.location.hash, "#/sugerencias");
});
