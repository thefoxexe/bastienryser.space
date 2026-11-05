import "server-only";
import { createClient } from "@/lib/supabase/server";
import { all, fxLookup } from "@/lib/cash";
import { lastDays, listConnectors } from "@/lib/metrics";
import type { MrrPoint } from "@/components/charts/mrr-chart";
import type { Business } from "@/lib/types";

export type MrrSource = {
  connectorId: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  kind: "stripe" | "whop";
  /** En CHF, au dernier taux BCE connu. */
  monthly: number;
  split: number;
  subscribersMonthly: number | null;
  subscribersSplit: number | null;
  canceling: number | null;
  /** Montants dans leur devise d'origine, pour vérification. */
  native: { currency: string; monthly: number; split: number }[];
  error: string | null;
  historyError: string | null;
  at: string | null;
};

export type MrrDetail = { sources: MrrSource[]; monthly: number; split: number; history: MrrPoint[] };

const round = (v: number) => Math.round(v * 100) / 100;

/** MRR de tous les business : part facturée chaque mois, part payée d'avance répartie, et leur historique relevé jour après jour. */
export async function mrrDetail(businesses: Business[]): Promise<MrrDetail> {
  const connectors = (await listConnectors()).filter((c) => c.kind === "stripe" || c.kind === "whop");
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const supabase = await createClient();
  const points = await all<{ connector_id: string; metric: string; day: string; unit: string; value: number }>((a, b) =>
    supabase.from("metric_points").select("connector_id,metric,day,unit,value").in("metric", ["mrr_monthly", "mrr_split"]).order("day").range(a, b),
  );
  const currencies = [...new Set([...points.map((p) => p.unit), ...connectors.flatMap((c) => Object.keys(c.snapshot.mrr ?? {}))])];
  const first = points[0]?.day ?? lastDays(1)[0];
  const { rateOn } = await fxLookup(currencies, first);
  const today = lastDays(1)[0];
  const now = (cur: string) => rateOn(cur, today) ?? 0;

  const sources: MrrSource[] = connectors
    .filter((c) => byId.has(c.business_id))
    .map((c) => {
      const s = c.snapshot;
      const cur = [...new Set([...Object.keys(s.mrr_monthly ?? {}), ...Object.keys(s.mrr_split ?? {})])];
      const b = byId.get(c.business_id)!;
      return {
        connectorId: c.id,
        businessId: b.id,
        businessName: b.name,
        businessSlug: b.slug,
        kind: c.kind as "stripe" | "whop",
        monthly: round(cur.reduce((a, k) => a + (s.mrr_monthly?.[k] ?? 0) * now(k), 0)),
        split: round(cur.reduce((a, k) => a + (s.mrr_split?.[k] ?? 0) * now(k), 0)),
        subscribersMonthly: s.subscribers_monthly ?? null,
        subscribersSplit: s.subscribers_split ?? null,
        canceling: s.canceling ?? null,
        native: cur.map((k) => ({ currency: k, monthly: s.mrr_monthly?.[k] ?? 0, split: s.mrr_split?.[k] ?? 0 })),
        error: s.mrr_error ?? null,
        historyError: s.mrr_history_error ?? null,
        at: s.computed_at ?? null,
      };
    });

  // Historique : chaque relevé converti au taux de son jour ; un jour sans relevé reprend le dernier connu de la source.
  const perConnector = new Map<string, Map<string, { monthly: number; split: number }>>();
  for (const p of points) {
    const rate = rateOn(p.unit, p.day);
    if (rate === null) continue;
    if (!perConnector.has(p.connector_id)) perConnector.set(p.connector_id, new Map());
    const m = perConnector.get(p.connector_id)!;
    const v = m.get(p.day) ?? { monthly: 0, split: 0 };
    if (p.metric === "mrr_monthly") v.monthly += Number(p.value) * rate;
    else v.split += Number(p.value) * rate;
    m.set(p.day, v);
  }
  const history: MrrPoint[] = [];
  if (points.length) {
    const span = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86400_000) + 1;
    const days = lastDays(Math.max(1, span));
    const lastSeen = new Map<string, { monthly: number; split: number }>();
    for (const day of days) {
      let monthly = 0;
      let split = 0;
      for (const [id, m] of perConnector) {
        const v = m.get(day) ?? lastSeen.get(id);
        if (m.has(day)) lastSeen.set(id, m.get(day)!);
        if (v) {
          monthly += v.monthly;
          split += v.split;
        }
      }
      history.push({ day, monthly: round(monthly), split: round(split) });
    }
  }

  return {
    sources,
    monthly: round(sources.reduce((a, s) => a + s.monthly, 0)),
    split: round(sources.reduce((a, s) => a + s.split, 0)),
    history,
  };
}
