import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/utils/slugify.js";

test("slugify is a named export that creates ids", () => {
  assert.equal(slugify("Base de Datos"), "base-de-datos");
});
