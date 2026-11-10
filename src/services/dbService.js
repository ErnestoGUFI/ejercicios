import { openDB } from "../vendor/idb.js";

export const DATABASE_NAME = "tech-catalog-db";
export const DATABASE_VERSION = 3;
export const RESOURCE_STORE = "saved-resources";
export const AREA_INDEX = "by-area";
export const OUTBOX_STORE = "outbox";
// Ajustes que comparten la página y el Service Worker: la sesión del backend y si el usuario apagó los avisos.
export const SETTINGS_STORE = "settings";
export const SESSION_KEY = "session";
export const NOTIFICATIONS_KEY = "notifications";

// Cada versión solo agrega lo que falta: subir de versión conserva los recursos y la cola.
export function upgradeDatabase(database) {
  if (!database.objectStoreNames.contains(RESOURCE_STORE)) {
    const store = database.createObjectStore(RESOURCE_STORE, { keyPath: "id" });
    store.createIndex(AREA_INDEX, "area");
  }

  if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
    database.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
  }

  // v3: ajustes compartidos con el Service Worker que envía las sugerencias.
  if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
    database.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
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

    async getSession() {
      const database = await loadDatabase();
      return (await database.get(SETTINGS_STORE, SESSION_KEY)) ?? null;
    },

    async setSession(session) {
      const database = await loadDatabase();
      return database.put(SETTINGS_STORE, { ...session, id: SESSION_KEY });
    },

    // Al desactivar los avisos desde la app, el Service Worker tampoco muestra los avisos locales.
    async setNotificationsEnabled(enabled) {
      const database = await loadDatabase();
      return database.put(SETTINGS_STORE, { id: NOTIFICATIONS_KEY, enabled });
    },
  };
}

const dbService = createDbService();

export const createResource = dbService.createResource;
export const getAllResources = dbService.getAllResources;
export const getResourcesByArea = dbService.getResourcesByArea;
export const deleteResource = dbService.deleteResource;

export default dbService;
