import "server-only";
import { createClient } from "@/lib/supabase/server";

export type KeywordRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  prev_clicks: number;
  prev_impressions: number;
  prev_position: number | null;
  tracked: boolean;
  first_seen: string | null;
  trend: (number | null)[] | null;
};

export type KeywordPoint = { day: string; clicks: number; impressions: number; position: number | null };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function keywordRankings(businessId: string, days: number): Promise<KeywordRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("keyword_rankings", { p_business_id: businessId, p_days: days, p_limit: 500 });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    query: String(r.query),
    clicks: Number(r.clicks),
    impressions: Number(r.impressions),
    ctr: num(r.ctr),
    position: num(r.position),
    prev_clicks: Number(r.prev_clicks),
    prev_impressions: Number(r.prev_impressions),
    prev_position: num(r.prev_position),
    tracked: Boolean(r.tracked),
    first_seen: (r.first_seen as string | null) ?? null,
    trend: ((r.trend as unknown[] | null) ?? null)?.map(num) ?? null,
  }));
}

export async function keywordHistory(businessId: string, query: string, days = 90): Promise<KeywordPoint[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("keyword_history", { p_business_id: businessId, p_query: query, p_days: days });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    day: String(r.day).slice(0, 10),
    clicks: Number(r.clicks),
    impressions: Number(r.impressions),
    position: num(r.position),
  }));
}

/** Évolution de position : positif = on a gagné des places (la position a baissé). */
export function positionGain(k: Pick<KeywordRow, "position" | "prev_position">) {
  if (k.position === null || k.prev_position === null) return null;
  return Math.round((k.prev_position - k.position) * 10) / 10;
}

/**
 * Taux de clic habituel par position organique (repères publics de l'industrie, arrondis).
 * Sert uniquement à signaler un titre ou une description à retravailler ; jamais affiché comme un chiffre réel.
 */
const TYPICAL_CTR = [0, 25, 15, 10, 7, 5, 4, 3, 2.5, 2, 1.5];

export type Opportunity = { query: string; kind: "page2" | "ctr"; position: number; impressions: number; ctr: number | null };

export function opportunities(rows: KeywordRow[]): Opportunity[] {
  const out: Opportunity[] = [];
  for (const k of rows) {
    if (k.position === null || k.impressions < 20) continue;
    if (k.position > 8 && k.position <= 20) out.push({ query: k.query, kind: "page2", position: k.position, impressions: k.impressions, ctr: k.ctr });
    else if (k.position <= 5 && k.ctr !== null && k.ctr < TYPICAL_CTR[Math.max(1, Math.round(k.position))] / 2) {
      out.push({ query: k.query, kind: "ctr", position: k.position, impressions: k.impressions, ctr: k.ctr });
    }
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, 6);
}
