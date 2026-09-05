export default function LoadingView() {
  return `
    <section class="skeleton" role="status" aria-live="polite">
      <span class="sr-only">Cargando contenido…</span>
      <div class="skeleton-line skeleton-line-short" aria-hidden="true"></div>
      <div class="skeleton-line" aria-hidden="true"></div>
      <div class="skeleton-list" aria-hidden="true">
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
      </div>
    </section>
  `;
}
