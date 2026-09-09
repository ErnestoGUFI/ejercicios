export default class StorageService {
  constructor(storage, onError = () => {}) {
    this.storage = storage;
    this.onError = onError;
  }

  get(key, fallback = null) {
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      return this.storage.getItem(key) ?? fallback;
    } catch {
      this.onError("leer");
      return fallback;
    }
  }

  set(key, value) {
    try {
      this.storage?.setItem(key, value);
      if (!this.storage) throw new Error("Storage unavailable");
      return true;
    } catch {
      this.onError("guardar");
      return false;
    }
  }

  remove(key) {
    try {
      this.storage?.removeItem(key);
      if (!this.storage) throw new Error("Storage unavailable");
      return true;
    } catch {
      this.onError("eliminar");
      return false;
    }
  }
}
