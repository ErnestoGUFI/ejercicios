import test from "node:test";
import assert from "node:assert/strict";
import { matchRoute, resolveRoute } from "../src/router/router.js";

test("matchRoute reads the id from a dynamic item route", () => {
  assert.deepEqual(matchRoute("/item/:id", "/item/javascript"), { id: "javascript" });
});

test("resolveRoute returns null when no route matches", () => {
  assert.equal(resolveRoute([{ path: "/", view: () => "" }], "/no-existe"), null);
});
