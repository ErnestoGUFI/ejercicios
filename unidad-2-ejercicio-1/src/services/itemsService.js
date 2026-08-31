import { items } from "../data/items.js";

export default class ItemsService {
  async getAll() {
    return items;
  }

  async getById(id) {
    return items.find((item) => item.id === id);
  }
}
