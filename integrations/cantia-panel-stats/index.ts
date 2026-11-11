// Fonction déployée sur le projet Supabase de Cantia (pas sur le panel) : `panel-stats`.
// Renvoie au panel bastienryser.space les chiffres de l'application : inscriptions, essais, abonnements,
// activité, visites du site, et la liste des entreprises (nom, formule, statut). Jamais d'e-mail, de téléphone
// ni d'adresse. Lecture seule. Protégée par le secret PANEL_STATS_KEY (en-tête Authorization: Bearer …).
//
// Contrat (version 1), réutilisable par toute autre application :
//   { version, generated_at, daily: [{ day, metric, value }], totals: {...}, organizations: [...] }

import postgres from "npm:postgres@3.4.5";

const TZ = "Europe/Zurich";

function sameSecret(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const key = Deno.env.get("PANEL_STATS_KEY") ?? "";
  const given = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!key || !sameSecret(given, key)) return json({ error: "unauthorized" }, 401);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });
  try {
    const internal = sql`(select id from public.organizations where coalesce(is_internal, false))`;

    // Séries par jour (heure de Zurich). Les comptes internes sont exclus.
    const daily = await sql`
      select day::text, metric, value::float8 as value from (
        select (created_at at time zone ${TZ})::date as day, 'signups' as metric, count(*) as value
          from public.organizations where not coalesce(is_internal, false) group by 1
        union all
        select (created_at at time zone ${TZ})::date, 'users', count(*) from auth.users group by 1
        union all
        select (e.created_at at time zone ${TZ})::date, 'sub_' || e.event_type, count(*)
          from public.organization_subscription_events e where e.organization_id not in ${internal} group by 1, 2
        union all
        select (created_at at time zone ${TZ})::date, 'visits', count(*) from public.site_pageviews group by 1
        union all
        select (created_at at time zone ${TZ})::date, 'visitors', count(distinct visitor_id) from public.site_pageviews group by 1
        union all
        select day, 'active_orgs', count(distinct organization_id) from public.org_usage_days where organization_id not in ${internal} group by 1
        union all
        select day, 'active_users', count(distinct user_id) from public.org_usage_days where organization_id not in ${internal} group by 1
      ) s order by day`;

    // Entreprises : nom, formule et statut, sans coordonnées.
    const organizations = await sql`
      select o.id, o.name, o.trade, o.plan_id as plan, p.name as plan_name, p.price_chf_monthly::float8 as plan_monthly, p.price_chf_yearly::float8 as plan_yearly,
             o.subscription_status as status, coalesce(o.is_complimentary, false) as complimentary, coalesce(o.is_internal, false) as internal,
             o.created_at, o.trial_ends_at, coalesce(o.trial_used, false) as trial_used, coalesce(o.onboarding_completed, false) as onboarded,
             coalesce(o.acquisition_source, o.signup_utm_source) as source, o.promo_code_used is not null as promo,
             (select count(*) from public.organization_members m where m.organization_id = o.id)::int as members,
             (select max(u.day) from public.org_usage_days u where u.organization_id = o.id)::text as last_active,
             (select count(distinct u.day) from public.org_usage_days u where u.organization_id = o.id and u.day > current_date - 30)::int as active_days_30
        from public.organizations o left join public.plans p on p.id = o.plan_id
       order by o.created_at desc`;

    const [newsletter] = await sql`select count(*) filter (where subscribed)::int as subscribed, count(*)::int as total from public.newsletter_subscriptions`;
    const reasons = await sql`select coalesce(reason, 'non précisé') as reason, count(*)::int as n from public.subscription_cancellation_reasons group by 1 order by 2 desc`;
    const [users] = await sql`select count(*)::int as total from auth.users`;

    const real = organizations.filter((o) => !o.internal);
    const count = (f: (o: (typeof real)[number]) => boolean) => real.filter(f).length;
    const byStatus: Record<string, number> = {};
    const byPlan: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const o of real) {
      byStatus[o.status ?? "sans_formule"] = (byStatus[o.status ?? "sans_formule"] ?? 0) + 1;
      if (o.status === "active" && !o.complimentary) byPlan[o.plan ?? "?"] = (byPlan[o.plan ?? "?"] ?? 0) + 1;
      bySource[o.source ?? "inconnue"] = (bySource[o.source ?? "inconnue"] ?? 0) + 1;
    }

    return json({
      version: 1,
      app: "cantia",
      generated_at: new Date().toISOString(),
      daily,
      totals: {
        organizations: real.length,
        users: users.total,
        paying: count((o) => o.status === "active" && !o.complimentary),
        trialing: count((o) => o.status === "trialing"),
        complimentary: count((o) => o.complimentary),
        canceled: count((o) => o.status === "canceled"),
        trial_expired: count((o) => o.status === "trial_expired"),
        no_plan: count((o) => !o.status),
        onboarded: count((o) => o.onboarded),
        active_30d: count((o) => o.active_days_30 > 0),
        by_status: byStatus,
        by_plan: byPlan,
        by_source: bySource,
        newsletter,
        cancellation_reasons: reasons,
      },
      organizations: real.map(({ internal: _internal, ...o }) => o),
    });
  } catch (e) {
    console.error("panel-stats", e);
    return json({ error: "stats_failed" }, 500);
  } finally {
    await sql.end();
  }
});
