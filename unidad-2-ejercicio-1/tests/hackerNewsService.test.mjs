import test from "node:test";
import assert from "node:assert/strict";

const { default: HackerNewsService } = await import(
  "../src/services/HackerNewsService.js"
);

test("getTopStories returns normalized stories from Hacker News", async () => {
  const responses = new Map([
    [
      "https://hacker-news.firebaseio.com/v0/topstories.json",
      [101, 202, 303],
    ],
    [
      "https://hacker-news.firebaseio.com/v0/item/101.json",
      {
        by: "ada",
        descendants: 12,
        id: 101,
        kids: [111],
        score: 98,
        time: 1_725_000_000,
        title: "A practical guide to JavaScript modules",
        type: "story",
        url: "https://example.com/javascript-modules",
      },
    ],
    [
      "https://hacker-news.firebaseio.com/v0/item/202.json",
      {
        by: "linus",
        descendants: 7,
        id: 202,
        kids: [],
        score: 64,
        time: 1_725_000_100,
        title: "Understanding database indexes",
        type: "story",
        url: "https://example.com/database-indexes",
      },
    ],
  ]);

  const fetchFn = async (url) => ({
    ok: true,
    json: async () => responses.get(url),
  });

  const service = new HackerNewsService(fetchFn);
  const stories = await service.getTopStories(2);

  assert.deepEqual(stories, [
    {
      id: 101,
      title: "A practical guide to JavaScript modules",
      url: "https://example.com/javascript-modules",
      author: "ada",
      score: 98,
      publishedAt: 1_725_000_000,
    },
    {
      id: 202,
      title: "Understanding database indexes",
      url: "https://example.com/database-indexes",
      author: "linus",
      score: 64,
      publishedAt: 1_725_000_100,
    },
  ]);
});

test("getTopStories rejects a response that is not ok", async () => {
  const fetchFn = async () => ({ ok: false, status: 503 });
  const service = new HackerNewsService(fetchFn);

  await assert.rejects(
    () => service.getTopStories(),
    /No fue posible consultar Hacker News \(503\)/,
  );
});

test("the service preserves the browser context required by fetch", async () => {
  const fetchFn = async function (url) {
    assert.equal(this, globalThis);

    if (url.endsWith("topstories.json")) {
      return { ok: true, json: async () => [101] };
    }

    return {
      ok: true,
      json: async () => ({
        by: "ada",
        descendants: 0,
        id: 101,
        kids: [],
        score: 12,
        time: 1_725_000_000,
        title: "A browser fetch story",
        type: "story",
        url: "https://example.com/browser-fetch",
      }),
    };
  };

  const service = new HackerNewsService(fetchFn);
  const stories = await service.getTopStories(1);

  assert.equal(stories[0].title, "A browser fetch story");
});
