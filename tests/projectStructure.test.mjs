import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

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

test("every HTML entry point declares a favicon that exists", async () => {
  for (const htmlPath of ["index.html", "scope-demo/index.html"]) {
    const htmlUrl = new URL(htmlPath, projectRoot);
    const html = await readFile(htmlUrl, "utf8");
    const faviconHref = html.match(/<link\s+rel="icon"\s+href="([^"]+)"/i)?.[1];

    assert.ok(faviconHref, `${htmlPath} must declare a favicon`);
    await access(new URL(faviconHref, htmlUrl));
  }
});

test("the SWR demonstration starts with the first published JSON value", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../cache-swr-demo.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(fixture, {
    revision: "swr-v1",
    mensaje: "Dato inicial para observar la actualización en segundo plano.",
  });
});

test("the Network First demonstration starts with its first published JSON value", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../cache-demo.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(fixture, {
    revision: "network-v1",
    mensaje: "Dato inicial para comprobar la estrategia Network First.",
  });
});
