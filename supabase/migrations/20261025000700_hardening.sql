-- Durcissement relevé par les contrôles de sécurité de Supabase.

-- Fonction de déclencheur : jamais appelée directement, donc pas exposée par l'API.
revoke execute on function public.refresh_post_status() from public, anon, authenticated;

-- pg_net hors du schéma public (l'extension n'est pas déplaçable : on la recrée, ses fonctions restent dans `net`).
drop extension if exists pg_net;
create extension pg_net with schema extensions;
