import NewsItem from "../components/NewsItem.js";
import HackerNewsService from "../services/HackerNewsService.js";

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
  } catch (error) {
    const errorContent = getErrorContent(error);

    return `
      <section class="news-view api-error" role="alert" aria-labelledby="news-error-title">
        <h1 id="news-error-title">${errorContent.title}</h1>
        <p>${errorContent.message}</p>
        <a class="text-link" href="/noticias" data-link>Reintentar</a>
      </section>
    `;
  }
}
