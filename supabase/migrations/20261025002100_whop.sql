-- Whop : paiements encaissés (clé d'API d'entreprise dans Vault, lue par l'Edge Function `connectors`).

alter table public.connectors drop constraint connectors_kind_check;
alter table public.connectors add constraint connectors_kind_check
  check (kind in ('stripe', 'plausible', 'search_console', 'google_analytics', 'whop'));
