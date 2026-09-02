const API_URL = "https://hacker-news.firebaseio.com/v0";
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_NETWORK_RETRIES = 1;
const RETRY_MESSAGE = "Reintentando petición por un error de red…";

class NetworkError extends TypeError {
  constructor(error) {
    super(error.message);
    this.name = "TypeError";
    this.cause = error;
  }
}

export class HttpError extends Error {
  constructor(status) {
    super(`No fue posible consultar Hacker News (${status})`);
    this.name = "HttpError";
    this.status = status;
  }
}

export default class HackerNewsService {
  constructor(
    fetchFn = globalThis.fetch,
    {
      timeoutMs = DEFAULT_TIMEOUT_MS,
      networkRetries = DEFAULT_NETWORK_RETRIES,
      logger = console,
    } = {},
  ) {
    this.fetchFn = fetchFn.bind(globalThis);
    this.timeoutMs = timeoutMs;
    this.networkRetries = networkRetries;
    this.logger = logger;
  }

  async getTopStories(limit = 8) {
    const ids = await this.getJson(`${API_URL}/topstories.json`);
    const selectedIds = ids.slice(0, limit);
    const stories = await Promise.all(
      selectedIds.map((id) => this.getJson(`${API_URL}/item/${id}.json`)),
    );

    return stories.map((story) => ({
      id: story.id,
      title: story.title,
      url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
      author: story.by,
      score: story.score,
      publishedAt: story.time,
    }));
  }

  async getJson(url) {
    let attempt = 0;

    while (true) {
      try {
        return await this.requestJson(url);
      } catch (error) {
        const canRetry =
          error instanceof NetworkError && attempt < this.networkRetries;

        if (!canRetry) {
          throw error;
        }

        attempt += 1;
        this.logger.log(RETRY_MESSAGE);
      }
    }
  }

  async requestJson(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response;

      try {
        response = await this.fetchFn(url, { signal: controller.signal });
      } catch (error) {
        if (error instanceof TypeError) {
          throw new NetworkError(error);
        }

        throw error;
      }

      if (!response.ok) {
        throw new HttpError(response.status);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
