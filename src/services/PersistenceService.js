import StorageService from "./StorageService.js";
import { deleteCookie, getCookie, setCookie } from "./CookieService.js";

export const THEME_KEY = "tech-catalog-theme";
export const NEWS_SEARCH_KEY = "tech-catalog-news-search";
export const VISITS_COOKIE = "tech-catalog-visits";
export const VISITS_COOKIE_DAYS = 30;

function getBrowserValue(name) {
  try {
    return globalThis[name];
  } catch {
    return undefined;
  }
}

export default class PersistenceService {
  constructor({
    localStorage = getBrowserValue("localStorage"),
    sessionStorage = getBrowserValue("sessionStorage"),
    cookieDocument = getBrowserValue("document"),
    onError = () => {},
  } = {}) {
    this.local = new StorageService(localStorage, () => onError("localStorage"));
    this.session = new StorageService(
      sessionStorage,
      () => onError("sessionStorage"),
    );
    this.cookieDocument = cookieDocument;
    this.onError = onError;
  }

  getTheme() {
    const theme = this.local.get(THEME_KEY, "light");
    return theme === "dark" ? "dark" : "light";
  }

  setTheme(theme) {
    return this.local.set(THEME_KEY, theme === "dark" ? "dark" : "light");
  }

  clearTheme() {
    return this.local.remove(THEME_KEY);
  }

  getNewsSearch() {
    return this.session.get(NEWS_SEARCH_KEY, "");
  }

  setNewsSearch(search) {
    return this.session.set(NEWS_SEARCH_KEY, String(search).trim());
  }

  clearNewsSearch() {
    return this.session.remove(NEWS_SEARCH_KEY);
  }

  getVisitCount() {
    const value = getCookie(
      VISITS_COOKIE,
      this.cookieDocument,
      () => this.onError("cookies"),
    );
    const count = Number.parseInt(value ?? "0", 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  registerVisit() {
    const nextCount = this.getVisitCount() + 1;
    const saved = setCookie(
      VISITS_COOKIE,
      String(nextCount),
      VISITS_COOKIE_DAYS,
      this.cookieDocument,
      () => this.onError("cookies"),
    );
    return saved ? nextCount : this.getVisitCount();
  }

  clearVisitCount() {
    return deleteCookie(
      VISITS_COOKIE,
      this.cookieDocument,
      () => this.onError("cookies"),
    );
  }

  getSnapshot() {
    return {
      theme: this.getTheme(),
      newsSearch: this.getNewsSearch(),
      visits: this.getVisitCount(),
    };
  }
}
