-- Suivi des mots-clés (Search Console) : historique quotidien par requête, mots-clés suivis, classements comparés.

create table public.search_queries_daily (
  connector_id uuid not null references public.connectors (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  day date not null,
  query text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  position numeric(6, 2) not null,
  primary key (connector_id, day, query)
);

create index on public.search_queries_daily (business_id, query, day);
create index on public.search_queries_daily (business_id, day);

-- Mots-clés que Bastien veut suivre en priorité (toujours récupérés, même hors du top).
create table public.tracked_keywords (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  query text not null check (query = lower(btrim(query)) and length(query) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (business_id, query)
);

alter table public.search_queries_daily enable row level security;
create policy search_queries_daily_admin_select on public.search_queries_daily
  for select to authenticated using ((select public.is_admin()));
revoke all on public.search_queries_daily from anon;
revoke insert, update, delete, truncate on public.search_queries_daily from authenticated;

alter table public.tracked_keywords enable row level security;
create policy tracked_keywords_admin_all on public.tracked_keywords
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.tracked_keywords from anon;

-- Classement des mots-clés d'un business : période de p_days jours finissant au dernier jour livré par Google,
-- comparée à la période précédente de même durée. Position moyenne pondérée par les impressions (comme la Search Console).
-- `trend` : position quotidienne sur les 28 derniers jours livrés (null les jours sans impression).
create or replace function public.keyword_rankings(p_business_id uuid, p_days integer default 7, p_limit integer default 500)
returns table (
  query text,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  "position" numeric,
  prev_clicks bigint,
  prev_impressions bigint,
  prev_position numeric,
  tracked boolean,
  first_seen date,
  trend numeric[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with last_day as (
    select max(day) as d from public.search_queries_daily where business_id = p_business_id
  ),
  cur as (
    select s.query,
      sum(s.clicks) as clicks,
      sum(s.impressions) as impressions,
      sum(s.position * s.impressions) / nullif(sum(s.impressions), 0) as position
    from public.search_queries_daily s, last_day
    where s.business_id = p_business_id and s.day > last_day.d - p_days and s.day <= last_day.d
    group by s.query
  ),
  prev as (
    select s.query,
      sum(s.clicks) as clicks,
      sum(s.impressions) as impressions,
      sum(s.position * s.impressions) / nullif(sum(s.impressions), 0) as position
    from public.search_queries_daily s, last_day
    where s.business_id = p_business_id and s.day > last_day.d - 2 * p_days and s.day <= last_day.d - p_days
    group by s.query
  ),
  tracked as (
    select t.query from public.tracked_keywords t where t.business_id = p_business_id
  ),
  selected as (
    select q.query from (
      select cur.query from cur order by cur.impressions desc limit p_limit
    ) q
    union
    select tracked.query from tracked
  )
  select
    sel.query,
    coalesce(cur.clicks, 0),
    coalesce(cur.impressions, 0),
    case when coalesce(cur.impressions, 0) > 0 then round(cur.clicks::numeric / cur.impressions * 100, 2) end,
    round(cur.position, 1),
    coalesce(prev.clicks, 0),
    coalesce(prev.impressions, 0),
    round(prev.position, 1),
    exists (select 1 from tracked t where t.query = sel.query),
    (select min(s.day) from public.search_queries_daily s where s.business_id = p_business_id and s.query = sel.query),
    (
      select array_agg(round(d.position, 1) order by g.day)
      from last_day,
        generate_series(last_day.d - 27, last_day.d, interval '1 day') as g(day)
        left join lateral (
          select sum(s.position * s.impressions) / nullif(sum(s.impressions), 0) as position
          from public.search_queries_daily s
          where s.business_id = p_business_id and s.query = sel.query and s.day = g.day::date
        ) d on true
    )
  from selected sel
  left join cur on cur.query = sel.query
  left join prev on prev.query = sel.query
  order by coalesce(cur.impressions, 0) desc, sel.query;
$$;

revoke execute on function public.keyword_rankings(uuid, integer, integer) from public, anon;
grant execute on function public.keyword_rankings(uuid, integer, integer) to authenticated;

-- Historique d'un mot-clé (page de détail).
create or replace function public.keyword_history(p_business_id uuid, p_query text, p_days integer default 90)
returns table (day date, clicks bigint, impressions bigint, "position" numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.day,
    sum(s.clicks),
    sum(s.impressions),
    round(sum(s.position * s.impressions) / nullif(sum(s.impressions), 0), 1)
  from public.search_queries_daily s
  where s.business_id = p_business_id
    and s.query = p_query
    and s.day > (select max(day) from public.search_queries_daily where business_id = p_business_id) - p_days
  group by s.day
  order by s.day;
$$;

revoke execute on function public.keyword_history(uuid, text, integer) from public, anon;
grant execute on function public.keyword_history(uuid, text, integer) to authenticated;
