-- Mémoire de l'assistant : ce qu'il sait d'un business (offre, clients, objectifs…) ou de Bastien en général.

create table public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  -- null : valable pour tous les business.
  business_id uuid references public.businesses (id) on delete cascade,
  content text not null check (length(btrim(content)) between 1 and 600),
  created_at timestamptz not null default now()
);

create index on public.ai_memories (business_id, created_at);

alter table public.ai_memories enable row level security;
create policy ai_memories_admin_all on public.ai_memories
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.ai_memories from anon;
