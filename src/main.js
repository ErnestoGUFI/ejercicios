import startApp from "./app/startApp.js";
import { scheduleServiceWorkerRegistration } from "./pwa/registerSW.js";

startApp();
scheduleServiceWorkerRegistration(window);
