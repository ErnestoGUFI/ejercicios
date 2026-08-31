import NewsItem from "../components/NewsItem.js";
import HackerNewsService from "../services/HackerNewsService.js";

export default async function DevNewsView(
  _params = {},
  service = new HackerNewsService(),
) {
  try {
    const stories = await service.getTopStories();

    if (stories.length === 0) {
      return `
        <section class="news-view" aria-labelledby="news-title">
          <h1 id="news-title">Noticias para desarrolladores</h1>
          <p>No hay noticias disponibles en este momento.</p>
        </section>
      `;
    }

    return `
      <section class="news-view" aria-labelledby="news-title">
        <h1 id="news-title">Noticias para desarrolladores</h1>
        <p class="page-summary">Lecturas recientes sobre programación y tecnología obtenidas desde Hacker News.</p>
        <ol class="news-list" aria-label="Noticias destacadas">
          ${stories.map(NewsItem).join("")}
        </ol>
      </section>
    `;
  } catch {
    return `
      <section class="news-view api-error" role="alert" aria-labelledby="news-error-title">
        <h1 id="news-error-title">No pudimos cargar las noticias</h1>
        <p>Comprueba tu conexión e inténtalo de nuevo.</p>
        <a class="text-link" href="/noticias" data-link>Reintentar</a>
      </section>
    `;
  }
}
