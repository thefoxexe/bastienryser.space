-- Module « Données » : surveillance des sites, connecteurs (Stripe, Plausible) et séries de chiffres réels.

-- ---------------------------------------------------------------------------
-- Surveillance des sites web de chaque business
-- ---------------------------------------------------------------------------

create table public.site_checks (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  url text not null,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  status_code integer,
  response_ms integer,
  error text
);

create index on public.site_checks (business_id, url, checked_at desc);
create index on public.site_checks (checked_at);

-- ---------------------------------------------------------------------------
-- Connecteurs de données
-- ---------------------------------------------------------------------------

create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('stripe', 'plausible')),
  label text not null,
  -- Réglages non secrets (ex. site_id et adresse d'une instance Plausible).
  config jsonb not null default '{}',
  -- Clé d'API chiffrée dans Vault : jamais en clair, jamais renvoyée au navigateur.
  credential_ref uuid,
  status text not null default 'connected' check (status in ('connected', 'error')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (business_id, kind)
);

-- Une valeur par connecteur, métrique, jour et unité (devise pour les revenus).
create table public.metric_points (
  id bigint generated always as identity primary key,
  connector_id uuid not null references public.connectors (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  metric text not null,
  day date not null,
  unit text not null default '',
  value numeric not null,
  updated_at timestamptz not null default now(),
  unique (connector_id, metric, day, unit)
);

create index on public.metric_points (business_id, metric, day);

-- ---------------------------------------------------------------------------
-- RLS : lecture et suppression par l'admin ; écriture par les Edge Functions.
-- ---------------------------------------------------------------------------

alter table public.site_checks enable row level security;
create policy site_checks_admin_select on public.site_checks
  for select to authenticated using ((select public.is_admin()));

alter table public.connectors enable row level security;
create policy connectors_admin_select on public.connectors
  for select to authenticated using ((select public.is_admin()));
create policy connectors_admin_delete on public.connectors
  for delete to authenticated using ((select public.is_admin()));

alter table public.metric_points enable row level security;
create policy metric_points_admin_select on public.metric_points
  for select to authenticated using ((select public.is_admin()));

revoke all on public.site_checks, public.connectors, public.metric_points from anon;
revoke insert, update, truncate on public.site_checks, public.connectors, public.metric_points from authenticated;
revoke delete on public.site_checks, public.metric_points from authenticated;

create or replace function public.connectors_delete_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.credential_ref;
  return old;
end;
$$;

create trigger connectors_delete_secret
  after delete on public.connectors
  for each row execute function public.connectors_delete_secret();

revoke execute on function public.connectors_delete_secret() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Disponibilité calculée côté base (évite de rapatrier des milliers de mesures).
-- ---------------------------------------------------------------------------

create or replace function public.site_uptime(p_business_id uuid default null, p_days integer default 30)
returns table (
  business_id uuid,
  url text,
  day date,
  checks integer,
  ok_checks integer,
  avg_ms integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.business_id,
    c.url,
    (c.checked_at at time zone 'Europe/Zurich')::date as day,
    count(*)::integer,
    count(*) filter (where c.ok)::integer,
    round(avg(c.response_ms) filter (where c.ok))::integer
  from public.site_checks c
  where c.checked_at >= now() - make_interval(days => p_days)
    and (p_business_id is null or c.business_id = p_business_id)
  group by 1, 2, 3
  order by 1, 2, 3;
$$;

revoke execute on function public.site_uptime(uuid, integer) from public, anon;
grant execute on function public.site_uptime(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Module activé pour les business existants, et tâches programmées.
-- ---------------------------------------------------------------------------

update public.businesses set modules = array_append(modules, 'data') where not ('data' = any (modules));
alter table public.businesses alter column modules set default '{social,data}';

-- Toutes les 5 minutes : disponibilité des sites. Chaque heure (à :07) : synchronisation des connecteurs.
select cron.schedule('monitor-sites', '*/5 * * * *', $$ select public.call_edge_function('monitor-sites') $$);
select cron.schedule('sync-connectors', '7 * * * *', $$ select public.call_edge_function('sync-connectors') $$);
