-- Veille : filtre par catégorie (lue dans le bandeau de la vidéo) avant retranscription.
alter table public.veille_settings add column if not exists filter text not null default '';
alter table public.veille_items add column if not exists category text;
alter table public.veille_items drop constraint if exists veille_items_status_check;
alter table public.veille_items add constraint veille_items_status_check
  check (status in ('queued', 'seen', 'processing', 'sent', 'failed', 'skipped'));
