# Ejercicio 3 - Mini SPA de tecnología

Aplicación construida únicamente con HTML, CSS y JavaScript modular ES6.

## Ejecutar con Live Server

1. Abre esta carpeta en Visual Studio Code.
2. Instala la extensión **Live Server** si aún no la tienes.
3. Haz clic derecho en `index.html` y elige **Open with Live Server**.
4. Abre la URL que indique Live Server, normalmente `http://127.0.0.1:5500/`.

No abras `index.html` con `file://`, porque los módulos ES6 requieren un servidor HTTP.

## Probar la aplicación

- `/` muestra los cuatro temas del catálogo.
- `/acerca` muestra la vista secundaria.
- Al abrir una tarjeta se navega a `/item/:id`, por ejemplo `/item/mysql`.
- Una URL interna inexistente muestra la vista 404.
- Usa los botones Atrás y Adelante del navegador para comprobar `popstate`.

## Evidencia del import dinámico

1. Abre la ruta principal y DevTools con **Network** visible.
2. Activa **Disable cache** si está disponible y recarga la página.
3. Comprueba que `itemsService.js` no se solicita al inicio.
4. Abre una tarjeta, por ejemplo MySQL.
5. Localiza `itemsService.js` en Network y toma la captura real.

`ItemDetailView.js` carga ese servicio con `await import("../services/itemsService.js")`, por lo que solo se descarga al entrar al detalle.

## Explicación de `matchRoute()`

`matchRoute()` separa la ruta declarada y la URL en segmentos. Cuando encuentra un segmento que comienza con `:`, guarda el valor real de la URL como parámetro. Por ello, `/item/mysql` coincide con `/item/:id` y devuelve `{ id: "mysql" }`. El router entrega ese objeto a `ItemDetailView`, que consulta el elemento solicitado. Si un segmento estático o la cantidad de segmentos no coincide, la ruta se rechaza.

## Requisitos técnicos

- `slugify` es una exportación nombrada utilizada en `src/data/items.js` y `src/components/ItemCard.js`.
- `ItemsService` es una exportación por defecto y ofrece `getAll()` y `getById()`.
- `ItemDetailView` realiza el import dinámico obligatorio.
- La estructura conserva `router`, `views`, `components`, `services` y `utils`.
