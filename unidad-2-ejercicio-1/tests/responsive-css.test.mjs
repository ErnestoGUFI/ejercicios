import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const stylesUrl = new URL("../styles/", import.meta.url);

test("catalog scales from one to two and four columns", async () => {
  const css = await readFile(new URL("components.css", stylesUrl), "utf8");

  assert.match(css, /\.catalog-list\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(css, /@media\s*\(min-width:\s*40rem\)[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(min-width:\s*64rem\)[\s\S]*?repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
});

test("styles scale upward with relative units", async () => {
  const filenames = ["tokens.css", "shell.css", "components.css", "views.css"];
  const css = (await Promise.all(
    filenames.map((filename) => readFile(new URL(filename, stylesUrl), "utf8")),
  )).join("\n");

  assert.doesNotMatch(css, /@media\s*\(max-width:/);
  assert.match(css, /clamp\(/);
  assert.match(css, /\d+(?:\.\d+)?rem/);
  assert.match(css, /\d+(?:\.\d+)?ch/);
});
