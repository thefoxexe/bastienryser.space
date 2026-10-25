-- Connecteurs Google : Search Console et Google Analytics 4, connectés par OAuth (refresh token dans Vault).

alter table public.connectors drop constraint connectors_kind_check;
alter table public.connectors add constraint connectors_kind_check
  check (kind in ('stripe', 'plausible', 'search_console', 'google_analytics'));

-- `pending` : compte Google connecté, mais la propriété (site ou propriété GA4) reste à choisir.
alter table public.connectors drop constraint connectors_status_check;
alter table public.connectors add constraint connectors_status_check
  check (status in ('connected', 'pending', 'error'));

-- Classements du moment (requêtes et pages les plus vues), remplacés à chaque synchronisation.
alter table public.connectors add column snapshot jsonb not null default '{}';

alter table public.oauth_states drop constraint oauth_states_provider_check;
alter table public.oauth_states add constraint oauth_states_provider_check
  check (provider in ('meta', 'linkedin', 'linkedin_page', 'threads', 'google'));

-- Contexte du flux (ex. quel connecteur Google est demandé).
alter table public.oauth_states add column context jsonb not null default '{}';
