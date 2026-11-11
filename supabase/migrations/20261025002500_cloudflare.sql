-- Cloudflare Web Analytics : visites et pages vues sans cookies (jeton d'API en lecture dans Vault).
-- Remplace Plausible dans l'interface ; l'ancien type reste accepté pour ne rien casser.
alter table public.connectors drop constraint connectors_kind_check;
alter table public.connectors add constraint connectors_kind_check
  check (kind in ('stripe', 'plausible', 'search_console', 'google_analytics', 'whop', 'app', 'cloudflare'));
