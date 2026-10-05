const CACHE_PREFIX = "tech-catalogo-shell-v";

function versionOf(cacheName) {
  return Number(cacheName.slice(CACHE_PREFIX.length).match(/^\d+/)?.[0] ?? 0);
}

function latestCacheName(names) {
  return names
    .filter((name) => name.startsWith(CACHE_PREFIX))
    .sort((left, right) => versionOf(right) - versionOf(left))[0] ?? null;
}

function describeRequest(request, response, baseUrl) {
  const requestUrl = typeof request === "string" ? request : request.url;
  const url = new URL(requestUrl, baseUrl);
  return {
    url: url.href,
    path: `${url.pathname}${url.search}`,
    status: response?.status ?? null,
    contentType: response?.headers?.get("content-type") ?? "Desconocido",
  };
}

export function createCacheDebugService({
  cacheStorage = globalThis.caches,
  fetcher = (...args) => globalThis.fetch(...args),
  baseUrl = globalThis.location?.href ?? "http://localhost/",
} = {}) {
  async function getCurrentCache() {
    if (!cacheStorage) return { cacheName: null, cache: null };

    const cacheName = latestCacheName(await cacheStorage.keys());
    if (!cacheName) return { cacheName: null, cache: null };
    return { cacheName, cache: await cacheStorage.open(cacheName) };
  }

  return {
    async listEntries() {
      const { cacheName, cache } = await getCurrentCache();
      if (!cache) return { cacheName, entries: [] };

      const requests = await cache.keys();
      const entries = await Promise.all(requests.map(async (request) => {
        const response = await cache.match(request);
        return describeRequest(request, response, baseUrl);
      }));

      return { cacheName, entries };
    },

    async deleteEntry(requestUrl) {
      const { cache } = await getCurrentCache();
      if (!cache) return false;

      const requests = await cache.keys();
      const request = requests.find((entry) =>
        (typeof entry === "string" ? entry : entry.url) === requestUrl,
      );
      return request ? cache.delete(request) : false;
    },

    async requestDemoData() {
      const response = await fetcher("./cache-demo.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`La solicitud de demostración respondió con HTTP ${response.status}.`);
      }
      return response.json();
    },
  };
}

const cacheDebugService = createCacheDebugService();

export default cacheDebugService;
