-- Taux de change officiels (BCE, via Frankfurter) : valeur d'une unité de devise en francs suisses, jour ouvré par jour ouvré.
-- Remplis par l'Edge Function `sync-connectors` ; servent à additionner les encaissements de tous les business en CHF.

create table public.fx_rates (
  day date not null,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  chf numeric not null check (chf > 0),
  primary key (currency, day)
);

alter table public.fx_rates enable row level security;
create policy fx_rates_admin_select on public.fx_rates
  for select to authenticated using ((select public.is_admin()));
revoke all on public.fx_rates from anon;
revoke insert, update, delete, truncate on public.fx_rates from authenticated;
