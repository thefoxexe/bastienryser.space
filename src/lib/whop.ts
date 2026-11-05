import "server-only";
import { createClient } from "@/lib/supabase/server";
import { lastDays, listConnectors, type Connector } from "@/lib/metrics";

export type WhopOverview = {
  connector: Connector | null;
  currency: string;
  /** Revenus nets par mois (remboursements déduits), du premier paiement à aujourd'hui. Jour = 1er du mois. */
  monthly: { day: string; value: number }[];
  /** Cumul des revenus nets, mois par mois. */
  cumulative: { day: string; value: number }[];
  /** Revenus nets par jour, 30 derniers jours. */
  last30: { day: string; value: number }[];
  /** Gain cumulé (revenus nets moins frais Whop), mois par mois. */
  cumulativeGain: { day: string; value: number }[];
  /** Revenus d'abonnements (création et renouvellements) encaissés par mois. */
  recurringMonthly: { day: string; value: number }[];
  /** MRR relevé chaque jour depuis la connexion. */
  mrrHistory: { day: string; value: number }[];
  totals: {
    revenue: number;
    fees: number;
    gain: number;
    payments: number;
    refunds: number;
    revenue30: number;
    gain30: number;
    payments30: number;
    bestMonth: { day: string; value: number } | null;
  };
  subscriptions: { mrr: number | null; arr: number | null; subscribers: number | null; canceling: number | null; error: string | null; at: string | null };
  firstDay: string | null;
  otherCurrencies: string[];
};

const round = (v: number) => Math.round(v * 100) / 100;

/** Chiffres Whop enregistrés depuis toujours (synchronisés par l'Edge Function), dans la devise principale. */
export async function whopOverview(businessId: string): Promise<WhopOverview> {
  const connectors = await listConnectors(businessId);
  const connector = connectors.find((c) => c.kind === "whop") ?? null;
  const empty: WhopOverview = {
    connector,
    currency: "usd",
    monthly: [],
    cumulative: [],
    cumulativeGain: [],
    recurringMonthly: [],
    mrrHistory: [],
    last30: [],
    totals: { revenue: 0, fees: 0, gain: 0, payments: 0, refunds: 0, revenue30: 0, gain30: 0, payments30: 0, bestMonth: null },
    subscriptions: { mrr: null, arr: null, subscribers: null, canceling: null, error: null, at: null },
    firstDay: null,
    otherCurrencies: [],
  };
  if (!connector) return empty;

  // Jusqu'à dix ans de points : lus par pages de 1000 (limite de l'API).
  const supabase = await createClient();
  const rows: { metric: string; day: string; unit: string; value: number }[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data } = await supabase
      .from("metric_points")
      .select("metric,day,unit,value")
      .eq("connector_id", connector.id)
      .in("metric", ["revenue", "payments", "refunds", "fees", "recurring", "mrr"])
      .order("day")
      .range(from, from + 999);
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }
  const snap = connector.snapshot;
  const subsFor = (currency: string) => {
    const mrr = snap.mrr ? (snap.mrr[currency] ?? 0) : null;
    return {
      mrr,
      arr: mrr === null ? null : round(mrr * 12),
      subscribers: snap.subscribers ?? null,
      canceling: snap.canceling ?? null,
      error: snap.mrr_error ?? null,
      at: snap.computed_at ?? null,
    };
  };
  if (!rows.length) {
    const currency = Object.keys(snap.mrr ?? {})[0] ?? "usd";
    return { ...empty, currency, subscriptions: subsFor(currency) };
  }

  const weight = new Map<string, number>();
  for (const r of rows) if (r.unit && r.metric === "revenue") weight.set(r.unit, (weight.get(r.unit) ?? 0) + Math.abs(Number(r.value)));
  const currency = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "usd";

  const days30 = lastDays(30);
  const byMonth = new Map<string, number>();
  const feesByMonth = new Map<string, number>();
  const recurringByMonth = new Map<string, number>();
  const mrrHistory: { day: string; value: number }[] = [];
  const byDay = new Map<string, number>();
  const totals = { ...empty.totals };
  let firstDay: string | null = null;
  for (const r of rows) {
    const v = Number(r.value);
    if (r.metric === "payments") {
      totals.payments += v;
      if (r.day >= days30[0]) totals.payments30 += v;
      firstDay ??= r.day;
      continue;
    }
    if (r.unit !== currency) continue;
    const month = `${r.day.slice(0, 7)}-01`;
    if (r.metric === "refunds") {
      totals.refunds += v;
      continue;
    }
    if (r.metric === "mrr") {
      mrrHistory.push({ day: r.day, value: v });
      continue;
    }
    if (r.metric === "recurring") {
      recurringByMonth.set(month, (recurringByMonth.get(month) ?? 0) + v);
      continue;
    }
    if (r.metric === "fees") {
      totals.fees += v;
      feesByMonth.set(month, (feesByMonth.get(month) ?? 0) + v);
      if (r.day >= days30[0]) totals.gain30 -= v;
      continue;
    }
    totals.revenue += v;
    byMonth.set(month, (byMonth.get(month) ?? 0) + v);
    if (r.day >= days30[0]) {
      totals.revenue30 += v;
      totals.gain30 += v;
      byDay.set(r.day, (byDay.get(r.day) ?? 0) + v);
    }
    firstDay = firstDay === null || r.day < firstDay ? r.day : firstDay;
  }

  // Tous les mois du premier paiement à aujourd'hui, mois vides compris (0 réel : aucun paiement ce mois-là).
  const monthly: { day: string; value: number }[] = [];
  const today = days30[days30.length - 1];
  if (firstDay) {
    let [y, m] = firstDay.split("-").map(Number);
    const [ty, tm] = today.split("-").map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      const key = `${y}-${String(m).padStart(2, "0")}-01`;
      monthly.push({ day: key, value: round(byMonth.get(key) ?? 0) });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  }
  let running = 0;
  const cumulative = monthly.map((p) => ({ day: p.day, value: round((running += p.value)) }));
  let gained = 0;
  const cumulativeGain = monthly.map((p) => ({ day: p.day, value: round((gained += p.value - (feesByMonth.get(p.day) ?? 0))) }));
  const recurringMonthly = monthly.map((p) => ({ day: p.day, value: round(recurringByMonth.get(p.day) ?? 0) }));
  const best = monthly.reduce<{ day: string; value: number } | null>((b, p) => (p.value > 0 && (!b || p.value > b.value) ? p : b), null);

  return {
    connector,
    currency,
    monthly,
    cumulative,
    cumulativeGain,
    recurringMonthly: recurringMonthly.some((p) => p.value) ? recurringMonthly : [],
    mrrHistory,
    last30: days30.map((day) => ({ day, value: round(byDay.get(day) ?? 0) })),
    totals: {
      revenue: round(totals.revenue),
      fees: round(totals.fees),
      gain: round(totals.revenue - totals.fees),
      gain30: round(totals.gain30),
      payments: totals.payments,
      refunds: round(totals.refunds),
      revenue30: round(totals.revenue30),
      payments30: totals.payments30,
      bestMonth: best,
    },
    subscriptions: subsFor(currency),
    firstDay,
    otherCurrencies: [...weight.keys()].filter((c) => c !== currency),
  };
}
