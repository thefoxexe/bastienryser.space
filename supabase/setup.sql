-- Installation complète de bastienryser.space (généré par supabase/scripts/build-setup.mjs, ne pas modifier à la main).
-- À coller en une fois dans Supabase > SQL Editor > New query, puis Run, sur un projet neuf.
-- Contient 8 migrations, l'adresse du projet pour les tâches automatiques et l'accès admin.

-- ===========================================================================
-- 20261025000000_socle.sql
-- ===========================================================================

-- Étape 1 : socle. Seuls les comptes listés dans `admins` ont accès aux données.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Comptes autorisés à utiliser le panel. Se remplit à la main depuis le tableau de bord Supabase.';

-- Vrai si la personne connectée est admin ET, si elle a activé la double
-- authentification, si sa session a bien été validée avec le code (aal2).
-- Toutes les règles RLS du panel s'appuient sur cette fonction.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.admins a where a.user_id = (select auth.uid())
    )
    and (
      coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = (select auth.uid())
          and f.status = 'verified'
      )
    );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.admins enable row level security;

-- Lecture seule de sa propre ligne. Aucune écriture possible depuis l'application.
create policy "admins_select_self"
  on public.admins
  for select
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));

revoke all on public.admins from anon;
revoke insert, update, delete, truncate on public.admins from authenticated;

-- ===========================================================================
-- 20261025000100_panel.sql
-- ===========================================================================

-- Étapes 2 à 8 : business, modules, réseaux sociaux, publication, suivi, journal.
-- Toutes les tables ont la RLS activée et ne s'ouvrent qu'à public.is_admin().

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.social_network as enum ('instagram', 'facebook', 'linkedin', 'linkedin_page', 'threads');
create type public.account_status as enum ('connected', 'expiring', 'expired', 'error');
create type public.post_status as enum ('draft', 'scheduled', 'publishing', 'published', 'partial', 'failed');
create type public.target_status as enum ('pending', 'publishing', 'published', 'failed');
create type public.media_kind as enum ('image', 'video', 'pdf');

-- ---------------------------------------------------------------------------
-- Business et modules
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),
  name text not null check (length(name) between 1 and 80),
  description text,
  color text not null default '#1d1d1f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  logo_path text,
  websites text[] not null default '{}',
  -- Modules activés, ex. {social}. Chaque module a ses propres tables et onglets.
  modules text[] not null default '{social}',
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Module « Réseaux sociaux »
-- ---------------------------------------------------------------------------

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  network public.social_network not null,
  display_name text not null,
  username text,
  avatar_url text,
  external_id text not null,
  -- Identifiants de secrets dans Supabase Vault : jamais le token en clair.
  token_ref uuid,
  token_expires_at timestamptz,
  refresh_token_ref uuid,
  refresh_expires_at timestamptz,
  status public.account_status not null default 'connected',
  last_error text,
  meta jsonb not null default '{}',
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, network, external_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text,
  status public.post_status not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  position integer not null,
  storage_path text not null,
  kind public.media_kind not null default 'image',
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create table public.post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  social_account_id uuid references public.social_accounts (id) on delete set null,
  network public.social_network not null,
  caption text not null default '',
  status public.target_status not null default 'pending',
  external_post_id text,
  permalink text,
  error_message text,
  attempts integer not null default 0,
  -- null = brouillon, jamais pris par publish-due.
  next_attempt_at timestamptz,
  locked_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, social_account_id)
);

create table public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_target_id uuid not null references public.post_targets (id) on delete cascade,
  fetched_at timestamptz not null default now(),
  impressions integer, -- « vues » chez Meta depuis 2025
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  raw jsonb not null default '{}'
);

