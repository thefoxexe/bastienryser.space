import "server-only";
import { metricSeries, type SeriesPoint } from "@/lib/metrics";

export type TrafficSourceId = "cloudflare" | "ga";

export type TrafficSource = {
  id: TrafficSourceId;
  label: string;
  /** Visites par jour : la mesure que les deux outils ont en commun, celle qu'on compare. */
  visits: SeriesPoint[];
  pageviews: SeriesPoint[] | null;
  /** Visiteurs uniques : Google Analytics seulement (Cloudflare, sans cookies, ne reconnaît pas un visiteur qui revient). */
  visitors: SeriesPoint[] | null;
  note: string;
};

// Seuls Cloudflare et Google Analytics comptent la fréquentation : le suivi maison des applications (Supabase) compte aussi les robots.
const SOURCES: { id: TrafficSourceId; label: string; visits: string; pageviews: string; visitors: string | null; note: string }[] = [
  { id: "cloudflare", label: "Cloudflare", visits: "cf_visits", pageviews: "cf_pageviews", visitors: null, note: "sans cookies, robots écartés" },
  { id: "ga", label: "Google Analytics", visits: "ga_sessions", pageviews: "ga_pageviews", visitors: "ga_users", note: "perd les visiteurs qui refusent les cookies" },
];

/**
 * Les sources de fréquentation branchées pour un business, chacune à part.
 * Elles mesurent les mêmes visites : on les compare, on ne les additionne jamais.
 */
export async function trafficSources(businessId: string, days: number): Promise<TrafficSource[]> {
  const out = await Promise.all(
    SOURCES.map(async (s) => {
      const [visits, pageviews, visitors] = await Promise.all([
        metricSeries({ businessId, metric: s.visits, days }),
        metricSeries({ businessId, metric: s.pageviews, days }),
        s.visitors ? metricSeries({ businessId, metric: s.visitors, days }) : Promise.resolve(null),
      ]);
      if (!visits || !visits.some((p) => p.value > 0)) return null;
      return { id: s.id, label: s.label, visits, pageviews, visitors, note: s.note } satisfies TrafficSource;
    }),
  );
  return out.filter((s): s is TrafficSource => s !== null);
}

/** Visites par jour d'un business : Cloudflare, sinon Google Analytics (jamais les deux). */
export async function visitSeries(businessId: string, days: number) {
  return (await metricSeries({ businessId, metric: "cf_visits", days })) ?? (await metricSeries({ businessId, metric: "ga_sessions", days }));
}

/** Jours où les deux sources ont mesuré quelque chose : la comparaison n'a de sens que là. */
export function overlap(a: SeriesPoint[], b: SeriesPoint[]) {
  const bm = new Map(b.map((p) => [p.day, p.value]));
  let sa = 0;
  let sb = 0;
  let n = 0;
  for (const p of a) {
    const v = bm.get(p.day);
    if (v === undefined || p.value <= 0 || v <= 0) continue;
    sa += p.value;
    sb += v;
    n++;
  }
  return { days: n, a: sa, b: sb };
}
