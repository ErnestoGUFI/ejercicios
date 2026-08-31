import Router from "./router/router.js";
import { routes } from "./router/routes.js";
import NotFoundView from "./views/NotFoundView.js";

new Router(routes, document.querySelector("#app"), NotFoundView).init();
