import "server-only";
import { createClient } from "@/lib/supabase/server";
import { lastDays, listConnectors } from "@/lib/metrics";
import type { Business } from "@/lib/types";

/**
 * Trésorerie de tous les business, en francs suisses.
 * Encaissements : Stripe et Whop (remboursements déduits à leur date) + revenus saisis.
 * Charges : frais Stripe/Whop + charges saisies. Gagné = encaissements − charges.
 * Chaque montant est converti au taux officiel BCE de son jour (dernier jour ouvré connu).
 */

export type Window = { income: number; costs: number; net: number };
export type MonthPoint = { day: string; income: number; costs: number; net: number };

export type CashBusiness = {
  id: string;
  slug: string;
  name: string;
  color: string;
  allTime: number;
  year: number;
  last30: number;
  mrr: number | null;
  /** Gagné par mois sur les 12 derniers mois (mini-courbe). */
  trend: number[];
};

export type CashOverview = {
  hasData: boolean;
  windows: {
    allTime: Window;
    year: Window;
    lastYearToDate: Window;
    month: Window;
    lastMonth: Window;
    last30: Window;
    prev30: Window;
  };
  monthly: MonthPoint[];
  cumulative: { day: string; value: number }[];
  daily90: { day: string; value: number }[];
  businesses: CashBusiness[];
  mrr: number | null;
  arr: number | null;
  subscribers: number | null;
  bestMonth: { day: string; value: number } | null;
  avgMonth12: number | null;
  firstDay: string | null;
  /** Devises sans taux de change disponible : montants laissés de côté (jamais de taux inventé). */
  unconverted: string[];
  ratesAsOf: string | null;
};

type Row = { business_id: string; day: string; unit: string; value: number; metric: string };

