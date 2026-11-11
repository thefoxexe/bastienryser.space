import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MilestoneKind = "seo" | "contenu" | "technique" | "campagne" | "autre";

export type Milestone = {
  id: string;
  business_id: string;
  day: string;
  title: string;
  note: string | null;
  kind: MilestoneKind;
  created_at: string;
};

export const KIND_LABEL: Record<MilestoneKind, string> = {
  seo: "SEO",
  contenu: "Contenu",
  technique: "Technique",
  campagne: "Campagne",
  autre: "Autre",
};

/** Jalons d'un business, du plus ancien au plus récent (vide si la table n'existe pas encore). */
export async function listMilestones(businessId: string): Promise<Milestone[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("milestones")
    .select("id,business_id,day,title,note,kind,created_at")
    .eq("business_id", businessId)
    .order("day")
    .order("created_at");
  return (data ?? []) as Milestone[];
}

/** Repères pour les graphiques : date et titre seulement. */
export const chartMarkers = (list: Milestone[]) => list.map((m) => ({ day: m.day, title: m.title }));

export type WindowTotals = { clicks: number; impressions: number; position: number | null; visitors: number | null };

export type MilestoneImpact = {
  /** Jours comparés de chaque côté (28 au plus, moins si le jalon est récent). */
  days: number;
  before: WindowTotals;
  after: WindowTotals;
};

const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Avant / après de chaque jalon, sur les vrais chiffres : la même durée de part et d'autre
 * (28 jours, ou moins tant que les données après le jalon ne couvrent pas 28 jours).
 * Le jour du jalon n'est compté dans aucune des deux fenêtres.
 */
export async function milestoneImpacts(businessId: string, list: Milestone[]): Promise<Map<string, MilestoneImpact | null>> {
  const out = new Map<string, MilestoneImpact | null>();
  if (!list.length) return out;
  const supabase = await createClient();
  const from = shift(list[0].day, -28);
  const { data } = await supabase
    .from("metric_points")
    .select("metric,day,value")
    .eq("business_id", businessId)
    .in("metric", ["search_clicks", "search_impressions", "search_position", "cf_visits", "ga_sessions"])
    .gte("day", from);

  const series = new Map<string, Map<string, number>>();
  for (const p of data ?? []) {
    if (!series.has(p.metric)) series.set(p.metric, new Map());
    const m = series.get(p.metric)!;
    m.set(p.day, (m.get(p.day) ?? 0) + Number(p.value));
  }
  const clicks = series.get("search_clicks");
  const impressions = series.get("search_impressions");
  const positions = series.get("search_position");
  // Visites : Cloudflare en priorité, sinon Google Analytics, jamais additionnés.
  const visitors = series.get("cf_visits") ?? series.get("ga_sessions");
  const lastSearch = clicks ? [...clicks.keys()].sort().pop() : undefined;
  const lastVisit = visitors ? [...visitors.keys()].sort().pop() : undefined;
  const lastDay = [lastSearch, lastVisit].filter(Boolean).sort().pop();

  const totals = (start: string, end: string): WindowTotals => {
    let c = 0;
    let i = 0;
    let weighted = 0;
    let v = 0;
    for (let d = start; d <= end; d = shift(d, 1)) {
      c += clicks?.get(d) ?? 0;
      const imp = impressions?.get(d) ?? 0;
      i += imp;
      weighted += (positions?.get(d) ?? 0) * imp;
      v += visitors?.get(d) ?? 0;
    }
    return { clicks: c, impressions: i, position: i ? Math.round((weighted / i) * 10) / 10 : null, visitors: visitors ? v : null };
  };

  for (const m of list) {
    if (!lastDay || lastDay <= m.day) {
      out.set(m.id, null);
      continue;
    }
    const available = Math.round((Date.parse(lastDay) - Date.parse(m.day)) / 86_400_000);
    const days = Math.min(28, available);
    out.set(m.id, {
      days,
      before: totals(shift(m.day, -days), shift(m.day, -1)),
      after: totals(shift(m.day, 1), shift(m.day, days)),
    });
  }
  return out;
}
