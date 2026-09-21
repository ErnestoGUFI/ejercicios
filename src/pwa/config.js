export function createPwaConfig(moduleUrl = import.meta.url) {
  const appBaseUrl = new URL("../../", moduleUrl);

  return Object.freeze({
    baseUrl: appBaseUrl.href,
    scriptUrl: new URL("sw.js", appBaseUrl).href,
    scope: appBaseUrl.pathname,
    narrowScope: new URL("scope-demo/", appBaseUrl).pathname,
    narrowPageUrl: new URL("scope-demo/", appBaseUrl).href,
    invalidScriptUrl: new URL("scope-test/sw.js", appBaseUrl).href,
    invalidScope: appBaseUrl.pathname,
  });
}

export const PWA_CONFIG = createPwaConfig();
