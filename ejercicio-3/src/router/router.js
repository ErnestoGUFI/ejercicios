export function matchRoute(pattern, path) {
  const expected = pattern.split("/").filter(Boolean);
  const received = path.split("/").filter(Boolean);
  if (expected.length !== received.length) return null;
  const params = {};
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index].startsWith(":")) params[expected[index].slice(1)] = decodeURIComponent(received[index]);
    else if (expected[index] !== received[index]) return null;
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

  async render() {
    const path = window.location.pathname;
    const match = resolveRoute(this.routes, path);
    if (match) {
      this.app.innerHTML = await match.route.view(match.params);
      return;
    }
    this.app.innerHTML = await this.notFound();
  }
}
