import { slugify } from "../utils/slugify.js";

export default function ItemCard(item) {
  return `
    <li class="catalog-item">
      <a class="topic-link" href="/item/${slugify(item.name)}" data-link>
        <p class="category">${item.category}</p>
        <h2>${item.name}</h2>
        <p>${item.description}</p>
        <span class="topic-action" aria-hidden="true">Ver tema →</span>
      </a>
    </li>
  `;
}
