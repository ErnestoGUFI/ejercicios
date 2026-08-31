const API_URL = "https://hacker-news.firebaseio.com/v0";

export default class HackerNewsService {
  constructor(fetchFn = globalThis.fetch) {
    this.fetchFn = fetchFn.bind(globalThis);
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
    const response = await this.fetchFn(url);

    if (!response.ok) {
      throw new Error(`No fue posible consultar Hacker News (${response.status})`);
    }

    return await response.json();
  }
}
