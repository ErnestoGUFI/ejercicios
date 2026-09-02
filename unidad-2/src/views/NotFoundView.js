export default function NotFoundView() {
  return `
    <section class="not-found-view" aria-labelledby="not-found-title">
      <h1 id="not-found-title">404</h1>
      <p>La página solicitada no existe.</p>
      <a class="text-link" href="/" data-link>Volver al inicio</a>
    </section>
  `;
}
