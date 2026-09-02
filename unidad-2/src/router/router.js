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

export default class Router {
  constructor(routes, app, notFound) {
    this.routes = routes;
    this.app = app;
    this.notFound = notFound;
  }

  init() {
    window.addEventListener("popstate", () => this.render());
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[data-link]");
      if (!link || event.metaKey || event.ctrlKey) return;

      event.preventDefault();
      history.pushState({}, "", link.href);
      this.render();
    });
    this.render();
  }

  async render(path = window.location.pathname) {
    this.app.setAttribute("aria-busy", "true");
    this.app.innerHTML = LoadingView();

    try {
      const match = resolveRoute(this.routes, path);
      this.app.innerHTML = match
        ? await match.route.view(match.params)
        : await this.notFound();
    } catch {
      this.app.innerHTML = RouterErrorView();
    } finally {
      this.app.setAttribute("aria-busy", "false");
    }
  }
}
