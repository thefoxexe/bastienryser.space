-- Vidéos : durée, couverture choisie (image extraite ou fichier importé) et reprise du traitement Instagram.
alter table public.post_media add column if not exists duration_ms integer;
alter table public.post_media add column if not exists cover_ms integer;
alter table public.post_media add column if not exists cover_path text;

-- Conteneur Instagram déjà créé : un nouvel essai reprend son traitement au lieu de renvoyer la vidéo.
alter table public.post_targets add column if not exists container_id text;
