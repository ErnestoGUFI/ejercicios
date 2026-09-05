import test from "node:test";
import assert from "node:assert/strict";
import Router, { matchRoute, resolveRoute } from "../src/router/router.js";

function makeApp() {
  return {
    innerHTML: "",
    attributes: {},
    focusCalls: 0,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus() {
      this.focusCalls += 1;
    },
  };
}

test("matchRoute reads the id from a dynamic item route", () => {
  assert.deepEqual(matchRoute("/item/:id", "/item/mysql"), { id: "mysql" });
});

test("resolveRoute returns null when no route matches", () => {
  assert.equal(resolveRoute([{ path: "/" }], "/missing"), null);
});

test("init renders the hash route when hosted below a repository path", async (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const listeners = {};

  globalThis.window = {
    location: {
      hash: "#/noticias",
      pathname: "/ejercicios/",
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
  globalThis.document = {
    addEventListener() {},
  };
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });

  const app = makeApp();
  const router = new Router(
    [{ path: "/noticias", view: async () => "<section>Noticias</section>" }],
    app,
    () => "404",
  );

  router.init();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(typeof listeners.hashchange, "function");
  assert.match(app.innerHTML, /Noticias/);
});

test("clicking the current hash route renders it again", async (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const listeners = {};
  let renders = 0;

  globalThis.window = {
    location: { hash: "#/noticias" },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
  globalThis.document = {
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });

  const router = new Router(
    [
      {
        path: "/noticias",
        view: async () => {
          renders += 1;
          return "<section>Noticias</section>";
        },
      },
    ],
    makeApp(),
    () => "404",
  );

  router.init();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(typeof listeners.click, "function");

  let prevented = false;
  listeners.click({
    target: {
      closest: (selector) =>
        selector === "a[data-link]"
          ? { href: "http://localhost/#/noticias" }
          : null,
    },
    preventDefault() {
      prevented = true;
    },
    metaKey: false,
    ctrlKey: false,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(prevented, true);
  assert.equal(renders, 2);
});

test("the skip link focuses app without replacing the current route", async (t) => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const listeners = {};
  let renders = 0;

  globalThis.window = {
    location: { hash: "#/noticias" },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
  globalThis.document = {
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
  };
  t.after(() => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  });

  const app = makeApp();
  const router = new Router(
    [
      {
        path: "/noticias",
        view: async () => {
          renders += 1;
          return "<section>Noticias</section>";
        },
      },
    ],
    app,
    () => "404",
  );

  router.init();
  await new Promise((resolve) => setImmediate(resolve));

  let prevented = false;
  listeners.click({
    target: {
      closest: (selector) => (selector === ".skip-link" ? {} : null),
    },
    preventDefault() {
      prevented = true;
    },
    metaKey: false,
    ctrlKey: false,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(prevented, true);
  assert.equal(window.location.hash, "#/noticias");
  assert.equal(app.focusCalls, 1);
  assert.equal(renders, 1);
});

test("render exposes a skeleton while the route is pending", async () => {
  const app = makeApp();
  let finish;
  const view = () => new Promise((resolve) => {
    finish = resolve;
  });
  const router = new Router([{ path: "/", view }], app, () => "404");

  const pending = router.render("/");

  assert.equal(app.attributes["aria-busy"], "true");
  assert.match(app.innerHTML, /class="skeleton"/);

  finish("<section>Lista</section>");
  await pending;

  assert.equal(app.attributes["aria-busy"], "false");
  assert.match(app.innerHTML, /Lista/);
});

test("render recovers from a rejected view", async () => {
  const app = makeApp();
  const router = new Router([
    {
      path: "/",
      view: async () => {
        throw new Error("boom");
      },
    },
  ], app, () => "404");

  await router.render("/");

  assert.equal(app.attributes["aria-busy"], "false");
  assert.match(app.innerHTML, /No pudimos cargar/);
});

test("a slow route cannot overwrite a newer route", async () => {
  const app = makeApp();
  let finishSlowView;
  const router = new Router(
    [
      {
        path: "/noticias",
        view: () =>
          new Promise((resolve) => {
            finishSlowView = resolve;
          }),
      },
      {
        path: "/acerca",
        view: async () => "<section>Acerca</section>",
      },
    ],
    app,
    () => "404",
  );

  const slowRender = router.render("/noticias");
  await router.render("/acerca");
  finishSlowView("<section>Noticias antiguas</section>");
  await slowRender;

  assert.match(app.innerHTML, /Acerca/);
  assert.doesNotMatch(app.innerHTML, /Noticias antiguas/);
  assert.equal(app.attributes["aria-busy"], "false");
});
