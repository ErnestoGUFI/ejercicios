import showPersistenceWarning from "../components/PersistenceNotice.js";
import LocationController from "../controllers/LocationController.js";
import PersistenceController from "../controllers/PersistenceController.js";
import SavedResourcesController from "../controllers/SavedResourcesController.js";
import ShareController from "../controllers/ShareController.js";
import SuggestionsController from "../controllers/SuggestionsController.js";
import ServiceWorkerController from "../controllers/ServiceWorkerController.js";
import ThemeController from "../controllers/ThemeController.js";
import initNetworkStatusNotice from "../components/NetworkStatusNotice.js";
import initInstallControl from "../components/InstallControl.js";
import Router from "../router/router.js";
import { createRoutes } from "../router/routes.js";
import PersistenceService from "../services/PersistenceService.js";
import dbService from "../services/dbService.js";
import serviceWorkerDiagnostics from "../pwa/diagnostics.js";
import { createLocationService } from "../pwa/geolocation.js";
import { createInstallPrompt } from "../pwa/installPrompt.js";
import { createOutboxSync } from "../pwa/outboxSync.js";
import { createShareService } from "../pwa/share.js";
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
  // La cola de sugerencias arranca con la app para que el plan B reintente al abrirla.
  const outboxSync = createOutboxSync({ browserWindow, database }).init();
  // Las banderas de prueba (?timeout-ubicacion, ?sin-share, ?sin-portapapeles) se leen una vez al arrancar.
  const search = browserWindow.location?.search ?? "";
  const locationService = createLocationService({
    navigatorObject: browserWindow.navigator,
    browserWindow,
    search,
  });
  const shareService = createShareService({ navigatorObject: browserWindow.navigator, search });
  const router = new Router(
    createRoutes(persistence, database, diagnostics, outboxSync, locationService, shareService),
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
  new SuggestionsController({
    document: browserDocument,
    outboxSync,
  }).init();
  new LocationController({
    document: browserDocument,
    locationService,
  }).init();
  new ShareController({
    document: browserDocument,
    shareService,
  }).init();
  new ServiceWorkerController({
    document: browserDocument,
    diagnostics,
    router,
  }).init();
  router.init();

  return {
    installPrompt,
    locationService,
    outboxSync,
    persistence,
    router,
    shareService,
    themeController,
  };
}
