// Whop : paiements encaissés (plateforme de vente d'accès et d'abonnements).
// Lit l'API v1 (curseurs) et, à défaut, l'ancienne v5 (pages) avec une clé d'entreprise.
// Les montants sont ceux renvoyés par Whop (v1 : objets { amount: "10.00" }, en unités de la devise) ; les remboursements sont déduits à leur date.
// MRR : prix de renouvellement des abonnements en cours, ramené à un mois.

import { addSubscription, ConnectorError, emptySubscriptions, roundSubscriptions, type DailyPoint, type SubscriptionsSnapshot } from "./connectors.ts";

const BASE = "https://api.whop.com/api";

type Raw = Record<string, unknown>;

async function whopGet(key: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 429 && attempt < 2) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, (Number(res.headers.get("retry-after")) || 3 * (attempt + 1)) * 1000));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as Raw;
    if (res.status === 401 || res.status === 403) {
      throw new ConnectorError(path.includes("memberships") ? "Whop refuse la lecture des abonnements : ajoute le droit member:basic:read à la clé." : "Whop refuse cette clé : vérifie qu'elle a le droit de lire les paiements (payment:basic:read).", true);
    }
    if (res.status === 429) throw new ConnectorError("Whop limite temporairement les demandes : nouvel essai au prochain passage.", false, true);
    if (!res.ok) throw new ConnectorError(`Whop a répondu ${res.status} (${path}).`);
    return { status: res.status, body };
  }
  throw new ConnectorError("Whop ne répond pas.");
}

const toUnix = (v: unknown): number | null => {
  if (typeof v === "number") return v > 1e12 ? Math.floor(v / 1000) : v;
  if (typeof v === "string" && v) {
    const n = Number(v);
    if (Number.isFinite(n)) return n > 1e12 ? Math.floor(n / 1000) : n;
    const t = Date.parse(v);
    return Number.isFinite(t) ? Math.floor(t / 1000) : null;
  }
  return null;
};
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
/** Montant Whop : objet { amount: "10.00", currency } en v1 (unités de la devise), nombre en v5. */
const money = (v: unknown): number | null => (v && typeof v === "object" ? num((v as Raw).amount) : num(v));

export type WhopPayment = {
  id: string;
  amount: number;
  /** Ce que Whop reverse : le total moins ses frais. null si non fourni. */
  afterFees: number | null;
  currency: string;
  paidAt: number;
  refunded: number;
  refundedAt: number | null;
  /** Paiement d'abonnement (création, renouvellement ou changement de formule). */
  recurring: boolean;
  status: string;
};

const RECURRING = ["subscription_create", "subscription_cycle", "subscription_update", "subscription"];

/** Paiement Whop (v1 ou v5) → montant encaissé, devise, dates. null si pas encaissé (brouillon, échec, en attente). */
export function normalize(p: Raw): WhopPayment | null {
  const status = String(p.status ?? "").toLowerCase();
  const substatus = String(p.substatus ?? "").toLowerCase();
  const paid = ["paid", "succeeded", "refunded", "partially_refunded"].includes(status) || ["succeeded", "refunded", "partially_refunded", "auto_refunded"].includes(substatus);
  if (!paid) return null;
  const amount = money(p.total) ?? money(p.final_amount) ?? money(p.subtotal) ?? money(p.amount);
  const paidAt = toUnix(p.paid_at) ?? toUnix(p.created_at);
  if (amount === null || paidAt === null) return null;
  const fullyRefunded = substatus === "refunded" || substatus === "auto_refunded" || status === "refunded";
  const refunded = money(p.refunded_amount) || (fullyRefunded ? amount : 0);
  const currency = String(p.currency ?? (p.total as Raw | undefined)?.currency ?? "usd").toLowerCase();
  return {
    id: String(p.id ?? ""),
    amount,
    afterFees: money(p.amount_after_fees),
    currency,
    paidAt,
    refunded,
    refundedAt: refunded ? (toUnix(p.refunded_at) ?? paidAt) : null,
    recurring: RECURRING.includes(String(p.billing_reason ?? "").toLowerCase()),
    status: substatus || status,
  };
}

