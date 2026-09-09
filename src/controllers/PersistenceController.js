export default class PersistenceController {
  constructor({ document, persistence, router, themeController }) {
    this.document = document;
    this.persistence = persistence;
    this.router = router;
    this.themeController = themeController;
  }

  init() {
    this.document.addEventListener("submit", (event) => {
      if (!event.target.matches("[data-news-search-form]")) return;

      event.preventDefault();
      const search = event.target.elements["news-search"].value.trim();
      this.persistence.setNewsSearch(search);
      this.router.render();
    });

    this.document.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-clear-persistence]");
      if (!button) return;

      if (button.dataset.clearPersistence === "theme") {
        this.persistence.clearTheme();
        this.themeController.apply("light");
      } else if (button.dataset.clearPersistence === "news-search") {
        this.persistence.clearNewsSearch();
      } else if (button.dataset.clearPersistence === "visits") {
        this.persistence.clearVisitCount();
      } else {
        return;
      }
      this.router.render();
    });
  }
}
