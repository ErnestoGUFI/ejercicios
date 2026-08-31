import test from "node:test";
import assert from "node:assert/strict";
import ItemsService from "../src/services/itemsService.js";

test("default ItemsService finds a topic by id", async () => {
  const item = await new ItemsService().getById("mysql");

  assert.equal(item.name, "MySQL");
});

test("default ItemsService exposes the four catalog items", async () => {
  const items = await new ItemsService().getAll();

  assert.equal(items.length, 4);
});
