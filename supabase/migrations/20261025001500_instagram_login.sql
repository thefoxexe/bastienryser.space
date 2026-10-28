-- Connexion Instagram directe (sans Page Facebook) : nouveau fournisseur OAuth.
alter table public.oauth_states drop constraint oauth_states_provider_check;
alter table public.oauth_states add constraint oauth_states_provider_check
  check (provider in ('meta', 'instagram', 'linkedin', 'linkedin_page', 'threads', 'google', 'youtube', 'tiktok', 'pinterest', 'x'));
