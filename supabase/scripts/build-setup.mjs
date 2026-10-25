// Assemble supabase/setup.sql : toutes les migrations dans l'ordre, puis la configuration du projet.
// Usage : npm run setup:sql (à relancer après chaque nouvelle migration).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const PROJECT_URL = "https://cocfslavrraexyavnzmg.supabase.co";
const ADMIN_EMAIL = "bastienryser20004@gmail.com";

const migrations = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
const parts = [
  `-- Installation complète de bastienryser.space (généré par supabase/scripts/build-setup.mjs, ne pas modifier à la main).
-- À coller en une fois dans Supabase > SQL Editor > New query, puis Run, sur un projet neuf.
-- Contient ${migrations.length} migrations, l'adresse du projet pour les tâches automatiques et l'accès admin.
`,
  ...migrations.map((f) => `\n-- ===========================================================================\n-- ${f}\n-- ===========================================================================\n\n${readFileSync(join(root, "migrations", f), "utf8").trim()}\n`),
  `
-- ===========================================================================
-- Configuration du projet
-- ===========================================================================

-- Historique des migrations, pour que \`supabase db push\` les considère comme appliquées.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
${migrations.map((f) => { const [v, ...n] = f.replace(/\.sql$/, "").split("_"); return `  ('${v}', '${n.join("_")}')`; }).join(",\n")}
on conflict do nothing;

-- Adresse du projet, lue par pg_cron pour appeler les Edge Functions (pas un secret).
select vault.create_secret('${PROJECT_URL}', 'project_url')
where not exists (select 1 from vault.secrets where name = 'project_url');

-- Accès admin pour ${ADMIN_EMAIL} : tout de suite si l'utilisateur existe déjà,
-- sinon dès sa création (Authentication > Users > Add user).
create or replace function public.grant_owner_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) = '${ADMIN_EMAIL}' then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.grant_owner_admin() from public, anon, authenticated;

drop trigger if exists grant_owner_admin on auth.users;
create trigger grant_owner_admin
  after insert on auth.users
  for each row execute function public.grant_owner_admin();

insert into public.admins (user_id)
select id from auth.users where lower(email) = '${ADMIN_EMAIL}'
on conflict do nothing;
`,
];
writeFileSync(join(root, "setup.sql"), parts.join(""));
console.log(`supabase/setup.sql : ${migrations.length} migrations`);
