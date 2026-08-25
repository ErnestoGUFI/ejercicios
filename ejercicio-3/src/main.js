import Router from "./router/router.js";
import HomeView from "./views/HomeView.js";
import AboutView from "./views/AboutView.js";
import ItemDetailView from "./views/ItemDetailView.js";
import NotFoundView from "./views/NotFoundView.js";

new Router([
  { path: "/", view: HomeView },
  { path: "/acerca", view: AboutView },
  { path: "/item/:id", view: ItemDetailView },
], document.querySelector("#app"), NotFoundView).init();
