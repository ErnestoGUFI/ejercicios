import { items } from "../data/items.js";
import ItemCard from "../components/ItemCard.js";

export default function HomeView() {
  return `
    <section class="home-view" aria-labelledby="catalog-title">
      <h1 id="catalog-title">Catálogo de tecnología</h1>
      <p class="page-summary">Conceptos esenciales para aprender y trabajar en desarrollo de software.</p>
      <ul class="catalog-list" aria-label="Temas disponibles">
        ${items.map(ItemCard).join("")}
      </ul>
    </section>
  `;
}
