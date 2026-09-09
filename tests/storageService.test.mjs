import test from "node:test";
import assert from "node:assert/strict";

import StorageService from "../src/services/StorageService.js";

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("StorageService stores and reads a value", () => {
  const storage = createMemoryStorage();
  const service = new StorageService(storage);

  assert.equal(service.set("theme", "dark"), true);
  assert.equal(service.get("theme", "light"), "dark");
});

test("StorageService returns the fallback when reading is unavailable", () => {
  const warnings = [];
  const service = new StorageService(
    {
      getItem() {
        throw new Error("disabled");
      },
    },
    (operation) => warnings.push(operation),
  );

  assert.equal(service.get("theme", "light"), "light");
  assert.deepEqual(warnings, ["leer"]);
});

test("StorageService reports a failed write without breaking the app", () => {
  const warnings = [];
  const service = new StorageService(
    {
      setItem() {
        throw new Error("quota exceeded");
      },
    },
    (operation) => warnings.push(operation),
  );

  assert.equal(service.set("theme", "dark"), false);
  assert.deepEqual(warnings, ["guardar"]);
});

test("StorageService removes one value without clearing the rest", () => {
  const storage = createMemoryStorage();
  const service = new StorageService(storage);
  service.set("theme", "dark");
  service.set("filter", "javascript");

  assert.equal(service.remove("theme"), true);
  assert.equal(service.get("theme", "light"), "light");
  assert.equal(service.get("filter", ""), "javascript");
});

test("StorageService reports when the browser storage object is missing", () => {
  const warnings = [];
  const service = new StorageService(undefined, warnings.push.bind(warnings));

  assert.equal(service.get("theme", "light"), "light");
  assert.deepEqual(warnings, ["leer"]);
});
