import test from "node:test";
import assert from "node:assert/strict";

import { createPwaConfig } from "../src/pwa/config.js";

test("PWA config derives every URL and scope from the repository base", () => {
  const config = createPwaConfig(
    "https://ernestogufi.github.io/ejercicios/src/pwa/config.js",
  );

  assert.equal(config.baseUrl, "https://ernestogufi.github.io/ejercicios/");
  assert.equal(config.scriptUrl, "https://ernestogufi.github.io/ejercicios/sw.js");
  assert.equal(config.scope, "/ejercicios/");
  assert.equal(config.narrowScope, "/ejercicios/scope-demo/");
  assert.equal(
    config.invalidScriptUrl,
    "https://ernestogufi.github.io/ejercicios/scope-test/sw.js",
  );
  assert.equal(config.invalidScope, "/ejercicios/");
});

test("PWA config keeps a trailing slash when the app runs at the origin root", () => {
  const config = createPwaConfig("http://localhost:8015/src/pwa/config.js");

  assert.equal(config.baseUrl, "http://localhost:8015/");
  assert.equal(config.scope, "/");
  assert.equal(config.narrowPageUrl, "http://localhost:8015/scope-demo/");
});
