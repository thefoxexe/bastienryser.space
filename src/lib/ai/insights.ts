import "server-only";
import { listAlerts } from "@/lib/alerts";
import { metricsLast30Days } from "@/lib/data";
import { financeSummary } from "@/lib/finance";
import { lastDays, listConnectors, siteStatuses } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";
import { NETWORKS } from "@/lib/social/networks";
import type { Business } from "@/lib/types";

/**
 * Ce que l'IA reçoit : uniquement des chiffres lus dans la base (jamais d'estimation),
 * comparés à la période précédente, plus des signaux calculés ici de façon déterministe.
 * Claude explique et hiérarchise ; il ne fabrique aucun chiffre.
 */
export type Digest = {
  business: { name: string; slug: string; websites: string[] };
  period_days: number;
  visits: { source: string; visitors: number; previous: number } | null;
  search: {
    clicks: number;
    previous_clicks: number;
    impressions: number;
    previous_impressions: number;
    position: number | null;
    previous_position: number | null;
    /** Position moyenne par jour, 14 derniers jours livrés par Google. */
    daily_position: { day: string; position: number | null; impressions: number }[];
    last_day_available: string | null;
    top_queries: QueryMove[];
    biggest_drops: QueryMove[];
    biggest_gains: QueryMove[];
    new_queries: QueryMove[];
  } | null;
  finance: { currency: string; income: number; expenses: number; net: number; refunds: number } | null;
  social: { network: string; posts: number; reach: number | null; followers: number | null }[];
  signals: string[];
};

type QueryMove = { query: string; clicks: number; impressions: number; position: number; previous_position: number | null };

type Biz = Pick<Business, "id" | "slug" | "name" | "websites">;

const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);

async function seriesSum(businessId: string, metrics: string[], from: string, to: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("metric_points").select("metric,day,value").eq("business_id", businessId).in("metric", metrics).gte("day", from).lte("day", to);
  return (data ?? []).map((p) => ({ metric: p.metric as string, day: p.day as string, value: Number(p.value) }));
}

/** Requêtes Search Console : période actuelle contre période précédente de même durée. */
async function queryMoves(businessId: string, from: string, to: string, prevFrom: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("search_queries_daily")
    .select("day,query,clicks,impressions,position")
    .eq("business_id", businessId)
    .gte("day", prevFrom)
    .lte("day", to)
    .limit(20000);
  const acc = new Map<string, { c: number; i: number; pw: number; pi: number; ppw: number }>();
  for (const r of data ?? []) {
    const a = acc.get(r.query) ?? { c: 0, i: 0, pw: 0, pi: 0, ppw: 0 };
    const imp = Number(r.impressions);
    if (r.day >= from) {
      a.c += Number(r.clicks);
      a.i += imp;
      a.pw += Number(r.position) * imp;
    } else {
      a.pi += imp;
      a.ppw += Number(r.position) * imp;
    }
    acc.set(r.query, a);
  }
  const rows: QueryMove[] = [...acc.entries()]
    .filter(([, a]) => a.i > 0)
    .map(([query, a]) => ({ query, clicks: a.c, impressions: a.i, position: round1(a.pw / a.i), previous_position: a.pi ? round1(a.ppw / a.pi) : null }));
  const compared = rows.filter((r) => r.previous_position !== null && r.impressions >= 3);
  const delta = (r: QueryMove) => r.position - (r.previous_position ?? r.position);
  return {
    top: [...rows].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 12),
    drops: compared.filter((r) => delta(r) >= 3).sort((a, b) => delta(b) - delta(a)).slice(0, 8),
    gains: compared.filter((r) => delta(r) <= -3).sort((a, b) => delta(a) - delta(b)).slice(0, 8),
    fresh: rows.filter((r) => r.previous_position === null).sort((a, b) => b.impressions - a.impressions).slice(0, 8),
  };
}

