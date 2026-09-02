export default function AboutView() {
  return `
    <section class="about-view" aria-labelledby="about-title">
      <h1 id="about-title">Acerca del ejercicio</h1>
      <p>Esta SPA demuestra navegación del lado del cliente, rutas dinámicas y carga bajo demanda usando JavaScript modular.</p>
      <dl class="architecture-list">
        <div>
          <dt>App Shell</dt>
          <dd>Header, navegación, contenedor principal y footer permanecen estables.</dd>
        </div>
        <div>
          <dt>Contenido dinámico</dt>
          <dd>Inicio, detalle, acerca y estados de error se renderizan dentro de <code>#app</code>.</dd>
        </div>
      </dl>
    </section>
  `;
}
