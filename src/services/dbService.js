import { openDB } from "../vendor/idb.js";

export const DATABASE_NAME = "tech-catalog-db";
export const DATABASE_VERSION = 2;
export const RESOURCE_STORE = "saved-resources";
export const AREA_INDEX = "by-area";
export const OUTBOX_STORE = "outbox";

// Cada versión solo agrega lo que falta: subir de la 1 a la 2 conserva los recursos guardados.
export function upgradeDatabase(database) {
  if (!database.objectStoreNames.contains(RESOURCE_STORE)) {
    const store = database.createObjectStore(RESOURCE_STORE, { keyPath: "id" });
    store.createIndex(AREA_INDEX, "area");
  }

  if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
    database.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
  }
}

export function createDatabase(openDatabase = openDB) {
  return openDatabase(DATABASE_NAME, DATABASE_VERSION, { upgrade: upgradeDatabase });
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

    async addToOutbox(item) {
      const database = await loadDatabase();
      return database.put(OUTBOX_STORE, item);
    },

    async getOutbox() {
      const database = await loadDatabase();
      const items = await database.getAll(OUTBOX_STORE);
      return items.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
    },
  };
}

const dbService = createDbService();

export const createResource = dbService.createResource;
export const getAllResources = dbService.getAllResources;
export const getResourcesByArea = dbService.getResourcesByArea;
export const deleteResource = dbService.deleteResource;

export default dbService;
