-- Jalons : ce qui a été changé un jour donné (SEO, contenu, technique, campagne),
-- affichés comme repères sur les graphiques pour juger l'effet avant / après.
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  day date not null,
  title text not null check (char_length(title) between 1 and 120),
  note text check (note is null or char_length(note) <= 2000),
  kind text not null default 'seo' check (kind in ('seo', 'contenu', 'technique', 'campagne', 'autre')),
  created_at timestamptz not null default now()
);

create index on public.milestones (business_id, day);

alter table public.milestones enable row level security;
create policy milestones_admin_all on public.milestones
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.milestones from anon;
