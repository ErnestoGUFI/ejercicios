import test from "node:test";
import assert from "node:assert/strict";
import HomeView from "../src/views/HomeView.js";
import ItemDetailView from "../src/views/ItemDetailView.js";

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
