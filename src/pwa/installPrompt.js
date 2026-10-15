const INSTALLED_DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];

export function isRunningInstalled(browserWindow = globalThis.window) {
  if (browserWindow?.navigator?.standalone === true) return true;
  return INSTALLED_DISPLAY_MODES.some(
    (mode) => browserWindow?.matchMedia?.(`(display-mode: ${mode})`).matches === true,
  );
}

// iPadOS se identifica como Mac de escritorio; la pantalla táctil lo distingue.
export function isAppleMobile(navigatorObject = globalThis.navigator) {
  const userAgent = navigatorObject?.userAgent ?? "";
  return /iPhone|iPad|iPod/.test(userAgent)
    || (/Macintosh/.test(userAgent) && navigatorObject.maxTouchPoints > 1);
}

export function createInstallPrompt({ browserWindow = globalThis.window } = {}) {
  let deferredPrompt = null;
  let installedThisSession = false;
  const listeners = new Set();

  function getState() {
    return {
      canPrompt: deferredPrompt !== null,
      runningInstalled: isRunningInstalled(browserWindow),
      installedThisSession,
      platform: isAppleMobile(browserWindow?.navigator) ? "ios" : "other",
    };
  }

  function notify() {
    const state = getState();
    listeners.forEach((listener) => listener(state));
  }

  function init() {
    if (!browserWindow) return api;

    browserWindow.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      notify();
    });
    browserWindow.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      installedThisSession = true;
      notify();
    });
    for (const mode of INSTALLED_DISPLAY_MODES) {
      browserWindow.matchMedia?.(`(display-mode: ${mode})`).addEventListener?.("change", notify);
    }
    return api;
  }

  async function promptInstall() {
    if (!deferredPrompt) return { outcome: "unavailable", platform: "" };

    // Un evento guardado solo admite una llamada a prompt().
    const event = deferredPrompt;
    deferredPrompt = null;
    notify();
    await event.prompt();
    const choice = await event.userChoice;
    return { outcome: choice.outcome, platform: choice.platform ?? "" };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const api = { init, getState, promptInstall, subscribe };
  return api;
}
