import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/utils/slugify.js";

test("slugify creates stable route ids", () => {
  assert.equal(slugify("Base de Datos"), "base-de-datos");
  assert.equal(slugify("Programación Útil"), "programacion-util");
});
