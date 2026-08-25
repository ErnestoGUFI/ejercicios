export default async function ItemDetailView({ id }) {
  const { default: ItemsService } = await import("../services/itemsService.js");
  const item = await new ItemsService().getById(id);
  if (!item) return `<section class="detail"><h1>Tema no encontrado</h1><a href="/" data-link>Volver al inicio</a></section>`;
  return `<article class="detail"><a class="back" href="/" data-link>← Volver</a><p class="category">${item.category}</p><h1>${item.name}</h1><p>${item.description}</p><h2>Ejemplo</h2><code>${item.example}</code></article>`;
}
