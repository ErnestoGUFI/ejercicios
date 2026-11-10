// Edge Function "api" (Deno). Une la lógica de handler.js con Postgres, la sesión de Supabase y web-push.
// Secretos (supabase secrets set): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT y ALLOWED_ORIGINS.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase en cada función.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { createApi, createPushSender, readAllowedOrigins } from "./handler.js";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

const db = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function check<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

const store = {
  async listSubscriptions(userId: string) {
    return check(await db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId)) ?? [];
  },

  async findSubscription(endpoint: string) {
    return check(await db.from("push_subscriptions").select("user_id, p256dh, auth").eq("endpoint", endpoint).maybeSingle());
  },

  // El endpoint es único: si el navegador ya estaba registrado, se actualiza en lugar de duplicarse.
  async saveSubscription(row: Record<string, unknown>) {
    check(await db.from("push_subscriptions").upsert(row, { onConflict: "endpoint" }));
  },

  async deleteSubscription(endpoint: string, userId?: string) {
    let query = db.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (userId) query = query.eq("user_id", userId);
    check(await query);
  },

  async createSuggestion(userId: string, suggestion: Record<string, unknown>) {
    const row = {
      user_id: userId,
      client_id: suggestion.clientId,
      topic: suggestion.topic,
      area: suggestion.area,
      comment: suggestion.comment,
      location: suggestion.location,
      queued_at: suggestion.queuedAt,
    };
    const inserted = check(await db.from("suggestions")
      .upsert(row, { onConflict: "user_id,client_id", ignoreDuplicates: true })
      .select("id"));
    if (inserted?.length) return { id: inserted[0].id, created: true };

    const existing = check(await db.from("suggestions").select("id")
      .eq("user_id", userId).eq("client_id", suggestion.clientId).single());
    return { id: existing.id, created: false };
  },
};

const auth = {
  // null (401) solo si el token es inválido o venció. Una falla del servicio de sesión se lanza y termina
  // en 500: así la app conserva su sesión y reintenta, en lugar de crear un usuario nuevo.
  async getUser(token: string) {
    const { data, error } = await db.auth.getUser(token);
    if (!error) return data.user;
    const status = (error as { status?: number }).status;
    if (status && status >= 400 && status < 500 && status !== 429) return null;
    throw error;
  },
};

const publicKey = requireEnv("VAPID_PUBLIC_KEY");

Deno.serve(createApi({
  allowedOrigins: readAllowedOrigins(requireEnv("ALLOWED_ORIGINS")),
  publicKey,
  auth,
  store,
  sender: createPushSender({
    store,
    webpush,
    vapid: { subject: requireEnv("VAPID_SUBJECT"), publicKey, privateKey: requireEnv("VAPID_PRIVATE_KEY") },
  }),
  // EdgeRuntime.waitUntil mantiene viva la función hasta terminar el envío sin retrasar la respuesta.
  // @ts-ignore EdgeRuntime existe en el runtime de Supabase.
  runInBackground: (promise: Promise<unknown>) => EdgeRuntime.waitUntil(promise),
}));
