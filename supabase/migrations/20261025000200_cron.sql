-- Tâches programmées. Elles lisent deux secrets du Vault, à créer une fois :
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<une longue valeur aléatoire>', 'cron_secret');
-- La même valeur de cron_secret doit être mise dans les secrets des Edge Functions (CRON_SECRET).

create or replace function public.call_edge_function(p_name text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$;

revoke execute on function public.call_edge_function(text) from public, anon, authenticated;

-- Chaque minute : publier ce qui est dû.
select cron.schedule('publish-due', '* * * * *', $$ select public.call_edge_function('publish-due') $$);

-- Chaque jour (UTC) : renouveler les tokens, puis récupérer les statistiques.
select cron.schedule('refresh-tokens', '17 3 * * *', $$ select public.call_edge_function('refresh-tokens') $$);
select cron.schedule('fetch-metrics', '43 4 * * *', $$ select public.call_edge_function('fetch-metrics') $$);
