import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const publishedRoot = "https://ernestogufi.github.io/ejercicios/";

function pngSize(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}

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

test("the web app manifest matches the published route and the CSS colors", async () => {
  const manifestUrl = new URL("manifest.json", projectRoot);
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const tokens = await readFile(new URL("styles/tokens.css", projectRoot), "utf8");
  const lightTokens = tokens.slice(0, tokens.indexOf(':root[data-theme="dark"]'));
  const shell = await readFile(new URL("styles/shell.css", projectRoot), "utf8");

  for (const member of [
    "id", "name", "short_name", "description", "lang",
    "start_url", "scope", "display", "theme_color", "background_color",
  ]) {
    assert.ok(manifest[member], `manifest.${member} is required`);
  }
  assert.ok([...manifest.short_name].length <= 12);

  const publishedManifest = new URL("manifest.json", publishedRoot);
  const startUrl = new URL(manifest.start_url, publishedManifest);
  assert.equal(startUrl.href, publishedRoot);
  assert.equal(new URL(manifest.scope, publishedManifest).href, publishedRoot);
  assert.equal(new URL(manifest.id, startUrl.origin).href, publishedRoot);

  assert.match(shell, /\.site-header\s*{[^}]*background:\s*var\(--color-brand\)/s);
  assert.match(tokens, /body\s*{[^}]*background:\s*var\(--color-canvas\)/s);
  assert.match(lightTokens, new RegExp(`--color-brand:\\s*${manifest.theme_color};`));
  assert.match(lightTokens, new RegExp(`--color-canvas:\\s*${manifest.background_color};`));
});

test("the manifest icons derive from a 1024 px master and match their declared sizes", async () => {
  const manifestUrl = new URL("manifest.json", projectRoot);
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(pngSize(await readFile(new URL("icons/logo-maestro-1024.png", projectRoot))), "1024x1024");
  assert.deepEqual(
    manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`),
    ["192x192 any", "512x512 any", "512x512 maskable"],
  );
  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png");
    assert.equal(pngSize(await readFile(new URL(icon.src, manifestUrl))), icon.sizes);
  }
  assert.deepEqual(manifest.screenshots.map(({ form_factor }) => form_factor), ["wide", "narrow"]);
  for (const screenshot of manifest.screenshots) {
    await access(new URL(screenshot.src, manifestUrl));
  }
});

test("every HTML entry point links the manifest and the iOS resources", async () => {
  for (const htmlPath of ["index.html", "scope-demo/index.html"]) {
    const htmlUrl = new URL(htmlPath, projectRoot);
    const html = await readFile(htmlUrl, "utf8");

    for (const [rel, size] of [
      ["manifest"],
      ["icon", "32x32"],
      ["apple-touch-icon", "180x180"],
      ["apple-touch-startup-image", "1170x2532"],
    ]) {
      const href = html.match(new RegExp(`<link\\s+rel="${rel}"\\s+href="([^"]+)"`, "i"))?.[1];
      assert.ok(href, `${htmlPath} must link ${rel}`);
      const file = await readFile(new URL(href, htmlUrl));
      if (size) assert.equal(pngSize(file), size);
    }

    assert.match(html, /<meta name="theme-color" content="#1e3a5f">/);
    assert.match(html, /<meta name="apple-mobile-web-app-title" content="TechCatálogo">/);
    assert.match(html, /rel="apple-touch-startup-image"[^>]+media="\([^"]+\)"/);
  }
});

test("the SWR demonstration contains the second published JSON value", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../cache-swr-demo.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(fixture, {
    revision: "swr-v2",
    mensaje: "Dato actualizado en segundo despliegue para validar Stale-While-Revalidate.",
  });
});

test("the Network First demonstration contains the second published JSON value", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../cache-demo.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(fixture, {
    revision: "network-v2",
    mensaje: "Dato actualizado en segundo despliegue para validar Network First.",
  });
});
