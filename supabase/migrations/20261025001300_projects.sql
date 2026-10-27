-- Chantiers : projets internes d'un business (ex. un site client chez WebAlp), avec tâches, pièces jointes
-- et écritures de finances liées (factures, charges).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  client text check (client is null or length(client) <= 120),
  url text check (url is null or length(url) <= 300),
  description text check (description is null or length(description) <= 4000),
  status text not null default 'active' check (status in ('active', 'paused', 'done')),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.projects (business_id, status);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  notes text check (notes is null or length(notes) <= 4000),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date,
  position integer not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.project_tasks (project_id, status, position);

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null unique,
  name text not null check (length(name) between 1 and 200),
  size bigint not null default 0,
  mime text,
  created_at timestamptz not null default now()
);
create index on public.project_files (project_id);

-- Une écriture (facture encaissée, charge) peut appartenir à un chantier.
alter table public.ledger_entries add column project_id uuid references public.projects (id) on delete set null;
create index on public.ledger_entries (project_id);

alter table public.projects enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_files enable row level security;
create policy projects_admin_all on public.projects for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy project_tasks_admin_all on public.project_tasks for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy project_files_admin_all on public.project_files for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.projects, public.project_tasks, public.project_files from anon;

-- Pièces jointes : bucket privé, accès admin uniquement (téléchargement par URL signée).
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 52428800)
on conflict (id) do nothing;

create policy project_files_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and (select public.is_admin()));
create policy project_files_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and (select public.is_admin()));
create policy project_files_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and (select public.is_admin()));

-- Module activé pour les business existants.
update public.businesses set modules = array_append(modules, 'projects') where not ('projects' = any (modules));
