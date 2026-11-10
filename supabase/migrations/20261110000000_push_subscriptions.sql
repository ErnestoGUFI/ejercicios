-- Unidad 4, Ejercicio 6: suscripciones push y sugerencias guardadas en el servidor.

-- Una fila por navegador suscrito. Un usuario puede tener varias (celular, laptop).
create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- Las sugerencias que antes iban a jsonplaceholder. Al insertarse una, el backend manda el push.
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- id que genera la app al encolarla: si Background Sync reintenta, no se duplica.
  client_id text not null,
  topic text not null check (char_length(topic) between 1 and 120),
  area text not null,
  comment text not null default '' check (char_length(comment) <= 1000),
  location jsonb,
  queued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

-- Solo la Edge Function (con la llave de servicio) lee y escribe estas tablas.
-- RLS activo y sin políticas: la API REST pública no las expone a nadie más.
alter table public.push_subscriptions enable row level security;
alter table public.suggestions enable row level security;
