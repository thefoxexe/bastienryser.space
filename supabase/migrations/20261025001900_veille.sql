-- Veille : des comptes TikTok surveillés, chaque nouvelle vidéo retranscrite (Whisper), expliquée (Claude)
-- puis envoyée dans un groupe ou un canal Telegram. La détection et le téléchargement tournent dans
-- GitHub Actions (yt-dlp), le traitement dans l'Edge Function `veille`. Le jeton du bot reste dans Vault.

create table public.veille_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  telegram_ref uuid,
  bot_username text,
  chat_id text,
  chat_title text,
  thread_id integer,
  instructions text not null default '',
  disclaimer boolean not null default true,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.veille_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  platform text not null default 'tiktok' check (platform in ('tiktok')),
  handle text not null check (handle ~ '^[A-Za-z0-9._]{2,40}$'),
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (business_id, platform, handle)
);

create table public.veille_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  source_id uuid references public.veille_sources (id) on delete set null,
  external_id text,
  url text not null,
  title text,
  posted_at timestamptz,
  -- queued : lien ajouté à la main, en attente ; seen : vidéo déjà là au démarrage de la veille (non envoyée).
  status text not null default 'processing' check (status in ('queued', 'seen', 'processing', 'sent', 'failed')),
  transcript text,
  message text,
  error text,
  telegram_message_id bigint,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (business_id, external_id)
);

-- Tâche GitHub : référence Vault de sa clé d'accès et état du dernier passage (une seule ligne).
create table public.veille_runner (
  id boolean primary key default true check (id),
  secret_ref uuid,
  last_run_at timestamptz,
  last_ok boolean,
  last_detail text
);

create index on public.veille_items (business_id, created_at desc);
create index on public.veille_items (status) where status in ('queued', 'failed');

do $$
declare
  t text;
begin
  foreach t in array array['veille_settings', 'veille_sources', 'veille_items', 'veille_runner'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t || '_admin_all', t
    );
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
