-- Nouveaux réseaux : YouTube, TikTok, Bluesky, Pinterest et X (Threads devient disponible).

alter type public.social_network add value if not exists 'youtube';
alter type public.social_network add value if not exists 'tiktok';
alter type public.social_network add value if not exists 'bluesky';
alter type public.social_network add value if not exists 'pinterest';
alter type public.social_network add value if not exists 'x';

alter table public.oauth_states drop constraint oauth_states_provider_check;
alter table public.oauth_states add constraint oauth_states_provider_check
  check (provider in ('meta', 'linkedin', 'linkedin_page', 'threads', 'google', 'youtube', 'tiktok', 'pinterest', 'x'));

-- Tableau Pinterest où publier, choisi par l'admin parmi ceux lus à la connexion (meta.boards).
-- Les comptes ne sont pas modifiables directement depuis le navigateur : cette fonction ne touche que ce réglage.
create or replace function public.set_pinterest_board(p_account_id uuid, p_board_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update public.social_accounts
  set meta = jsonb_set(meta, '{board_id}', to_jsonb(p_board_id))
  where id = p_account_id
    and network::text = 'pinterest'
    and exists (select 1 from jsonb_array_elements(coalesce(meta -> 'boards', '[]'::jsonb)) b where b ->> 'id' = p_board_id);
  if not found then
    raise exception 'Tableau inconnu' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.set_pinterest_board(uuid, text) from public, anon;
grant execute on function public.set_pinterest_board(uuid, text) to authenticated;
