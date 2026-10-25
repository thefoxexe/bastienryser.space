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
