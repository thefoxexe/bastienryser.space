-- Assistant IA : brief du jour mis en cache (un par business et par jour, plus un pour l'accueil).

create table public.ai_briefs (
  id uuid primary key default gen_random_uuid(),
  -- null : brief de l'accueil, tous business réunis.
  business_id uuid references public.businesses (id) on delete cascade,
  day date not null,
  content text not null,
  created_at timestamptz not null default now()
);

create unique index ai_briefs_scope_day on public.ai_briefs (coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid), day);

alter table public.ai_briefs enable row level security;
create policy ai_briefs_admin_all on public.ai_briefs
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.ai_briefs from anon;
