import { openDB } from "../vendor/idb.js";

export const DATABASE_NAME = "tech-catalog-db";
export const DATABASE_VERSION = 1;
export const RESOURCE_STORE = "saved-resources";
export const AREA_INDEX = "by-area";

export function createDatabase(openDatabase = openDB) {
  return openDatabase(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (database.objectStoreNames.contains(RESOURCE_STORE)) return;

      const store = database.createObjectStore(RESOURCE_STORE, { keyPath: "id" });
      store.createIndex(AREA_INDEX, "area");
    },
  });
}

export function createDatabaseLoader(openDatabase = openDB) {
  let databasePromise;

  return function loadDatabase() {
    databasePromise ??= createDatabase(openDatabase).catch((error) => {
      databasePromise = undefined;
      throw error;
    });
    return databasePromise;
  };
}

const getDatabase = createDatabaseLoader();

export function createDbService(loadDatabase = getDatabase) {
  return {
    async createResource(resource) {
      const database = await loadDatabase();
      return database.put(RESOURCE_STORE, resource);
    },

    async getAllResources() {
      const database = await loadDatabase();
      return database.getAll(RESOURCE_STORE);
    },

    async getResourcesByArea(area) {
      const database = await loadDatabase();
      return database.getAllFromIndex(RESOURCE_STORE, AREA_INDEX, area);
    },

    async deleteResource(id) {
      const database = await loadDatabase();
      return database.delete(RESOURCE_STORE, id);
    },
  };
}

const dbService = createDbService();

export const createResource = dbService.createResource;
export const getAllResources = dbService.getAllResources;
export const getResourcesByArea = dbService.getResourcesByArea;
export const deleteResource = dbService.deleteResource;

export default dbService;
