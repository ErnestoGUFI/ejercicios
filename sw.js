const CACHE_NAME = "tech-catalogo-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./styles/tokens.css",
  "./styles/shell.css",
  "./styles/components.css",
  "./styles/views.css",
  "./src/main.js",
];

console.info("[SW] Ejecutado");
console.info("[SW] Contexto global:", self.constructor.name);
console.info("[SW] typeof window:", typeof window);
console.info("[SW] typeof document:", typeof document);
console.info("[SW] typeof localStorage:", typeof localStorage);
console.info("[SW] Scope:", self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ),
    ),
  );
});
