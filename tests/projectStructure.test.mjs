import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);

test("the repository root contains one cumulative application", async () => {
  const entries = await readdir(projectRoot);

  for (const requiredEntry of [
    "index.html",
    "package.json",
    "src",
    "styles",
    "tests",
  ]) {
    assert.ok(entries.includes(requiredEntry), `${requiredEntry} must be at the root`);
  }

  for (const obsoleteEntry of ["ejercicio-3", "ejercicio-4", "unidad-2"]) {
    assert.ok(!entries.includes(obsoleteEntry), `${obsoleteEntry} must not remain`);
  }
});
