import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("index keeps the app shell outside the router root", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<button class="skip-link" type="button">Saltar al contenido<\/button>/);
  assert.doesNotMatch(html, /href="#app"/);
  assert.match(html, /<header class="site-header">/);
  assert.match(html, /<main id="app"[^>]+aria-live="polite"[^>]+tabindex="-1"/);
  assert.match(html, /<footer class="site-footer">/);
  assert.doesNotMatch(html, /Unidad 2|Ejercicio 1/);
  assert.equal((html.match(/id="app"/g) ?? []).length, 1);
  assert.match(html, /href="#\/" data-link>Inicio/);
  assert.match(html, /href="#\/noticias" data-link>Noticias/);
  assert.match(html, /href="#\/acerca" data-link>Acerca/);
});
