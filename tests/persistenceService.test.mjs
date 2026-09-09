import test from "node:test";
import assert from "node:assert/strict";

import PersistenceService from "../src/services/PersistenceService.js";

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createCookieDocument() {
  const values = new Map();
  const writes = [];

  return {
    writes,
    get cookie() {
      return [...values.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    },
    set cookie(cookie) {
      writes.push(cookie);
      const [pair] = cookie.split(";");
      const [name, value] = pair.split("=");
      if (/Max-Age=0/.test(cookie)) values.delete(name);
      else values.set(name, value);
    },
  };
}

function createService(onError = () => {}) {
  return new PersistenceService({
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    cookieDocument: createCookieDocument(),
    onError,
  });
}

test("theme uses localStorage and news search uses sessionStorage", () => {
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  const service = new PersistenceService({
    localStorage,
    sessionStorage,
    cookieDocument: createCookieDocument(),
  });

  service.setTheme("dark");
  service.setNewsSearch("javascript");

  assert.equal(localStorage.getItem("tech-catalog-theme"), "dark");
  assert.equal(sessionStorage.getItem("tech-catalog-news-search"), "javascript");
  assert.equal(service.getTheme(), "dark");
  assert.equal(service.getNewsSearch(), "javascript");
});

test("registerVisit keeps a 30-day visit counter in a cookie", () => {
  const cookieDocument = createCookieDocument();
  const service = new PersistenceService({
    localStorage: createMemoryStorage(),
    sessionStorage: createMemoryStorage(),
    cookieDocument,
  });

  assert.equal(service.registerVisit(), 1);
  assert.equal(service.registerVisit(), 2);
  assert.equal(service.getVisitCount(), 2);
  assert.match(cookieDocument.writes.at(-1), /Expires=/);
});

test("each persisted value can be cleared independently", () => {
  const service = createService();
  service.setTheme("dark");
  service.setNewsSearch("css");
  service.registerVisit();

  service.clearTheme();
  assert.deepEqual(service.getSnapshot(), {
    theme: "light",
    newsSearch: "css",
    visits: 1,
  });

  service.clearNewsSearch();
  service.clearVisitCount();
  assert.deepEqual(service.getSnapshot(), {
    theme: "light",
    newsSearch: "",
    visits: 0,
  });
});
