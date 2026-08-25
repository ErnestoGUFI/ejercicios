import { items } from "../data/items.js";
import ItemCard from "../components/ItemCard.js";

export default function HomeView() {
  return `<section><h1>Catálogo de tecnología</h1><p>Selecciona un tema para ver su detalle.</p><div class="grid">${items.map(ItemCard).join("")}</div></section>`;
}
