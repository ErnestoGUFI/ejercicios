# Backend (Supabase)

API del proyecto para las notificaciones push y las sugerencias. El frontend sigue en GitHub Pages y la
dirección del backend está solo en [`src/pwa/backend.js`](../src/pwa/backend.js).

- `migrations/`: tablas `push_subscriptions` y `suggestions`.
- `functions/api/handler.js`: rutas, CORS, envío y limpieza de suscripciones (probado con `npm test`).
- `functions/api/index.ts`: conecta la lógica con Postgres, la sesión de Supabase y `web-push`.

| Ruta | Sesión | Uso |
| --- | --- | --- |
| `GET /api/push/public-key` | no | Llave pública VAPID |
| `POST /api/push/subscriptions` | sí | Guarda la suscripción del dispositivo |
| `DELETE /api/push/subscriptions` | sí | Da de baja la suscripción |
| `POST /api/suggestions` | sí | Guarda una sugerencia y avisa por push |

No hay ruta para enviar un push a mano: el aviso sale cuando el servidor guarda una sugerencia nueva.

## Variables de entorno

Se guardan como secretos de Supabase, nunca en el repositorio:

| Variable | Valor |
| --- | --- |
| `VAPID_PUBLIC_KEY` | Llave pública VAPID |
| `VAPID_PRIVATE_KEY` | Llave privada VAPID |
| `VAPID_SUBJECT` | Contacto del remitente: `https://github.com/ErnestoGUFI/ejercicios` |
| `ALLOWED_ORIGINS` | `https://ernestogufi.github.io` |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las pone Supabase en la función.

## Despliegue

```bash
npx web-push generate-vapid-keys
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=https://github.com/ErnestoGUFI/ejercicios ALLOWED_ORIGINS=https://ernestogufi.github.io
supabase db push
supabase config push
supabase functions deploy api
```

`supabase config push` activa el inicio de sesión anónimo: cada dispositivo recibe un usuario y sus
suscripciones quedan ligadas a ese `user_id`.
