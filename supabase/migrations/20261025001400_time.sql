-- Pointage des heures par projet : chrono (une seule session en cours à la fois) ou saisie manuelle.

alter table public.projects add column hourly_rate numeric(10, 2) check (hourly_rate is null or hourly_rate >= 0);

create table public.project_time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.project_tasks (id) on delete set null,
  started_at timestamptz not null,
  -- null : chrono en cours.
  ended_at timestamptz check (ended_at is null or ended_at >= started_at),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now()
);
create index on public.project_time_entries (project_id, started_at desc);
-- Un seul chrono en cours, tous projets confondus.
create unique index project_time_entries_one_running on public.project_time_entries ((true)) where ended_at is null;

alter table public.project_time_entries enable row level security;
create policy project_time_entries_admin_all on public.project_time_entries
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.project_time_entries from anon;
