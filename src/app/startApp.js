import showPersistenceWarning from "../components/PersistenceNotice.js";
import PersistenceController from "../controllers/PersistenceController.js";
import SavedResourcesController from "../controllers/SavedResourcesController.js";
import ServiceWorkerController from "../controllers/ServiceWorkerController.js";
import ThemeController from "../controllers/ThemeController.js";
import initNetworkStatusNotice from "../components/NetworkStatusNotice.js";
import initInstallControl from "../components/InstallControl.js";
import Router from "../router/router.js";
import { createRoutes } from "../router/routes.js";
import PersistenceService from "../services/PersistenceService.js";
import dbService from "../services/dbService.js";
import serviceWorkerDiagnostics from "../pwa/diagnostics.js";
import { createInstallPrompt } from "../pwa/installPrompt.js";
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
  database = dbService,
  diagnostics = serviceWorkerDiagnostics,
} = {}) {
  const warning = browserDocument.querySelector("#persistence-warning");
  initNetworkStatusNotice({
    notice: browserDocument.querySelector("#network-status"),
    eventTarget: browserWindow,
    navigatorObject: browserWindow.navigator ?? globalThis.navigator,
  });
  // La instalación se escucha desde el arranque: Chrome puede ofrecerla antes de abrir cualquier vista.
  const installPrompt = createInstallPrompt({ browserWindow }).init();
  initInstallControl({
    button: browserDocument.querySelector("#install-button"),
    hint: browserDocument.querySelector("#install-hint"),
    installPrompt,
    storage: readStorage(browserWindow, "sessionStorage"),
  });
  const persistence = new PersistenceService({
    localStorage: readStorage(browserWindow, "localStorage"),
    sessionStorage: readStorage(browserWindow, "sessionStorage"),
    cookieDocument: browserDocument,
    onError: (mechanism) => showPersistenceWarning(warning, mechanism),
  });
  const router = new Router(
    createRoutes(persistence, database, diagnostics),
    browserDocument.querySelector("#app"),
    NotFoundView,
  );
  const themeController = new ThemeController({
    select: browserDocument.querySelector("#theme-select"),
    root: browserDocument.documentElement,
    persistence,
    themeColorMeta: browserDocument.querySelector('meta[name="theme-color"]'),
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
  new SavedResourcesController({
    document: browserDocument,
    database,
  }).init();
  new ServiceWorkerController({
    document: browserDocument,
    diagnostics,
    router,
  }).init();
  router.init();

  return { installPrompt, persistence, router, themeController };
}
