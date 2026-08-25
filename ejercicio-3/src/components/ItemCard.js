import { slugify } from "../utils/slugify.js";

export default function ItemCard(item) {
  return `<a class="card" href="/item/${slugify(item.name)}" data-link><p class="category">${item.category}</p><h2>${item.name}</h2><p>${item.description}</p></a>`;
}
