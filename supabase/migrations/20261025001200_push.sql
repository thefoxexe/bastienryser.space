-- Notifications push (app installée ou navigateur) : abonnements des appareils et clés VAPID.
-- La clé privée VAPID est générée par l'Edge Function `push` au premier usage et rangée dans le Vault.

create table public.push_subscriptions (
  endpoint text primary key check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text
);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_admin_all on public.push_subscriptions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.push_subscriptions from anon;

-- Une seule ligne : la clé publique (partagée avec le navigateur) et la référence Vault de la clé privée.
create table public.push_config (
  id boolean primary key default true check (id),
  public_key text not null,
  private_key_ref uuid not null,
  created_at timestamptz not null default now()
);

alter table public.push_config enable row level security;
-- Lecture réservée à l'Edge Function (service role) : aucune politique pour les utilisateurs.
revoke all on public.push_config from anon, authenticated;

-- Chaque lundi à 7 h 03 UTC (8 h ou 9 h en Suisse) : le résumé de la semaine.
select cron.schedule('weekly-push', '3 7 * * 1', $$ select public.call_edge_function('push') $$);
