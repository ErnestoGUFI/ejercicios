import LoadingView from "../views/LoadingView.js";
import RouterErrorView from "../views/RouterErrorView.js";

export function matchRoute(pattern, path) {
  const expected = pattern.split("/").filter(Boolean);
  const received = path.split("/").filter(Boolean);

  if (expected.length !== received.length) return null;

  const params = {};
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index].startsWith(":")) {
      params[expected[index].slice(1)] = decodeURIComponent(received[index]);
    } else if (expected[index] !== received[index]) {
      return null;
    }
  }

  return params;
}

export function resolveRoute(routes, path) {
  for (const route of routes) {
    const params = matchRoute(route.path, path);
    if (params) return { route, params };
  }

  return null;
}

function routeFromHash(hash) {
  return hash.startsWith("#/") ? hash.slice(1) : "/";
}

export default class Router {
  constructor(routes, app, notFound) {
    this.routes = routes;
    this.app = app;
    this.notFound = notFound;
    this.renderId = 0;
  }

  init() {
    window.addEventListener("hashchange", () => {
      if (window.location.hash.startsWith("#/")) this.render();
    });
    document.addEventListener("click", (event) => {
      const skipLink = event.target.closest?.(".skip-link");
      if (skipLink) {
        event.preventDefault();
        this.app.focus();
        return;
      }

      const link = event.target.closest?.("a[data-link]");
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      if (new URL(link.href).hash !== window.location.hash) return;

      event.preventDefault();
      this.render();
    });
    this.render();
  }

  async render(path = routeFromHash(window.location.hash)) {
    const renderId = this.renderId + 1;
    this.renderId = renderId;
    this.app.setAttribute("aria-busy", "true");
    this.app.innerHTML = LoadingView();

    try {
      const match = resolveRoute(this.routes, path);
      const content = match
        ? await match.route.view(match.params)
        : await this.notFound();

      if (renderId === this.renderId) this.app.innerHTML = content;
    } catch {
      if (renderId === this.renderId) this.app.innerHTML = RouterErrorView();
    } finally {
      if (renderId === this.renderId) {
        this.app.setAttribute("aria-busy", "false");
      }
    }
  }
}