export async function businessDigest(business: Biz, period = 28): Promise<Digest> {
  const days = lastDays(period * 2);
  const prevFrom = days[0];
  const from = days[period];
  const to = days[days.length - 1];
  const signals: string[] = [];

  const [connectors, points, finance, alerts, sites, social] = await Promise.all([
    listConnectors(business.id),
    seriesSum(business.id, ["visitors", "ga_users", "search_clicks", "search_impressions", "search_position"], prevFrom, to),
    financeSummary(business.id, period),
    listAlerts(),
    siteStatuses([{ id: business.id, websites: business.websites }], business.id),
    metricsLast30Days(business.id),
  ]);
  const has = (kind: string) => connectors.find((c) => c.kind === kind);
  const sum = (metric: string, a: string, b: string) => points.filter((p) => p.metric === metric && p.day >= a && p.day <= b).reduce((s, p) => s + p.value, 0);
  const before = days[period - 1];

  for (const c of connectors) {
    if (c.status === "error") signals.push(`Le connecteur ${c.label} est en erreur : ${c.last_error ?? "sans message"}.`);
  }

  // Visites : Plausible s'il est branché, sinon Google Analytics (jamais additionnés).
  let visits: Digest["visits"] = null;
  const plausible = has("plausible");
  const ga = has("google_analytics");
  if (plausible || ga) {
    const metric = plausible ? "visitors" : "ga_users";
    visits = { source: plausible ? "Plausible" : "Google Analytics", visitors: sum(metric, from, to), previous: sum(metric, prevFrom, before) };
    if (ga && !plausible && visits.visitors === 0 && visits.previous === 0) {
      const property = ga.config.options?.find((o) => o.value === ga.config.property_id)?.label ?? ga.config.property_id ?? "inconnue";
      signals.push(
        `Google Analytics est connecté mais n'a compté aucune visite en ${period * 2} jours. La propriété choisie (« ${property} ») n'est probablement pas celle du site : la changer dans Données › Connecteurs.`,
      );
    }
    const change = pct(visits.visitors, visits.previous);
    if (change !== null && change <= -30 && visits.previous >= 20) signals.push(`Les visiteurs baissent de ${-change} % par rapport aux ${period} jours précédents.`);
  }

  // Recherche Google.
  let search: Digest["search"] = null;
  if (has("search_console")) {
    const delivered = points.filter((p) => p.metric === "search_impressions").map((p) => p.day).sort();
    const lastDay = delivered[delivered.length - 1] ?? null;
    const weighted = (a: string, b: string) => {
      const imp = new Map(points.filter((p) => p.metric === "search_impressions" && p.day >= a && p.day <= b).map((p) => [p.day, p.value]));
      let w = 0;
      let t = 0;
      for (const p of points) {
        if (p.metric !== "search_position" || p.day < a || p.day > b) continue;
        w += p.value * (imp.get(p.day) ?? 0);
        t += imp.get(p.day) ?? 0;
      }
      return t ? round1(w / t) : null;
    };
    const moves = await queryMoves(business.id, from, to, prevFrom);
    const recent = days.slice(-17, -3);
    search = {
      clicks: sum("search_clicks", from, to),
      previous_clicks: sum("search_clicks", prevFrom, before),
      impressions: sum("search_impressions", from, to),
      previous_impressions: sum("search_impressions", prevFrom, before),
      position: weighted(from, to),
      previous_position: weighted(prevFrom, before),
      daily_position: recent.map((day) => {
        const pos = points.find((p) => p.metric === "search_position" && p.day === day);
        const imp = points.find((p) => p.metric === "search_impressions" && p.day === day);
        return { day, position: pos && imp?.value ? round1(pos.value) : null, impressions: imp?.value ?? 0 };
      }),
      last_day_available: lastDay,
      top_queries: moves.top,
      biggest_drops: moves.drops,
      biggest_gains: moves.gains,
      new_queries: moves.fresh,
    };
    if (search.position !== null && search.previous_position !== null && search.position - search.previous_position >= 3) {
      signals.push(`La position moyenne Google passe de ${search.previous_position} à ${search.position} (plus haut = moins bien).`);
    }
    const clicksChange = pct(search.clicks, search.previous_clicks);
    if (clicksChange !== null && clicksChange <= -30 && search.previous_clicks >= 10) signals.push(`Les clics Google baissent de ${-clicksChange} %.`);
  }

  // Sites, publications, comptes.
  for (const s of sites) {
    if (s.last && !s.last.ok) signals.push(`Le site ${s.host} ne répond pas (${s.last.error ?? `code ${s.last.status_code}`}).`);
    else if (s.uptime30d !== null && s.uptime30d < 99) signals.push(`Le site ${s.host} n'a été disponible que ${round1(s.uptime30d)} % du temps sur 30 jours.`);
  }
  for (const a of alerts.filter((x) => x.business_id === business.id)) {
    if (a.kind === "failed_post") signals.push(`La publication « ${a.title} » a échoué sur ${NETWORKS[a.network].label} : ${a.message ?? "sans message"}.`);
    else signals.push(`Le compte ${NETWORKS[a.account.network].label} « ${a.account.display_name} » est ${a.account.status === "expired" ? "expiré" : a.account.status === "error" ? "en erreur" : "bientôt expiré"} : le reconnecter.`);
  }

  const hasMoney = finance.hasStripe || finance.hasEntries;
  if (hasMoney && finance.totals.net < 0) signals.push(`Le résultat des ${period} derniers jours est négatif.`);

  return {
    business: { name: business.name, slug: business.slug, websites: business.websites },
    period_days: period,
    visits,
    search,
    finance: hasMoney
      ? { currency: finance.currency.toUpperCase(), income: finance.totals.income, expenses: finance.totals.expenses, net: finance.totals.net, refunds: finance.totals.refunds }
      : null,
    social: social.map((m) => ({ network: NETWORKS[m.network].label, posts: m.posts, reach: m.reach, followers: m.followers })),
    signals,
  };
}

export const DIGEST_GUIDE = `Repères pour lire ces données :
- Search Console : « clics » = visites venues de Google. Les visites (Analytics ou Plausible) comptent toutes les sources : Google, accès direct, réseaux, liens. Un clic Google devient donc une visite, mais une visite ne vient pas forcément de Google, et les deux outils mesurent différemment (bloqueurs de pub, consentement aux cookies).
- Position moyenne : 1 = premier résultat, plus le chiffre est élevé, moins bien c'est. C'est une moyenne pondérée par les impressions : quand le site commence à apparaître pour de nouvelles requêtes loin dans les résultats (page 4 ou 5), la moyenne grimpe même si les requêtes principales n'ont pas bougé. Regarder biggest_drops et new_queries avant de conclure à une chute.
- Google livre les chiffres avec 2 à 3 jours de retard, et les derniers jours livrés sont souvent incomplets (peu d'impressions) : une moyenne calculée sur peu d'impressions est peu fiable.
- Impressions = nombre de fois où le site est apparu dans les résultats, même sans être vu en haut de page.`;
