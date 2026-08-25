import test from "node:test";
import assert from "node:assert/strict";
import ItemsService from "../src/services/itemsService.js";

test("default ItemsService finds a topic by id", async () => {
  const service = new ItemsService();
  assert.equal((await service.getById("mysql")).name, "MySQL");
});

test("default ItemsService exposes the four catalog items", async () => {
  const service = new ItemsService();
  assert.equal((await service.getAll()).length, 4);
});
