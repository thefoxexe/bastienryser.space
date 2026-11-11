import "server-only";
import { metricSeries, type SeriesPoint } from "@/lib/metrics";

export type TrafficSourceId = "plausible" | "ga" | "app";

export type TrafficSource = {
  id: TrafficSourceId;
  label: string;
  /** Visiteurs uniques par jour, visites (sessions) et pages vues : null si la source ne les fournit pas. */
  visitors: SeriesPoint[];
  visits: SeriesPoint[] | null;
  pageviews: SeriesPoint[] | null;
  note: string;
};

const SOURCES: { id: TrafficSourceId; label: string; metrics: [string, string, string | null]; note: string }[] = [
  { id: "plausible", label: "Plausible", metrics: ["visitors", "visits", "pageviews"], note: "sans cookies, peu bloqué" },
  { id: "ga", label: "Google Analytics", metrics: ["ga_users", "ga_sessions", "ga_pageviews"], note: "dépend du consentement aux cookies et des bloqueurs" },
  { id: "app", label: "Suivi du site (Supabase)", metrics: ["app_visitors", "app_visits", null], note: "mesure maison du site, robots possibles" },
];

/**
 * Toutes les sources de fréquentation branchées pour un business, chacune à part.
 * Elles mesurent les mêmes visiteurs : on les compare, on ne les additionne jamais.
 */
export async function trafficSources(businessId: string, days: number): Promise<TrafficSource[]> {
  const out = await Promise.all(
    SOURCES.map(async (s) => {
      const [visitors, visits, pageviews] = await Promise.all(
        s.metrics.map((m) => (m ? metricSeries({ businessId, metric: m, days }) : Promise.resolve(null))),
      );
      if (!visitors || !visitors.some((p) => p.value > 0)) return null;
      return { id: s.id, label: s.label, visitors, visits, pageviews, note: s.note } satisfies TrafficSource;
    }),
  );
  return out.filter((s): s is TrafficSource => s !== null);
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
