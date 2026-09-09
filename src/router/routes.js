import HomeView from "../views/HomeView.js";
import AboutView from "../views/AboutView.js";
import DevNewsView from "../views/DevNewsView.js";
import ItemDetailView from "../views/ItemDetailView.js";
import PersistenceView from "../views/PersistenceView.js";
import PersistenceService from "../services/PersistenceService.js";

export function createRoutes(persistence = new PersistenceService()) {
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
    { path: "/acerca", view: AboutView },
    { path: "/item/:id", view: ItemDetailView },
  ];
}

export const routes = createRoutes();