/** Parcourt tous les paiements (v1 par curseurs, sinon v5 par pages), 10 000 au plus. */
async function eachPayment(key: string, each: (p: Raw) => void): Promise<"v1" | "v5"> {
  try {
    let after: string | undefined;
    for (let i = 0; i < 100; i++) {
      const { body } = await whopGet(key, "v1/payments", { first: "100", ...(after ? { after } : {}) });
      const data = (body.data as Raw[] | undefined) ?? [];
      data.forEach(each);
      const info = body.page_info as { has_next_page?: boolean; end_cursor?: string } | undefined;
      if (!info?.has_next_page || !info.end_cursor) return "v1";
      after = info.end_cursor;
    }
    return "v1";
  } catch (e) {
    if (e instanceof ConnectorError && (e.authProblem || e.transient)) throw e;
  }
  for (let page = 1; page <= 200; page++) {
    const { body } = await whopGet(key, "v5/company/payments", { page: String(page), per: "50" });
    const data = (body.data as Raw[] | undefined) ?? [];
    data.forEach(each);
    const pg = body.pagination as { total_page?: number; total_pages?: number; next_page?: number | null } | undefined;
    const total = pg?.total_pages ?? pg?.total_page;
    if (!data.length || (total !== undefined && page >= total) || pg?.next_page === null) break;
  }
  return "v5";
}

export async function whopTest(key: string) {
  if (key.length < 20) throw new ConnectorError("Ce n'est pas une clé d'API Whop.");
  try {
    await whopGet(key, "v1/payments", { first: "1" });
  } catch (e) {
    if (e instanceof ConnectorError && e.authProblem) {
      // La v5 accepte les clés d'entreprise plus anciennes.
      await whopGet(key, "v5/company/payments", { page: "1", per: "1" });
      return;
    }
    throw e;
  }
}

const dayInZurich = (unixSeconds: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(unixSeconds * 1000));

/** Encaissements par jour : revenus nets (remboursements déduits à leur date), nombre de paiements, remboursements, frais Whop, part récurrente. */
export async function whopDaily(key: string, days: number): Promise<DailyPoint[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const totals = new Map<string, number>();
  const add = (metric: string, day: string, unit: string, v: number) => {
    if (!v) return;
    const k = `${metric}|${day}|${unit}`;
    totals.set(k, (totals.get(k) ?? 0) + v);
  };
  const seen = new Set<string>();
  await eachPayment(key, (raw) => {
    const p = normalize(raw);
    if (!p || (p.id && seen.has(p.id))) return;
    if (p.id) seen.add(p.id);
    if (p.paidAt >= since) {
      const day = dayInZurich(p.paidAt);
      add("revenue", day, p.currency, p.amount);
      add("payments", day, "", 1);
      if (p.afterFees !== null) add("fees", day, p.currency, Math.max(0, p.amount - p.afterFees));
      if (p.recurring) add("recurring", day, p.currency, p.amount);
    }
    if (p.refunded && p.refundedAt !== null && p.refundedAt >= since) {
      const day = dayInZurich(p.refundedAt);
      add("revenue", day, p.currency, -p.refunded);
      add("refunds", day, p.currency, p.refunded);
    }
  });
  return [...totals.entries()].map(([k, value]) => {
    const [metric, day, unit] = k.split("|");
    return { metric, day, unit, value: Math.round(value * 100) / 100 };
  });
}

export type WhopSubscriptions = SubscriptionsSnapshot;

/** Abonnements en cours (v1, droit member:basic:read) : MRR par devise, part mensuelle et part payée d'avance. */
export async function whopSubscriptions(key: string): Promise<WhopSubscriptions> {
  const snap = emptySubscriptions();
  const seen = new Set<string>();
  for (const status of ["active", "canceling"]) {
    let after: string | undefined;
    for (let i = 0; i < 100; i++) {
      const { body } = await whopGet(key, "v1/memberships", { first: "100", status, ...(after ? { after } : {}) });
      for (const m of (body.data as Raw[] | undefined) ?? []) {
        const id = String(m.id ?? "");
        if (id && seen.has(id)) continue;
        seen.add(id);
        const price = money(m.renewal_price);
        const days = num(m.billing_period_days);
        if (!price || !days || days <= 0) continue; // accès unique ou gratuit : pas de récurrent
        const currency = String((m.renewal_price as Raw | undefined)?.currency ?? m.currency ?? "usd").toLowerCase();
        addSubscription(snap, currency, price, days, m.cancel_at_period_end === true || String(m.status) === "canceling");
      }
      const info = body.page_info as { has_next_page?: boolean; end_cursor?: string } | undefined;
      if (!info?.has_next_page || !info.end_cursor) break;
      after = info.end_cursor;
    }
  }
  return roundSubscriptions(snap);
}

/** Aperçu pour vérifier le format renvoyé par Whop (champs du premier paiement et sa lecture). */
export async function whopProbe(key: string) {
  let first: Raw | null = null;
  let count = 0;
  const version = await eachPayment(key, (p) => {
    count++;
    first ??= p;
  });
  let subscriptions: WhopSubscriptions | string;
  try {
    subscriptions = await whopSubscriptions(key);
  } catch (e) {
    subscriptions = e instanceof ConnectorError ? e.message : "Abonnements illisibles.";
  }
  return { version, count, fields: first ? Object.keys(first) : [], normalized: first ? normalize(first) : null, subscriptions };
}
