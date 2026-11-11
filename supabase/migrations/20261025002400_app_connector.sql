-- Connecteur « Application » : statistiques d'une application maison (ex. Cantia), lues sur sa fonction `panel-stats`
-- avec une clé secrète (Vault). Séries quotidiennes dans metric_points (métriques app_*), totaux et entreprises dans snapshot.
alter table public.connectors drop constraint connectors_kind_check;
alter table public.connectors add constraint connectors_kind_check
  check (kind in ('stripe', 'plausible', 'search_console', 'google_analytics', 'whop', 'app'));
