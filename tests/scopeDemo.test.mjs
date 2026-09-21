import test from "node:test";
import assert from "node:assert/strict";

import { renderScopeDemo } from "../src/pwa/scopeDemo.js";

function createDocument() {
  const outputs = {
    "[data-scope-demo-controller]": { textContent: "Consultando…" },
    "[data-scope-demo-scope]": { textContent: "Consultando…" },
    "[data-scope-demo-feedback]": { textContent: "", dataset: {} },
  };

  return {
    outputs,
    querySelector(selector) {
      return outputs[selector] ?? null;
    },
  };
}

test("renderScopeDemo shows a recoverable error when registration lookup fails", async () => {
  const document = createDocument();
  const navigator = {
    serviceWorker: {
      controller: null,
      getRegistration: async () => {
        throw new Error("Consulta bloqueada");
      },
    },
  };

  await renderScopeDemo({ document, navigator });

  assert.equal(document.outputs["[data-scope-demo-controller]"].textContent, "Sin controller.");
  assert.equal(document.outputs["[data-scope-demo-scope]"].textContent, "No disponible");
  assert.equal(document.outputs["[data-scope-demo-feedback]"].dataset.state, "error");
  assert.match(document.outputs["[data-scope-demo-feedback]"].textContent, /Consulta bloqueada/);
});
