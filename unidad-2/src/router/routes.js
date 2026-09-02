import HomeView from "../views/HomeView.js";
import AboutView from "../views/AboutView.js";
import DevNewsView from "../views/DevNewsView.js";
import ItemDetailView from "../views/ItemDetailView.js";

export const routes = [
  { path: "/", view: HomeView },
  { path: "/noticias", view: DevNewsView },
  { path: "/acerca", view: AboutView },
  { path: "/item/:id", view: ItemDetailView },
];
