import test from "node:test";
import assert from "node:assert/strict";

import ThemeController from "../src/controllers/ThemeController.js";

function createSelect() {
  const listeners = {};
  return {
    value: "",
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    dispatch(type) {
      listeners[type]({ target: this });
    },
  };
}

test("ThemeController applies and updates the persisted theme", () => {
  const select = createSelect();
  const root = { dataset: {} };
  const saved = [];
  const persistence = {
    getTheme: () => "dark",
    setTheme: (theme) => saved.push(theme),
  };
  const eventTarget = { addEventListener() {} };
  const changes = [];
  const controller = new ThemeController({
    select,
    root,
    persistence,
    eventTarget,
    onChange: (theme) => changes.push(theme),
  });

  controller.init();
  assert.equal(root.dataset.theme, "dark");
  assert.equal(select.value, "dark");

  select.value = "light";
  select.dispatch("change");
  assert.equal(root.dataset.theme, "light");
  assert.deepEqual(saved, ["light"]);
  assert.deepEqual(changes, ["light"]);
});

test("ThemeController applies a theme changed in another tab", () => {
  const listeners = {};
  const changes = [];
  const select = createSelect();
  const root = { dataset: {} };
  const controller = new ThemeController({
    select,
    root,
    persistence: { getTheme: () => "light", setTheme() {} },
    eventTarget: {
      addEventListener(type, listener) {
        listeners[type] = listener;
      },
    },
    onChange: (theme) => changes.push(theme),
  });

  controller.init();
  listeners.storage({ key: "tech-catalog-theme", newValue: "dark" });

  assert.equal(root.dataset.theme, "dark");
  assert.equal(select.value, "dark");
  assert.deepEqual(changes, ["dark"]);
});
