import test from "node:test";
import assert from "node:assert/strict";

import { createInstallPrompt, isAppleMobile, isRunningInstalled } from "../src/pwa/installPrompt.js";

function createWindow({ displayModes = [], standalone, userAgent = "Mozilla/5.0 (X11; Linux x86_64) Chrome/155", maxTouchPoints = 0 } = {}) {
  const listeners = {};
  const mediaListeners = [];
  return {
    listeners,
    mediaListeners,
    navigator: { userAgent, maxTouchPoints, ...(standalone === undefined ? {} : { standalone }) },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    matchMedia(query) {
      const mode = query.match(/display-mode: ([\w-]+)/)?.[1];
      return {
        matches: displayModes.includes(mode),
        addEventListener: (type, listener) => mediaListeners.push(listener),
      };
    },
  };
}

function createInstallEvent(outcome) {
  const calls = { preventDefault: 0, prompt: 0 };
  return {
    calls,
    preventDefault() { calls.preventDefault += 1; },
    async prompt() { calls.prompt += 1; },
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  };
}

test("isRunningInstalled detects display-mode and the iOS standalone flag", () => {
  assert.equal(isRunningInstalled(createWindow()), false);
  assert.equal(isRunningInstalled(createWindow({ displayModes: ["standalone"] })), true);
  assert.equal(isRunningInstalled(createWindow({ displayModes: ["minimal-ui"] })), true);
  assert.equal(isRunningInstalled(createWindow({ standalone: true })), true);
  assert.equal(isRunningInstalled(createWindow({ standalone: false })), false);
  assert.equal(isRunningInstalled(undefined), false);
});

test("isAppleMobile recognizes iPhone and iPadOS but not desktop Macs or Android", () => {
  assert.equal(isAppleMobile({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobile({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", maxTouchPoints: 5 }), true);
  assert.equal(isAppleMobile({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605", maxTouchPoints: 0 }), false);
  assert.equal(isAppleMobile({ userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/155 Mobile", maxTouchPoints: 5 }), false);
});

test("the install module cancels the mini-infobar and keeps the event for later", () => {
  const browserWindow = createWindow();
  const installPrompt = createInstallPrompt({ browserWindow }).init();
  const states = [];
  installPrompt.subscribe((state) => states.push(state));
  const event = createInstallEvent("accepted");

  assert.equal(installPrompt.getState().canPrompt, false);
  browserWindow.listeners.beforeinstallprompt(event);

  assert.equal(event.calls.preventDefault, 1);
  assert.equal(event.calls.prompt, 0);
  assert.deepEqual(states.at(-1), {
    canPrompt: true,
    runningInstalled: false,
    installedThisSession: false,
    platform: "other",
  });
});

test("promptInstall calls prompt() once and returns the user's choice", async () => {
  const browserWindow = createWindow();
  const installPrompt = createInstallPrompt({ browserWindow }).init();
  const event = createInstallEvent("dismissed");
  browserWindow.listeners.beforeinstallprompt(event);

  assert.deepEqual(await installPrompt.promptInstall(), { outcome: "dismissed", platform: "web" });
  assert.equal(event.calls.prompt, 1);
  assert.equal(installPrompt.getState().canPrompt, false);
  assert.deepEqual(await installPrompt.promptInstall(), { outcome: "unavailable", platform: "" });
  assert.equal(event.calls.prompt, 1);
});

test("appinstalled discards the saved event and records the installation", () => {
  const browserWindow = createWindow();
  const installPrompt = createInstallPrompt({ browserWindow }).init();
  browserWindow.listeners.beforeinstallprompt(createInstallEvent("accepted"));
  browserWindow.listeners.appinstalled();

  assert.equal(installPrompt.getState().canPrompt, false);
  assert.equal(installPrompt.getState().installedThisSession, true);
});

test("the module reports iOS devices and follows display-mode changes", () => {
  const browserWindow = createWindow({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    maxTouchPoints: 5,
  });
  const installPrompt = createInstallPrompt({ browserWindow }).init();
  let notifications = 0;
  installPrompt.subscribe(() => { notifications += 1; });

  assert.equal(installPrompt.getState().platform, "ios");
  assert.ok(browserWindow.mediaListeners.length >= 1);
  browserWindow.mediaListeners[0]();
  assert.equal(notifications, 1);
});
