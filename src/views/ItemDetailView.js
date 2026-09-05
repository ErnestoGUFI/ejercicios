export default async function ItemDetailView({ id }) {
  const { default: ItemsService } = await import("../services/itemsService.js");
  const item = await new ItemsService().getById(id);

  if (!item) {
    return `
      <section class="not-found-view" aria-labelledby="missing-topic-title">
        <h1 id="missing-topic-title">Tema no encontrado</h1>
        <p>El tema solicitado no está disponible en el catálogo.</p>
        <a class="text-link" href="#/" data-link>Volver al inicio</a>
      </section>
    `;
  }

  return `
    <article class="detail-view" aria-labelledby="topic-title">
      <a class="back-link" href="#/" data-link>← Volver al catálogo</a>
      <div class="detail-layout">
        <header class="detail-copy">
          <p class="category">${item.category}</p>
          <h1 id="topic-title">${item.name}</h1>
          <p class="detail-description">${item.description}</p>
        </header>
        <section class="example-panel" aria-labelledby="example-title">
          <h2 id="example-title">Ejemplo</h2>
          <pre><code>${item.example}</code></pre>
        </section>
      </div>
    </article>
  `;
}