async function all<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null }>) {
  const rows: T[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data } = await query(from, from + 999);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const round = (v: number) => Math.round(v * 100) / 100;
const empty = (): Window => ({ income: 0, costs: 0, net: 0 });

export async function cashOverview(businesses: Business[]): Promise<CashOverview> {
  const supabase = await createClient();
  const [points, entries, connectors] = await Promise.all([
    all<Row>((a, b) =>
      supabase.from("metric_points").select("business_id,day,unit,value,metric").in("metric", ["revenue", "fees"]).order("day").range(a, b),
    ),
    all<{ business_id: string; day: string; kind: string; amount: number; currency: string }>((a, b) =>
      supabase.from("ledger_entries").select("business_id,day,kind,amount,currency").order("day").range(a, b),
    ),
    listConnectors(),
  ]);

  // Mouvements bruts : (business, jour, devise, encaissement ou charge).
  const moves: { business_id: string; day: string; currency: string; income: number; costs: number }[] = [];
  for (const p of points) {
    if (!p.unit) continue;
    const v = Number(p.value);
    moves.push({ business_id: p.business_id, day: p.day, currency: p.unit.toLowerCase(), income: p.metric === "revenue" ? v : 0, costs: p.metric === "fees" ? v : 0 });
  }
  for (const e of entries) {
    const v = Number(e.amount);
    moves.push({ business_id: e.business_id, day: e.day, currency: e.currency.toLowerCase(), income: e.kind === "income" ? v : 0, costs: e.kind === "income" ? 0 : v });
  }

  // Taux BCE des devises présentes (MRR compris), depuis le premier mouvement.
  const mrrByConnector = connectors.filter((c) => c.kind === "whop" && c.snapshot.mrr);
  const currencies = [...new Set([...moves.map((m) => m.currency), ...mrrByConnector.flatMap((c) => Object.keys(c.snapshot.mrr ?? {}))])].filter((c) => c !== "chf");
  const firstDay = moves.reduce<string | null>((m, x) => (m === null || x.day < m ? x.day : m), null);
  const rates = new Map<string, { day: string; chf: number }[]>();
  if (currencies.length) {
    const since = firstDay ? new Date(Date.parse(`${firstDay}T00:00:00Z`) - 10 * 86400_000).toISOString().slice(0, 10) : "2015-01-01";
    const fx = await all<{ day: string; currency: string; chf: number }>((a, b) =>
      supabase.from("fx_rates").select("day,currency,chf").in("currency", currencies).gte("day", since).order("day").range(a, b),
    );
    for (const r of fx) {
      if (!rates.has(r.currency)) rates.set(r.currency, []);
      rates.get(r.currency)!.push({ day: r.day, chf: Number(r.chf) });
    }
  }
  const rateOn = (currency: string, day: string): number | null => {
    if (currency === "chf") return 1;
    const list = rates.get(currency);
    if (!list?.length) return null;
    // Dernier jour ouvré connu à cette date (week-end, jour férié, jour pas encore publié).
    let lo = 0;
    let hi = list.length - 1;
    if (day < list[0].day) return list[0].chf;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (list[mid].day <= day) lo = mid;
      else hi = mid - 1;
    }
    return list[lo].chf;
  };

  const days = lastDays(90);
  const today = days[days.length - 1];
  const [ty, tm] = today.split("-").map(Number);
  const yearStart = `${ty}-01-01`;
  const lastYearStart = `${ty - 1}-01-01`;
  const lastYearToday = `${ty - 1}${today.slice(4)}`;
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = tm === 1 ? `${ty - 1}-12-01` : `${ty}-${String(tm - 1).padStart(2, "0")}-01`;
  const d30 = days[days.length - 30];
  const d60 = lastDays(60)[0];

  const windows = { allTime: empty(), year: empty(), lastYearToDate: empty(), month: empty(), lastMonth: empty(), last30: empty(), prev30: empty() };
  const byMonth = new Map<string, Window>();
  const byDay = new Map<string, number>();
  const perBiz = new Map<string, { allTime: number; year: number; last30: number; months: Map<string, number> }>();
  const unconverted = new Set<string>();

  for (const m of moves) {
    if (m.day > today) continue;
    const rate = rateOn(m.currency, m.day);
    if (rate === null) {
      unconverted.add(m.currency);
      continue;
    }
    const income = m.income * rate;
    const costs = m.costs * rate;
    const net = income - costs;
    const add = (w: Window) => {
      w.income += income;
      w.costs += costs;
      w.net += net;
    };
    add(windows.allTime);
    if (m.day >= yearStart) add(windows.year);
    if (m.day >= lastYearStart && m.day <= lastYearToday) add(windows.lastYearToDate);
    if (m.day >= monthStart) add(windows.month);
    else if (m.day >= lastMonthStart) add(windows.lastMonth);
    if (m.day >= d30) add(windows.last30);
    else if (m.day >= d60) add(windows.prev30);
    const month = `${m.day.slice(0, 7)}-01`;
    if (!byMonth.has(month)) byMonth.set(month, empty());
    add(byMonth.get(month)!);
    if (m.day >= days[0]) byDay.set(m.day, (byDay.get(m.day) ?? 0) + net);
    if (!perBiz.has(m.business_id)) perBiz.set(m.business_id, { allTime: 0, year: 0, last30: 0, months: new Map() });
    const b = perBiz.get(m.business_id)!;
    b.allTime += net;
    if (m.day >= yearStart) b.year += net;
    if (m.day >= d30) b.last30 += net;
    b.months.set(month, (b.months.get(month) ?? 0) + net);
  }

  // Tous les mois du premier mouvement à aujourd'hui (un mois sans rien vaut réellement 0).
  const monthly: MonthPoint[] = [];
  if (firstDay) {
    let [y, m] = firstDay.split("-").map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      const key = `${y}-${String(m).padStart(2, "0")}-01`;
      const w = byMonth.get(key) ?? empty();
      monthly.push({ day: key, income: round(w.income), costs: round(w.costs), net: round(w.net) });
      if (++m > 12) {
        m = 1;
        y++;
      }
    }
  }
  let running = 0;
  const cumulative = monthly.map((p) => ({ day: p.day, value: round((running += p.net)) }));
  const complete = monthly.filter((p) => p.day < monthStart);
  const last12 = complete.slice(-12);
  const bestMonth = monthly.reduce<{ day: string; value: number } | null>((b, p) => (p.net > 0 && (!b || p.net > b.value) ? { day: p.day, value: p.net } : b), null);

  // MRR : abonnements Whop en cours, convertis au dernier taux connu.
  const latest = (currency: string) => rateOn(currency, today);
  const mrrOf = (businessId: string) => {
    const list = mrrByConnector.filter((c) => c.business_id === businessId);
    if (!list.length) return null;
    let total = 0;
    for (const c of list)
      for (const [cur, v] of Object.entries(c.snapshot.mrr ?? {})) {
        const r = latest(cur);
        if (r === null) unconverted.add(cur);
        else total += v * r;
      }
    return round(total);
  };
  const mrrValues = businesses.map((b) => mrrOf(b.id)).filter((v): v is number => v !== null);
  const mrr = mrrValues.length ? round(mrrValues.reduce((a, v) => a + v, 0)) : null;
  const subs = mrrByConnector.map((c) => c.snapshot.subscribers).filter((v): v is number => typeof v === "number");

  const trendMonths = monthly.slice(-12).map((p) => p.day);
  const list: CashBusiness[] = businesses
    .filter((b) => perBiz.has(b.id) || mrrOf(b.id) !== null)
    .map((b) => {
      const s = perBiz.get(b.id);
      return {
        id: b.id,
        slug: b.slug,
        name: b.name,
        color: b.color,
        allTime: round(s?.allTime ?? 0),
        year: round(s?.year ?? 0),
        last30: round(s?.last30 ?? 0),
        mrr: mrrOf(b.id),
        trend: trendMonths.map((d) => round(s?.months.get(d) ?? 0)),
      };
    })
    .sort((a, b) => b.allTime - a.allTime);

  const roundWindow = (w: Window): Window => ({ income: round(w.income), costs: round(w.costs), net: round(w.net) });
  const ratesAsOf = currencies.length ? ([...rates.values()].map((l) => l[l.length - 1]?.day).sort().pop() ?? null) : null;

  return {
    hasData: moves.length > 0,
    windows: {
      allTime: roundWindow(windows.allTime),
      year: roundWindow(windows.year),
      lastYearToDate: roundWindow(windows.lastYearToDate),
      month: roundWindow(windows.month),
      lastMonth: roundWindow(windows.lastMonth),
      last30: roundWindow(windows.last30),
      prev30: roundWindow(windows.prev30),
    },
    monthly,
    cumulative,
    daily90: days.map((day) => ({ day, value: round(byDay.get(day) ?? 0) })),
    businesses: list,
    mrr,
    arr: mrr === null ? null : round(mrr * 12),
    subscribers: subs.length ? subs.reduce((a, v) => a + v, 0) : null,
    bestMonth,
    avgMonth12: last12.length ? round(last12.reduce((a, p) => a + p.net, 0) / last12.length) : null,
    firstDay,
    unconverted: [...unconverted],
    ratesAsOf,
  };
}