-- Statistiques de compte, une ligne par jour (abonnés, portée…), uniquement si l'API les fournit.
create table public.account_insights (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  day date not null,
  followers integer,
  reach integer,
  impressions integer,
  interactions integer,
  fetched_at timestamptz not null default now(),
  unique (social_account_id, day)
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete set null,
  kind text not null,
  message text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Jetons anti-CSRF du flux OAuth (lus uniquement par l'edge function `oauth`).
create table public.oauth_states (
  state text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('meta', 'linkedin', 'linkedin_page', 'threads')),
  code_verifier text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index on public.social_accounts (business_id);
create index on public.posts (business_id, scheduled_at);
create index on public.posts (status);
create index on public.post_media (post_id, position);
create index on public.post_targets (post_id);
create index on public.post_targets (status, next_attempt_at);
create index on public.post_metrics (post_target_id, fetched_at desc);
create index on public.account_insights (social_account_id, day desc);
create index on public.activity_log (created_at desc);
create index on public.activity_log (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS : tout passe par public.is_admin()
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses', 'posts', 'post_media', 'post_targets', 'post_metrics',
    'account_insights', 'activity_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t || '_admin_all', t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Comptes sociaux : lecture, modification et suppression par l'admin.
-- La création se fait uniquement par l'edge function OAuth (service role).
alter table public.social_accounts enable row level security;
create policy social_accounts_admin_select on public.social_accounts
  for select to authenticated using ((select public.is_admin()));
create policy social_accounts_admin_delete on public.social_accounts
  for delete to authenticated using ((select public.is_admin()));
revoke all on public.social_accounts from anon;
revoke insert, update on public.social_accounts from authenticated;

-- États OAuth : l'admin peut seulement en créer un.
alter table public.oauth_states enable row level security;
create policy oauth_states_admin_insert on public.oauth_states
  for insert to authenticated with check ((select public.is_admin()));
revoke all on public.oauth_states from anon;
revoke select, update, delete on public.oauth_states from authenticated;

-- ---------------------------------------------------------------------------
-- Tokens chiffrés (Supabase Vault). Réservé au service role (edge functions).
-- ---------------------------------------------------------------------------

create or replace function public.vault_store_token(p_secret text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return vault.create_secret(p_secret, p_name || ':' || gen_random_uuid()::text);
end;
$$;

create or replace function public.vault_update_token(p_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform vault.update_secret(p_id, p_secret);
end;
$$;

create or replace function public.vault_read_token(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_id;
$$;

create or replace function public.vault_delete_tokens()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id in (old.token_ref, old.refresh_token_ref);
  return old;
end;
$$;

create trigger social_accounts_delete_tokens
  after delete on public.social_accounts
  for each row execute function public.vault_delete_tokens();

revoke execute on function public.vault_store_token(text, text) from public, anon, authenticated;
revoke execute on function public.vault_update_token(uuid, text) from public, anon, authenticated;
revoke execute on function public.vault_read_token(uuid) from public, anon, authenticated;
revoke execute on function public.vault_delete_tokens() from public, anon, authenticated;
grant execute on function public.vault_store_token(text, text) to service_role;
grant execute on function public.vault_update_token(uuid, text) to service_role;
grant execute on function public.vault_read_token(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Publication : verrou et statuts
-- ---------------------------------------------------------------------------

-- Prend les cibles à publier et les verrouille (statut `publishing`) dans la même
-- requête. SKIP LOCKED garantit qu'une cible n'est jamais prise deux fois.
create or replace function public.claim_due_targets(p_limit integer default 10)
returns setof public.post_targets
language sql
security definer
set search_path = ''
as $$
  with due as (
    select t.id
    from public.post_targets t
    where t.status = 'pending'
      and t.next_attempt_at is not null
      and t.next_attempt_at <= now()
      and t.social_account_id is not null
    order by t.next_attempt_at
    limit p_limit
    for update skip locked
  )
  update public.post_targets t
  set status = 'publishing', locked_at = now(), attempts = t.attempts + 1
  from due
  where t.id = due.id
  returning t.*;
$$;

-- Une cible restée `publishing` plus de 15 minutes a peut-être été publiée :
-- on ne la relance jamais automatiquement, on la signale.
create or replace function public.release_stale_targets()
returns integer
language sql
security definer
set search_path = ''
as $$
  with stale as (
    update public.post_targets
    set status = 'failed',
        locked_at = null,
        error_message = 'Publication interrompue sans réponse du réseau. Vérifie sur le réseau si le post est en ligne avant de relancer.'
    where status = 'publishing' and locked_at < now() - interval '15 minutes'
    returning 1
  )
  select count(*)::integer from stale;
$$;

revoke execute on function public.claim_due_targets(integer) from public, anon, authenticated;
revoke execute on function public.release_stale_targets() from public, anon, authenticated;
grant execute on function public.claim_due_targets(integer) to service_role;
grant execute on function public.release_stale_targets() to service_role;

-- Statut du post calculé à partir de ses cibles.
create or replace function public.refresh_post_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid := coalesce(new.post_id, old.post_id);
  v_total integer;
  v_published integer;
  v_failed integer;
  v_publishing integer;
  v_pending integer;
  v_started integer;
  v_status public.post_status;
begin
  select
    count(*),
    count(*) filter (where status = 'published'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'publishing'),
    count(*) filter (where status = 'pending'),
    count(*) filter (where attempts > 0)
  into v_total, v_published, v_failed, v_publishing, v_pending, v_started
  from public.post_targets
  where post_id = v_post_id;

  if v_total = 0 then
    return null;
  end if;

  if v_published = v_total then
    v_status := 'published';
  elsif v_publishing > 0 or (v_pending > 0 and v_started > 0) then
    v_status := 'publishing';
  elsif v_pending > 0 then
    -- Rien n'a encore démarré : on garde brouillon ou programmé.
    return null;
  elsif v_published > 0 then
    v_status := 'partial';
  else
    v_status := 'failed';
  end if;

  update public.posts
  set status = v_status,
      published_at = case when v_status = 'published' then coalesce(published_at, now()) else published_at end,
      updated_at = now()
  where id = v_post_id and status is distinct from v_status;

  return null;
end;
$$;

create trigger post_targets_refresh_post_status
  after insert or update of status, attempts or delete on public.post_targets
  for each row execute function public.refresh_post_status();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Stockage des fichiers (privé, URL signées)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', false, 104857600,
   array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf']),
  ('logos', 'logos', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy storage_admin_select on storage.objects
  for select to authenticated
  using (bucket_id in ('media', 'logos') and (select public.is_admin()));
create policy storage_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id in ('media', 'logos') and (select public.is_admin()));
create policy storage_admin_update on storage.objects
  for update to authenticated
  using (bucket_id in ('media', 'logos') and (select public.is_admin()));
create policy storage_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id in ('media', 'logos') and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Premier business
-- ---------------------------------------------------------------------------

insert into public.businesses (slug, name, description, color, websites, modules, position)
values (
  'cantia',
  'Cantia',
  'Comptabilité et partenaires',
  '#1d1d1f',
  array['https://cantia.ch', 'https://accounting.cantia.ch', 'https://partners.cantia.ch'],
  array['social'],
  0
)
on conflict (slug) do nothing;

-- ===========================================================================
-- 20261025000200_cron.sql
-- ===========================================================================

-- Tâches programmées. Elles lisent deux secrets du Vault :
--   project_url : à créer une fois par projet → select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   cron_secret : généré automatiquement par la migration 20261025000300 (vérifié par les Edge Functions).

create or replace function public.call_edge_function(p_name text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$;

revoke execute on function public.call_edge_function(text) from public, anon, authenticated;

-- Chaque minute : publier ce qui est dû.
select cron.schedule('publish-due', '* * * * *', $$ select public.call_edge_function('publish-due') $$);

-- Chaque jour (UTC) : renouveler les tokens, puis récupérer les statistiques.
select cron.schedule('refresh-tokens', '17 3 * * *', $$ select public.call_edge_function('refresh-tokens') $$);
select cron.schedule('fetch-metrics', '43 4 * * *', $$ select public.call_edge_function('fetch-metrics') $$);

-- ===========================================================================
-- 20261025000300_system_status.sql
-- ===========================================================================

-- Suivi de santé : dernière exécution de chaque tâche automatique, et diagnostic pour la page « État du système ».

create table public.system_heartbeats (
  job text primary key,
  last_run_at timestamptz not null default now(),
  last_ok boolean not null default true,
  last_detail text
);

alter table public.system_heartbeats enable row level security;
create policy system_heartbeats_admin_select on public.system_heartbeats
  for select to authenticated using ((select public.is_admin()));
revoke all on public.system_heartbeats from anon;
revoke insert, update, delete, truncate on public.system_heartbeats from authenticated;

-- Écrit par les Edge Functions (service role) à la fin de chaque passage.
create or replace function public.record_heartbeat(p_job text, p_ok boolean, p_detail text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.system_heartbeats (job, last_run_at, last_ok, last_detail)
  values (p_job, now(), p_ok, p_detail)
  on conflict (job) do update
    set last_run_at = excluded.last_run_at, last_ok = excluded.last_ok, last_detail = excluded.last_detail;
$$;

revoke execute on function public.record_heartbeat(text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_heartbeat(text, boolean, text) to service_role;

-- Diagnostic réservé à l'admin : tâches pg_cron, secrets du Vault présents (oui/non, jamais leur valeur),
-- dernières exécutions pg_cron et nombre d'admins.
create or replace function public.system_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'cron_jobs', coalesce((
      select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active) order by j.jobname)
      from cron.job j
    ), '[]'::jsonb),
    'cron_last_runs', coalesce((
      select jsonb_object_agg(r.jobname, jsonb_build_object('status', r.status, 'at', r.start_time, 'message', left(r.return_message, 200)))
      from (
        select distinct on (j.jobname) j.jobname, d.status, d.start_time, d.return_message
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
        order by j.jobname, d.start_time desc
      ) r
    ), '{}'::jsonb),
    'vault', jsonb_build_object(
      'project_url', exists (select 1 from vault.secrets where name = 'project_url'),
      'cron_secret', exists (select 1 from vault.secrets where name = 'cron_secret')
    ),
    'admins', (select count(*) from public.admins)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.system_status() from public, anon;
grant execute on function public.system_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Secret des tâches automatiques : généré ici, gardé dans le Vault, jamais affiché.
-- pg_cron l'envoie (call_edge_function) et les Edge Functions le vérifient avec check_cron_secret().
-- ---------------------------------------------------------------------------

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret')
where not exists (select 1 from vault.secrets where name = 'cron_secret');

create or replace function public.check_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'cron_secret' and p_secret is not null and decrypted_secret = p_secret
  );
$$;

revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

-- ===========================================================================
-- 20261025000400_data_module.sql
-- ===========================================================================

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

-- ===========================================================================
-- 20261025000500_google_connectors.sql
-- ===========================================================================

-- Connecteurs Google : Search Console et Google Analytics 4, connectés par OAuth (refresh token dans Vault).

alter table public.connectors drop constraint connectors_kind_check;
alter table public.connectors add constraint connectors_kind_check
  check (kind in ('stripe', 'plausible', 'search_console', 'google_analytics'));

-- `pending` : compte Google connecté, mais la propriété (site ou propriété GA4) reste à choisir.
alter table public.connectors drop constraint connectors_status_check;
alter table public.connectors add constraint connectors_status_check
  check (status in ('connected', 'pending', 'error'));

-- Classements du moment (requêtes et pages les plus vues), remplacés à chaque synchronisation.
alter table public.connectors add column snapshot jsonb not null default '{}';

alter table public.oauth_states drop constraint oauth_states_provider_check;
alter table public.oauth_states add constraint oauth_states_provider_check
  check (provider in ('meta', 'linkedin', 'linkedin_page', 'threads', 'google'));

-- Contexte du flux (ex. quel connecteur Google est demandé).
alter table public.oauth_states add column context jsonb not null default '{}';

-- ===========================================================================
-- 20261025000600_keywords.sql
-- ===========================================================================

-- Suivi des mots-clés (Search Console) : historique quotidien par requête, mots-clés suivis, classements comparés.

create table public.search_queries_daily (
  connector_id uuid not null references public.connectors (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  day date not null,
  query text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  position numeric(6, 2) not null,
  primary key (connector_id, day, query)
);

create index on public.search_queries_daily (business_id, query, day);
create index on public.search_queries_daily (business_id, day);

-- Mots-clés que Bastien veut suivre en priorité (toujours récupérés, même hors du top).
create table public.tracked_keywords (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  query text not null check (query = lower(btrim(query)) and length(query) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (business_id, query)
);

alter table public.search_queries_daily enable row level security;
create policy search_queries_daily_admin_select on public.search_queries_daily
  for select to authenticated using ((select public.is_admin()));
revoke all on public.search_queries_daily from anon;
revoke insert, update, delete, truncate on public.search_queries_daily from authenticated;

alter table public.tracked_keywords enable row level security;
create policy tracked_keywords_admin_all on public.tracked_keywords
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.tracked_keywords from anon;

-- Classement des mots-clés d'un business : période de p_days jours finissant au dernier jour livré par Google,
-- comparée à la période précédente de même durée. Position moyenne pondérée par les impressions (comme la Search Console).
-- `trend` : position quotidienne sur les 28 derniers jours livrés (null les jours sans impression).
create or replace function public.keyword_rankings(p_business_id uuid, p_days integer default 7, p_limit integer default 500)
returns table (
  query text,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  "position" numeric,
  prev_clicks bigint,
  prev_impressions bigint,
  prev_position numeric,
  tracked boolean,
  first_seen date,
  trend numeric[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with last_day as (
    select max(day) as d from public.search_queries_daily where business_id = p_business_id
  ),
  cur as (
    select s.query,
      sum(s.clicks) as clicks,
      sum(s.impressions) as impressions,
      sum(s.position * s.impressions) / nullif(sum(s.impressions), 0) as position
    from public.search_queries_daily s, last_day
    where s.business_id = p_business_id and s.day > last_day.d - p_days and s.day <= last_day.d
    group by s.query
  ),
  prev as (
    select s.query,
      sum(s.clicks) as clicks,
      sum(s.impressions) as impressions,
      sum(s.position * s.impressions) / nullif(sum(s.impressions), 0) as position
    from public.search_queries_daily s, last_day
    where s.business_id = p_business_id and s.day > last_day.d - 2 * p_days and s.day <= last_day.d - p_days
    group by s.query
  ),
  tracked as (
    select t.query from public.tracked_keywords t where t.business_id = p_business_id
  ),
  selected as (
    select q.query from (
      select cur.query from cur order by cur.impressions desc limit p_limit
    ) q
    union
    select tracked.query from tracked
  )
  select
    sel.query,
    coalesce(cur.clicks, 0),
    coalesce(cur.impressions, 0),
    case when coalesce(cur.impressions, 0) > 0 then round(cur.clicks::numeric / cur.impressions * 100, 2) end,
    round(cur.position, 1),
    coalesce(prev.clicks, 0),
    coalesce(prev.impressions, 0),
    round(prev.position, 1),
    exists (select 1 from tracked t where t.query = sel.query),
    (select min(s.day) from public.search_queries_daily s where s.business_id = p_business_id and s.query = sel.query),
    (
      select array_agg(round(d.position, 1) order by g.day)
      from last_day,
        generate_series(last_day.d - 27, last_day.d, interval '1 day') as g(day)
        left join lateral (
          select sum(s.position * s.impressions) / nullif(sum(s.impressions), 0) as position
          from public.search_queries_daily s
          where s.business_id = p_business_id and s.query = sel.query and s.day = g.day::date
        ) d on true
    )
  from selected sel
  left join cur on cur.query = sel.query
  left join prev on prev.query = sel.query
  order by coalesce(cur.impressions, 0) desc, sel.query;
$$;

revoke execute on function public.keyword_rankings(uuid, integer, integer) from public, anon;
grant execute on function public.keyword_rankings(uuid, integer, integer) to authenticated;

-- Historique d'un mot-clé (page de détail).
create or replace function public.keyword_history(p_business_id uuid, p_query text, p_days integer default 90)
returns table (day date, clicks bigint, impressions bigint, "position" numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.day,
    sum(s.clicks),
    sum(s.impressions),
    round(sum(s.position * s.impressions) / nullif(sum(s.impressions), 0), 1)
  from public.search_queries_daily s
  where s.business_id = p_business_id
    and s.query = p_query
    and s.day > (select max(day) from public.search_queries_daily where business_id = p_business_id) - p_days
  group by s.day
  order by s.day;
$$;

revoke execute on function public.keyword_history(uuid, text, integer) from public, anon;
grant execute on function public.keyword_history(uuid, text, integer) to authenticated;

-- ===========================================================================
-- 20261025000700_hardening.sql
-- ===========================================================================

-- Durcissement relevé par les contrôles de sécurité de Supabase.

-- Fonction de déclencheur : jamais appelée directement, donc pas exposée par l'API.
revoke execute on function public.refresh_post_status() from public, anon, authenticated;

-- pg_net hors du schéma public (l'extension n'est pas déplaçable : on la recrée, ses fonctions restent dans `net`).
drop extension if exists pg_net;
create extension pg_net with schema extensions;

-- ===========================================================================
-- Configuration du projet
-- ===========================================================================

-- Historique des migrations, pour que `supabase db push` les considère comme appliquées.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261025000000', 'socle'),
  ('20261025000100', 'panel'),
  ('20261025000200', 'cron'),
  ('20261025000300', 'system_status'),
  ('20261025000400', 'data_module'),
  ('20261025000500', 'google_connectors'),
  ('20261025000600', 'keywords'),
  ('20261025000700', 'hardening')
on conflict do nothing;

-- Adresse du projet, lue par pg_cron pour appeler les Edge Functions (pas un secret).
select vault.create_secret('https://cocfslavrraexyavnzmg.supabase.co', 'project_url')
where not exists (select 1 from vault.secrets where name = 'project_url');

-- Accès admin pour bastienryser20004@gmail.com : tout de suite si l'utilisateur existe déjà,
-- sinon dès sa création (Authentication > Users > Add user).
create or replace function public.grant_owner_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) = 'bastienryser20004@gmail.com' then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.grant_owner_admin() from public, anon, authenticated;

drop trigger if exists grant_owner_admin on auth.users;
create trigger grant_owner_admin
  after insert on auth.users
  for each row execute function public.grant_owner_admin();

insert into public.admins (user_id)
select id from auth.users where lower(email) = 'bastienryser20004@gmail.com'
on conflict do nothing;
