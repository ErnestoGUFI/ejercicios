import test from "node:test";
import assert from "node:assert/strict";
import Router, { matchRoute, resolveRoute } from "../src/router/router.js";

function makeApp() {
  return {
    innerHTML: "",
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
}

test("matchRoute reads the id from a dynamic item route", () => {
  assert.deepEqual(matchRoute("/item/:id", "/item/mysql"), { id: "mysql" });
});

test("resolveRoute returns null when no route matches", () => {
  assert.equal(resolveRoute([{ path: "/" }], "/missing"), null);
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
