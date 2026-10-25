import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TIME_ZONE } from "@/lib/format";

export type SeriesPoint = { day: string; value: number };

export type Connector = {
  id: string;
  business_id: string;
  kind: "stripe" | "plausible" | "search_console" | "google_analytics";
  label: string;
  config: { site_id?: string; base_url?: string; site_url?: string; property_id?: string; options?: { value: string; label: string }[] };
  snapshot: {
    period?: string;
    queries?: { key: string; clicks: number; impressions: number; position: number }[];
    pages?: { key: string; clicks?: number; impressions?: number; position?: number; views?: number }[];
    channels?: { key: string; sessions: number }[];
  };
  status: "connected" | "pending" | "error";
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type SiteStatus = {
  business_id: string;
  url: string;
  host: string;
  last: { ok: boolean; status_code: number | null; response_ms: number | null; error: string | null; checked_at: string } | null;
  uptime24h: number | null;
  uptime30d: number | null;
  avgMs30d: number | null;
  days: { day: string; checks: number; okChecks: number; avgMs: number | null }[];
};

/** Les N derniers jours (AAAA-MM-JJ, heure de Zurich), du plus ancien au plus récent. */
export function lastDays(n: number, now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  return Array.from({ length: n }, (_, i) => fmt.format(new Date(now.getTime() - (n - 1 - i) * 86400_000)));
}

export async function listConnectors(businessId?: string): Promise<Connector[]> {
  const supabase = await createClient();
  let q = supabase.from("connectors").select("id,business_id,kind,label,config,snapshot,status,last_sync_at,last_error,created_at").order("kind");
  if (businessId) q = q.eq("business_id", businessId);
  const { data } = await q;
  return (data ?? []) as Connector[];
}

/**
 * Série quotidienne d'une métrique sur `days` jours. Les jours sans valeur valent 0 :
 * Plausible et Stripe n'envoient rien pour un jour sans visite ni paiement.
 * Renvoie null si aucune source n'alimente cette métrique (on n'affiche alors rien plutôt qu'un faux zéro).
 */
export async function metricSeries(options: {
  businessId?: string;
  metric: string;
  unit?: string;
  days?: number;
  /** Coupe les derniers jours pas encore livrés par la source (Search Console : 2 à 3 jours de décalage). */
  trimTrailing?: boolean;
}): Promise<SeriesPoint[] | null> {
  const supabase = await createClient();
  const days = lastDays(options.days ?? 30);
  let q = supabase.from("metric_points").select("day,value,unit").eq("metric", options.metric).gte("day", days[0]);
  if (options.businessId) q = q.eq("business_id", options.businessId);
  if (options.unit !== undefined) q = q.eq("unit", options.unit);
  const { data } = await q;

  const kind = sourceOf(options.metric);
  const sources = await listConnectors(options.businessId);
  if (!sources.some((c) => c.kind === kind)) return null;

  const byDay = new Map<string, number>();
  for (const p of data ?? []) byDay.set(p.day, (byDay.get(p.day) ?? 0) + Number(p.value));
  let range = days;
  if (options.trimTrailing) {
    const lastKnown = [...byDay.keys()].sort().pop();
    range = lastKnown ? days.filter((d) => d <= lastKnown) : [];
  }
  return range.map((day) => ({ day, value: byDay.get(day) ?? 0 }));
}

/** Connecteur qui alimente une métrique. */
export function sourceOf(metric: string): Connector["kind"] {
  if (["revenue", "payments", "refunds", "fees"].includes(metric)) return "stripe";
  if (metric.startsWith("search_")) return "search_console";
  if (metric.startsWith("ga_")) return "google_analytics";
  return "plausible";
}

/** Position moyenne dans Google sur la période, pondérée par les impressions (comme dans la Search Console). */
export async function searchPosition(businessId: string, days = 28): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("metric_points")
    .select("metric,day,value")
    .eq("business_id", businessId)
    .in("metric", ["search_position", "search_impressions"])
    .gte("day", lastDays(days)[0]);
  const impressions = new Map<string, number>();
  for (const p of data ?? []) if (p.metric === "search_impressions") impressions.set(p.day, Number(p.value));
  let weighted = 0;
  let total = 0;
  for (const p of data ?? []) {
    if (p.metric !== "search_position") continue;
    const w = impressions.get(p.day) ?? 0;
    weighted += Number(p.value) * w;
    total += w;
  }
  return total ? Math.round((weighted / total) * 10) / 10 : null;
}

/** Devises présentes dans les revenus des 30 derniers jours, de la plus importante à la plus faible. */
export async function revenueCurrencies(businessId?: string): Promise<{ unit: string; total: number }[]> {
  const supabase = await createClient();
  let q = supabase.from("metric_points").select("unit,value").eq("metric", "revenue").gte("day", lastDays(30)[0]);
  if (businessId) q = q.eq("business_id", businessId);
  const { data } = await q;
  const totals = new Map<string, number>();
  for (const p of data ?? []) totals.set(p.unit, (totals.get(p.unit) ?? 0) + Number(p.value));
  return [...totals.entries()].map(([unit, total]) => ({ unit, total })).sort((a, b) => b.total - a.total);
}

export async function siteStatuses(businesses: { id: string; websites: string[] }[], businessId?: string): Promise<SiteStatus[]> {
  const supabase = await createClient();
  const scope = businessId ? businesses.filter((b) => b.id === businessId) : businesses;
  const urls = scope.flatMap((b) => b.websites.map((url) => ({ business_id: b.id, url })));
  if (!urls.length) return [];

  const since24h = new Date(Date.now() - 86400_000).toISOString();
  const [{ data: daily }, { data: recent }] = await Promise.all([
    supabase.rpc("site_uptime", { p_business_id: businessId ?? null, p_days: 30 }),
    supabase
      .from("site_checks")
      .select("business_id,url,ok,status_code,response_ms,error,checked_at")
      .gte("checked_at", since24h)
      .in("business_id", scope.map((b) => b.id))
      .order("checked_at", { ascending: false })
      .limit(5000),
  ]);

  type Daily = { business_id: string; url: string; day: string; checks: number; ok_checks: number; avg_ms: number | null };
  type Recent = { business_id: string; url: string; ok: boolean; status_code: number | null; response_ms: number | null; error: string | null; checked_at: string };
  const days = lastDays(30);

  return urls.map(({ business_id, url }) => {
    const rows = ((daily ?? []) as Daily[]).filter((d) => d.business_id === business_id && d.url === url);
    const last24 = ((recent ?? []) as Recent[]).filter((r) => r.business_id === business_id && r.url === url);
    const checks = rows.reduce((s, r) => s + r.checks, 0);
    const okChecks = rows.reduce((s, r) => s + r.ok_checks, 0);
    const msRows = rows.filter((r) => r.avg_ms !== null);
    const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
    return {
      business_id,
      url,
      host: url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      last: last24[0] ? { ...last24[0] } : null,
      uptime24h: last24.length ? (last24.filter((r) => r.ok).length / last24.length) * 100 : null,
      uptime30d: checks ? (okChecks / checks) * 100 : null,
      avgMs30d: msRows.length ? Math.round(msRows.reduce((s, r) => s + (r.avg_ms ?? 0) * r.ok_checks, 0) / Math.max(1, msRows.reduce((s, r) => s + r.ok_checks, 0))) : null,
      days: days.map((day) => {
        const r = byDay.get(day);
        return { day, checks: r?.checks ?? 0, okChecks: r?.ok_checks ?? 0, avgMs: r?.avg_ms ?? null };
      }),
    };
  });
}
