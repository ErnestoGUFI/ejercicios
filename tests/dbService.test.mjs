import test from "node:test";
import assert from "node:assert/strict";

import {
  AREA_INDEX,
  RESOURCE_STORE,
  createDatabase,
  createDatabaseLoader,
  createDbService,
} from "../src/services/dbService.js";

test("createDatabase creates the resource store and its area index during upgrade", async () => {
  const created = {};
  const openDb = (name, version, options) => {
    created.name = name;
    created.version = version;
    options.upgrade({
      objectStoreNames: { contains: () => false },
      createObjectStore(storeName, storeOptions) {
        created.storeName = storeName;
        created.storeOptions = storeOptions;
        return {
          createIndex(indexName, fieldName) {
            created.indexName = indexName;
            created.indexField = fieldName;
          },
        };
      },
    });
    return Promise.resolve({});
  };

  await createDatabase(openDb);

  assert.equal(created.name, "tech-catalog-db");
  assert.equal(created.version, 1);
  assert.equal(created.storeName, "saved-resources");
  assert.deepEqual(created.storeOptions, { keyPath: "id" });
  assert.equal(created.indexName, "by-area");
  assert.equal(created.indexField, "area");
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
