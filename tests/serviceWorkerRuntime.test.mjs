import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("sw.js logs its worker context without installing lifecycle or fetch handlers", async () => {
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const logs = [];
  const self = {
    constructor: { name: "ServiceWorkerGlobalScope" },
    registration: { scope: "https://example.com/ejercicios/" },
    addEventListener(type) {
      throw new Error(`sw.js must not register a ${type} handler yet`);
    },
  };

  vm.runInNewContext(source, {
    self,
    console: { info: (...args) => logs.push(args) },
  });

  assert.deepEqual(logs, [
    ["[SW] Ejecutado"],
    ["[SW] Contexto global:", "ServiceWorkerGlobalScope"],
    ["[SW] typeof window:", "undefined"],
    ["[SW] typeof document:", "undefined"],
    ["[SW] typeof localStorage:", "undefined"],
    ["[SW] Scope:", "https://example.com/ejercicios/"],
  ]);
});
