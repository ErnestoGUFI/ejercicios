import HomeView from "../views/HomeView.js";
import AboutView from "../views/AboutView.js";
import DevNewsView from "../views/DevNewsView.js";
import ItemDetailView from "../views/ItemDetailView.js";
import PersistenceView from "../views/PersistenceView.js";
import SavedResourcesView from "../views/SavedResourcesView.js";
import ServiceWorkerView from "../views/ServiceWorkerView.js";
import PersistenceService from "../services/PersistenceService.js";
import dbService from "../services/dbService.js";
import serviceWorkerDiagnostics from "../pwa/diagnostics.js";

export function createRoutes(
  persistence = new PersistenceService(),
  database = dbService,
  diagnostics = serviceWorkerDiagnostics,
) {
  return [
    { path: "/", view: HomeView },
    {
      path: "/noticias",
      view: (params, service) => DevNewsView(params, service, persistence),
    },
    {
      path: "/persistencia",
      view: (params) => PersistenceView(params, persistence),
    },
    {
      path: "/guardados",
      view: (params) => SavedResourcesView(params, database),
    },
    {
      path: "/service-worker",
      view: (params) => ServiceWorkerView(params, diagnostics),
    },
    { path: "/acerca", view: AboutView },
    { path: "/item/:id", view: ItemDetailView },
  ];
}

export const routes = createRoutes();
