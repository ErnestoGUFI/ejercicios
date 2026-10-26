import test from "node:test";
import assert from "node:assert/strict";
import HomeView from "../src/views/HomeView.js";
import ItemDetailView from "../src/views/ItemDetailView.js";
import { PWA_CONFIG } from "../src/pwa/config.js";

test("home renders four topics in a labeled catalog list", () => {
  const html = HomeView();

  assert.match(html, /class="home-view"/);
  assert.match(html, /class="catalog-list"/);
  assert.equal((html.match(/class="catalog-item"/g) ?? []).length, 4);
});

test("detail renders the topic selected by its route id", async () => {
  const html = await ItemDetailView({ id: "mysql" });

  assert.match(html, /class="detail-view"/);
  assert.match(html, /MySQL/);
  assert.match(html, /SELECT \* FROM usuarios;/);
});

test("detail offers Compartir tema below the description with the canonical topic link", async () => {
  const html = await ItemDetailView({ id: "javascript" });
  const canonicalUrl = new URL("#/item/javascript", PWA_CONFIG.baseUrl).href;

  const copy = html.slice(html.indexOf('class="detail-copy"'), html.indexOf("</header>"));
  assert.ok(copy.indexOf("detail-description") < copy.indexOf('class="share-control"'));
  assert.match(copy, /<button class="sw-button sw-button-secondary" type="button" data-share-topic="javascript">Compartir tema<\/button>/);
  assert.match(copy, /data-share-fallback hidden/);
  assert.ok(copy.includes(`value="${canonicalUrl}" data-share-link`));
});

test("detail labels the button Copiar enlace del tema when there is no native share menu", async () => {
  const html = await ItemDetailView({ id: "mysql" }, { shareMode: "copy" });

  assert.match(html, /data-share-topic="mysql">Copiar enlace del tema<\/button>/);
});
