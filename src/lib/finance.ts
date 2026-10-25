import "server-only";
import { createClient } from "@/lib/supabase/server";
import { lastDays, listConnectors, type SeriesPoint } from "@/lib/metrics";

/** Périodes proposées partout (accueil, données, finances). */
export const PERIODS = [
  { days: 7, label: "7 jours", short: "7 j" },
  { days: 30, label: "30 jours", short: "30 j" },
  { days: 90, label: "3 mois", short: "3 mois" },
  { days: 365, label: "12 mois", short: "12 mois" },
] as const;

export function periodFrom(value: unknown, fallback = 30) {
  const n = Number(value);
  return PERIODS.some((p) => p.days === n) ? n : fallback;
}

export const periodShort = (days: number) => PERIODS.find((p) => p.days === days)?.short ?? `${days} j`;

export type LedgerEntry = {
  id: string;
  business_id: string;
  day: string;
  kind: "income" | "expense";
  amount: number;
  currency: string;
  label: string;
  category: string | null;
  reference: string | null;
};

export type FinanceSummary = {
  currency: string;
  /** Encaissements par jour : Stripe (net des remboursements, peut être négatif) + revenus saisis. */
  income: SeriesPoint[];
  /** Charges par jour : saisies + frais Stripe. */
  expenses: SeriesPoint[];
  /** Résultat par jour (encaissements − charges). */
  net: SeriesPoint[];
  totals: { income: number; expenses: number; net: number; stripe: number; manualIncome: number; manualExpenses: number; fees: number; refunds: number; payments: number };
  hasStripe: boolean;
  hasEntries: boolean;
  /** Montants dans d'autres devises, non additionnés (jamais de conversion inventée). */
  otherCurrencies: string[];
};

/** Chiffres réels de la période : Stripe et écritures saisies, dans la devise principale. */
export async function financeSummary(businessId: string | undefined, period: number): Promise<FinanceSummary> {
  const supabase = await createClient();
  const days = lastDays(period);
  const today = days[days.length - 1];

  let pointsQ = supabase.from("metric_points").select("metric,day,unit,value").in("metric", ["revenue", "refunds", "fees", "payments"]).gte("day", days[0]);
  let entriesQ = supabase.from("ledger_entries").select("day,kind,amount,currency").gte("day", days[0]).lte("day", today);
  if (businessId) {
    pointsQ = pointsQ.eq("business_id", businessId);
    entriesQ = entriesQ.eq("business_id", businessId);
  }
  const [{ data: points }, { data: entries }, connectors] = await Promise.all([pointsQ, entriesQ, listConnectors(businessId)]);

  // Devise principale : celle qui pèse le plus sur la période (CHF par défaut).
  const weight = new Map<string, number>();
  for (const p of points ?? []) if (p.unit) weight.set(p.unit, (weight.get(p.unit) ?? 0) + Math.abs(Number(p.value)));
  for (const e of entries ?? []) weight.set(e.currency, (weight.get(e.currency) ?? 0) + Number(e.amount));
  const currency = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "chf";

  const income = new Map<string, number>();
  const expenses = new Map<string, number>();
  const add = (m: Map<string, number>, day: string, v: number) => m.set(day, (m.get(day) ?? 0) + v);
  const totals = { income: 0, expenses: 0, net: 0, stripe: 0, manualIncome: 0, manualExpenses: 0, fees: 0, refunds: 0, payments: 0 };

  for (const p of points ?? []) {
    const v = Number(p.value);
    if (p.metric === "payments") {
      totals.payments += v;
      continue;
    }
    if (p.unit !== currency) continue;
    if (p.metric === "revenue") {
      add(income, p.day, v);
      totals.stripe += v;
    } else if (p.metric === "fees") {
      add(expenses, p.day, v);
      totals.fees += v;
    } else if (p.metric === "refunds") totals.refunds += v;
  }
  for (const e of entries ?? []) {
    if (e.currency !== currency) continue;
    const v = Number(e.amount);
    if (e.kind === "income") {
      add(income, e.day, v);
      totals.manualIncome += v;
    } else {
      add(expenses, e.day, v);
      totals.manualExpenses += v;
    }
  }
  totals.income = totals.stripe + totals.manualIncome;
  totals.expenses = totals.fees + totals.manualExpenses;
  totals.net = totals.income - totals.expenses;
  const round = (v: number) => Math.round(v * 100) / 100;
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = round(totals[k]);

  return {
    currency,
    income: days.map((day) => ({ day, value: round(income.get(day) ?? 0) })),
    expenses: days.map((day) => ({ day, value: round(expenses.get(day) ?? 0) })),
    net: days.map((day) => ({ day, value: round((income.get(day) ?? 0) - (expenses.get(day) ?? 0)) })),
    totals,
    hasStripe: connectors.some((c) => c.kind === "stripe"),
    hasEntries: (entries ?? []).length > 0,
    otherCurrencies: [...weight.keys()].filter((c) => c !== currency),
  };
}

/** Écritures saisies sur la période, les plus récentes d'abord. */
export async function listEntries(businessId: string, period: number): Promise<LedgerEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ledger_entries")
    .select("id,business_id,day,kind,amount,currency,label,category,reference")
    .eq("business_id", businessId)
    .gte("day", lastDays(period)[0])
    .order("day", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as LedgerEntry[]).map((e) => ({ ...e, amount: Number(e.amount) }));
}

/** Regroupe une série par semaine (périodes longues : une courbe lisible plutôt que 365 points). */
export function weekly(series: SeriesPoint[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    out.push({ day: chunk[0].day, value: Math.round(chunk.reduce((a, p) => a + p.value, 0) * 100) / 100 });
  }
  return out;
}
