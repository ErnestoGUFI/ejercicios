import NewsItem from "../components/NewsItem.js";
import HackerNewsService from "../services/HackerNewsService.js";
import PersistenceService from "../services/PersistenceService.js";
import escapeHtml from "../utils/escapeHtml.js";

function getErrorContent(error) {
  if (error?.name === "AbortError") {
    return {
      title: "La solicitud tardó demasiado",
      message: "El servicio superó el límite de 5 segundos. Inténtalo de nuevo.",
    };
  }

  if (error?.name === "HttpError") {
    return {
      title: "El servicio de noticias no está disponible",
      message: `El servidor respondió con el estado ${error.status}. Inténtalo de nuevo más tarde.`,
    };
  }

  if (error instanceof TypeError) {
    return {
      title: "No pudimos conectar con el servicio de noticias",
      message:
        "Puede deberse a tu conexión o una restricción CORS. Revisa la red e inténtalo otra vez.",
    };
  }

  return {
    title: "No pudimos cargar las noticias",
    message: "Ocurrió un error inesperado. Inténtalo de nuevo.",
  };
}

export default async function DevNewsView(
  _params = {},
  service = new HackerNewsService(),
  persistence = new PersistenceService(),
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

    const newsSearch = persistence.getNewsSearch();
    const normalizedSearch = newsSearch.toLocaleLowerCase("es");
    const filteredStories = stories.filter((story) =>
      story.title.toLocaleLowerCase("es").includes(normalizedSearch),
    );

    return `
      <section class="news-view" aria-labelledby="news-title">
        <h1 id="news-title">Noticias para desarrolladores</h1>
        <p class="page-summary">Lecturas recientes sobre programación y tecnología obtenidas desde Hacker News.</p>
        <form class="news-search" data-news-search-form>
          <label for="news-search">Buscar en las noticias</label>
          <div>
            <input id="news-search" name="news-search" type="search" value="${escapeHtml(newsSearch)}">
            <button type="submit">Aplicar</button>
          </div>
        </form>
        ${
          filteredStories.length > 0
            ? `<ol class="news-list" aria-label="Noticias destacadas">
                ${filteredStories.map(NewsItem).join("")}
              </ol>`
            : `<p class="news-empty">No hay noticias que coincidan con la búsqueda.</p>`
        }
      </section>
    `;
  } catch (error) {
    const errorContent = getErrorContent(error);

    return `
      <section class="news-view api-error" role="alert" aria-labelledby="news-error-title">
        <h1 id="news-error-title">${errorContent.title}</h1>
        <p>${errorContent.message}</p>
        <a class="text-link" href="#/noticias" data-link>Reintentar</a>
      </section>
    `;
  }
}
