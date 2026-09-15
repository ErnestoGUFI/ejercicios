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
  assert.match(html, /href="#\/guardados" data-link>Guardados/);
  assert.match(html, /href="#\/persistencia" data-link>Persistencia/);
  assert.match(html, /href="#\/acerca" data-link>Acerca/);
  assert.match(html, /<label for="theme-select">Tema<\/label>/);
  assert.match(html, /<select id="theme-select"/);
  assert.match(html, /id="persistence-warning"[^>]+aria-live="polite"/);
});

test("the shell reserves an independent row for the persistence warning", async () => {
  const css = await readFile(new URL("../styles/shell.css", import.meta.url), "utf8");

  assert.match(css, /grid-template-rows:\s*auto auto 1fr auto/);
  assert.match(css, /\.site-header\s*{[^}]*grid-row:\s*1/s);
  assert.match(css, /\.persistence-warning\s*{[^}]*grid-row:\s*2/s);
  assert.match(css, /\.app-content\s*{[^}]*grid-row:\s*3/s);
  assert.match(css, /\.site-footer\s*{[^}]*grid-row:\s*4/s);
});
