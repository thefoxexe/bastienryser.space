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
