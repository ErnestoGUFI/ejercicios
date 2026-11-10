// Configuración y cliente del backend (Supabase). Es un script clásico, no un módulo, porque lo cargan
// dos contextos: index.html con <script> y sw.js con importScripts(). Las direcciones del backend solo
// viven aquí; el resto del código las toma de self.TechBackend.
(function defineTechBackend(scope) {
  const PROJECT_URL = "https://ssdvmyexawfomfeofhmu.supabase.co";

  const config = Object.freeze({
    apiUrl: `${PROJECT_URL}/functions/v1/api`,
    authUrl: `${PROJECT_URL}/auth/v1`,
    // Llave publicable de Supabase: identifica al proyecto y puede ir en el frontend (no es un secreto).
    publishableKey: "sb_publishable__PNeVo_wf5Ff9hUgQdZ7eA_3VelqpaN",
  });

  const REFRESH_MARGIN_MS = 60 * 1000;

  // sessionStore guarda la sesión en IndexedDB para que la página y el Service Worker usen la misma.
  function createBackendClient({ sessionStore, fetcher = (...args) => scope.fetch(...args), now = () => Date.now() } = {}) {
    let pendingSession = null;

    async function authRequest(path, body) {
      const response = await fetcher(`${config.authUrl}${path}`, {
        method: "POST",
        headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const error = new Error(`La sesión respondió ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      return {
        userId: data.user?.id ?? null,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: now() + data.expires_in * 1000,
      };
    }

    // Cada dispositivo entra con un usuario anónimo de Supabase: así cada suscripción tiene su user_id.
    // Con forceRefresh se renueva aunque el token parezca vigente (el backend lo rechazó).
    async function loadSession(forceRefresh) {
      const saved = await sessionStore.get();
      if (saved && !forceRefresh && saved.expiresAt - REFRESH_MARGIN_MS > now()) return saved;

      let session;
      if (saved?.refreshToken) {
        session = await authRequest("/token?grant_type=refresh_token", { refresh_token: saved.refreshToken })
          .catch((error) => {
            // Solo un refresh token vencido o revocado obliga a empezar con un usuario nuevo;
            // una falla de red o del servidor se propaga y la sesión guardada se conserva.
            if (error.status === 400 || error.status === 401) return authRequest("/signup", {});
            throw error;
          });
      } else {
        session = await authRequest("/signup", {});
      }
      await sessionStore.set(session);
      return session;
    }

    function getSession({ forceRefresh = false } = {}) {
      pendingSession ??= loadSession(forceRefresh).finally(() => {
        pendingSession = null;
      });
      return pendingSession;
    }

    async function request(path, { method = "GET", body, auth = true } = {}, retried = false) {
      const headers = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (auth) headers.Authorization = `Bearer ${(await getSession({ forceRefresh: retried })).accessToken}`;

      const response = await fetcher(`${config.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // Si el backend rechaza el token, se renueva con el refresh token y se intenta una vez más.
      if (response.status === 401 && auth && !retried) return request(path, { method, body, auth }, true);
      return response;
    }

    return { getSession, request };
  }

  scope.TechBackend = Object.freeze({ config, createBackendClient });
})(self);
