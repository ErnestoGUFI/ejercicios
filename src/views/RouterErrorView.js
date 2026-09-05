export default function RouterErrorView() {
  return `
    <section class="error-view" aria-labelledby="route-error-title">
      <h1 id="route-error-title">No pudimos cargar esta vista</h1>
      <p>Vuelve al inicio e inténtalo nuevamente.</p>
      <a class="text-link" href="#/" data-link>Volver al inicio</a>
    </section>
  `;
}
