-- Cibles sans compte (compte supprimé lors d'une reconnexion) : elles restaient `pending` pour toujours
-- et le post affichait « En cours ». Désormais :
-- 1. un compte reconnecté reprend les cibles orphelines du même business et du même réseau ;
-- 2. une cible orpheline arrivée à échéance est prise quand même et passe en `failed` avec un message clair.

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

create or replace function public.adopt_orphan_targets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.post_targets t
  set social_account_id = new.id
  from public.posts p
  where p.id = t.post_id
    and p.business_id = new.business_id
    and t.network = new.network
    and t.social_account_id is null
    and t.status in ('pending', 'failed');
  return null;
end;
$$;

revoke execute on function public.adopt_orphan_targets() from public, anon, authenticated;

drop trigger if exists social_accounts_adopt_orphans on public.social_accounts;
create trigger social_accounts_adopt_orphans
  after insert on public.social_accounts
  for each row execute function public.adopt_orphan_targets();
