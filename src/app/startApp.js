import showPersistenceWarning from "../components/PersistenceNotice.js";
import PersistenceController from "../controllers/PersistenceController.js";
import ThemeController from "../controllers/ThemeController.js";
import Router from "../router/router.js";
import { createRoutes } from "../router/routes.js";
import PersistenceService from "../services/PersistenceService.js";
import NotFoundView from "../views/NotFoundView.js";

function readStorage(browserWindow, name) {
  try {
    return browserWindow[name];
  } catch {
    return undefined;
  }
}

export default function startApp({
  browserWindow = globalThis.window,
  browserDocument = globalThis.document,
} = {}) {
  const warning = browserDocument.querySelector("#persistence-warning");
  const persistence = new PersistenceService({
    localStorage: readStorage(browserWindow, "localStorage"),
    sessionStorage: readStorage(browserWindow, "sessionStorage"),
    cookieDocument: browserDocument,
    onError: (mechanism) => showPersistenceWarning(warning, mechanism),
  });
  const router = new Router(
    createRoutes(persistence),
    browserDocument.querySelector("#app"),
    NotFoundView,
  );
  const themeController = new ThemeController({
    select: browserDocument.querySelector("#theme-select"),
    root: browserDocument.documentElement,
    persistence,
    eventTarget: browserWindow,
    onChange: () => {
      if (browserWindow.location.hash === "#/persistencia") router.render();
    },
  });

  themeController.init();
  persistence.registerVisit();
  new PersistenceController({
    document: browserDocument,
    persistence,
    router,
    themeController,
  }).init();
  router.init();

  return { persistence, router, themeController };
}
