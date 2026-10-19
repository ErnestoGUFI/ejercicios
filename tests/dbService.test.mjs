import test from "node:test";
import assert from "node:assert/strict";

import {
  AREA_INDEX,
  OUTBOX_STORE,
  RESOURCE_STORE,
  createDatabase,
  createDatabaseLoader,
  createDbService,
  upgradeDatabase,
} from "../src/services/dbService.js";

function createUpgradeTarget(existingStores = []) {
  const stores = new Map(existingStores.map((name) => [name, { options: "existing", indexes: [] }]));
  return {
    stores,
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(storeName, storeOptions) {
      const store = { options: storeOptions, indexes: [] };
      stores.set(storeName, store);
      return {
        createIndex(indexName, fieldName) {
          store.indexes.push([indexName, fieldName]);
        },
      };
    },
  };
}

test("createDatabase opens version 2 with the resource store, its area index and the outbox", async () => {
  const created = {};
  const target = createUpgradeTarget();
  const openDb = (name, version, options) => {
    created.name = name;
    created.version = version;
    options.upgrade(target);
    return Promise.resolve({});
  };

  await createDatabase(openDb);

  assert.equal(created.name, "tech-catalog-db");
  assert.equal(created.version, 2);
  assert.deepEqual(target.stores.get(RESOURCE_STORE), { options: { keyPath: "id" }, indexes: [["by-area", "area"]] });
  assert.deepEqual(target.stores.get(OUTBOX_STORE), { options: { keyPath: "id" }, indexes: [] });
});

test("upgrading from version 1 only adds the outbox and keeps the saved resources store", () => {
  const target = createUpgradeTarget([RESOURCE_STORE]);

  upgradeDatabase(target);

  assert.equal(target.stores.get(RESOURCE_STORE).options, "existing");
  assert.deepEqual(target.stores.get(OUTBOX_STORE), { options: { keyPath: "id" }, indexes: [] });
});

test("db service stores outbox items and returns them oldest first", async () => {
  const records = new Map();
  const database = {
    async put(storeName, item) {
      assert.equal(storeName, OUTBOX_STORE);
      records.set(item.id, structuredClone(item));
      return item.id;
    },
    async getAll(storeName) {
      assert.equal(storeName, OUTBOX_STORE);
      return [...records.values()];
    },
  };
  const service = createDbService(() => Promise.resolve(database));

  await service.addToOutbox({ id: "b", topic: "Docker", createdAt: "2026-10-19T10:05:00.000Z" });
  await service.addToOutbox({ id: "a", topic: "Rust", createdAt: "2026-10-19T10:00:00.000Z" });

  assert.deepEqual((await service.getOutbox()).map((item) => item.id), ["a", "b"]);
});

test("db service creates, reads, filters and deletes saved resources", async () => {
  const records = new Map();
  const database = {
    async put(storeName, resource) {
      assert.equal(storeName, RESOURCE_STORE);
      records.set(resource.id, structuredClone(resource));
      return resource.id;
    },
    async getAll(storeName) {
      assert.equal(storeName, RESOURCE_STORE);
      return [...records.values()];
    },
    async getAllFromIndex(storeName, indexName, area) {
      assert.equal(storeName, RESOURCE_STORE);
      assert.equal(indexName, AREA_INDEX);
      return [...records.values()].filter((resource) => resource.area === area);
    },
    async delete(storeName, id) {
      assert.equal(storeName, RESOURCE_STORE);
      records.delete(id);
    },
  };
  const service = createDbService(() => Promise.resolve(database));
  const frontend = {
    id: "resource-1",
    title: "Guía de módulos ES",
    url: "https://example.com/modules",
    area: "frontend",
  };
  const backend = {
    id: "resource-2",
    title: "Diseño de APIs",
    url: "https://example.com/apis",
    area: "backend",
  };

  await service.createResource(frontend);
  await service.createResource(backend);

  assert.deepEqual(await service.getAllResources(), [frontend, backend]);
  assert.deepEqual(await service.getResourcesByArea("frontend"), [frontend]);

  await service.deleteResource("resource-1");
  assert.deepEqual(await service.getAllResources(), [backend]);
});

test("database loader retries after a transient open failure", async () => {
  const database = { name: "open" };
  let attempts = 0;
  const loadDatabase = createDatabaseLoader(() => {
    attempts += 1;
    return attempts === 1
      ? Promise.reject(new Error("Temporary failure"))
      : Promise.resolve(database);
  });

  await assert.rejects(loadDatabase(), /Temporary failure/);
  assert.equal(await loadDatabase(), database);
  assert.equal(attempts, 2);
});
