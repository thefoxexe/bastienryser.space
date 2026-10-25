-- Suivi de santé : dernière exécution de chaque tâche automatique, et diagnostic pour la page « État du système ».

create table public.system_heartbeats (
  job text primary key,
  last_run_at timestamptz not null default now(),
  last_ok boolean not null default true,
  last_detail text
);

alter table public.system_heartbeats enable row level security;
create policy system_heartbeats_admin_select on public.system_heartbeats
  for select to authenticated using ((select public.is_admin()));
revoke all on public.system_heartbeats from anon;
revoke insert, update, delete, truncate on public.system_heartbeats from authenticated;

-- Écrit par les Edge Functions (service role) à la fin de chaque passage.
create or replace function public.record_heartbeat(p_job text, p_ok boolean, p_detail text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.system_heartbeats (job, last_run_at, last_ok, last_detail)
  values (p_job, now(), p_ok, p_detail)
  on conflict (job) do update
    set last_run_at = excluded.last_run_at, last_ok = excluded.last_ok, last_detail = excluded.last_detail;
$$;

revoke execute on function public.record_heartbeat(text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_heartbeat(text, boolean, text) to service_role;

-- Diagnostic réservé à l'admin : tâches pg_cron, secrets du Vault présents (oui/non, jamais leur valeur),
-- dernières exécutions pg_cron et nombre d'admins.
create or replace function public.system_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'cron_jobs', coalesce((
      select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active) order by j.jobname)
      from cron.job j
    ), '[]'::jsonb),
    'cron_last_runs', coalesce((
      select jsonb_object_agg(r.jobname, jsonb_build_object('status', r.status, 'at', r.start_time, 'message', left(r.return_message, 200)))
      from (
        select distinct on (j.jobname) j.jobname, d.status, d.start_time, d.return_message
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
        order by j.jobname, d.start_time desc
      ) r
    ), '{}'::jsonb),
    'vault', jsonb_build_object(
      'project_url', exists (select 1 from vault.secrets where name = 'project_url'),
      'cron_secret', exists (select 1 from vault.secrets where name = 'cron_secret')
    ),
    'admins', (select count(*) from public.admins)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.system_status() from public, anon;
grant execute on function public.system_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Secret des tâches automatiques : généré ici, gardé dans le Vault, jamais affiché.
-- pg_cron l'envoie (call_edge_function) et les Edge Functions le vérifient avec check_cron_secret().
-- ---------------------------------------------------------------------------

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret')
where not exists (select 1 from vault.secrets where name = 'cron_secret');

create or replace function public.check_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'cron_secret' and p_secret is not null and decrypted_secret = p_secret
  );
$$;

revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;
