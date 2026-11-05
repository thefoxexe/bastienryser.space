// Lecture des chiffres réels chez Stripe et Plausible. Aucune estimation : seules les valeurs renvoyées sont gardées.

export class ConnectorError extends Error {
  /** transient : refus passager du service (quota, surcharge), réglé au passage suivant sans rien faire. */
  constructor(message: string, public readonly authProblem = false, public readonly transient = false) {
    super(message);
  }
}

export type DailyPoint = { metric: string; day: string; unit: string; value: number };

/**
 * Abonnements en cours, ramenés à un mois (par devise).
 * monthly : facturés chaque mois (ou plus souvent), l'argent tombe vraiment chaque mois.
 * split : payés d'avance pour plusieurs mois (annuel, trimestriel…), répartis sur la période.
 */
export type SubscriptionsSnapshot = {
  mrr: Record<string, number>;
  mrr_monthly: Record<string, number>;
  mrr_split: Record<string, number>;
  subscribers: number;
  subscribers_monthly: number;
  subscribers_split: number;
  canceling: number;
  computed_at: string;
};

/** Ajoute un abonnement au relevé : `price` facturé toutes les `periodDays` jours. */
export function addSubscription(s: SubscriptionsSnapshot, currency: string, price: number, periodDays: number, canceling: boolean) {
  const monthly = (price * 365) / 12 / periodDays;
  const bucket = periodDays <= 31 ? "mrr_monthly" : "mrr_split";
  s.mrr[currency] = (s.mrr[currency] ?? 0) + monthly;
  s[bucket][currency] = (s[bucket][currency] ?? 0) + monthly;
  s.subscribers++;
  if (bucket === "mrr_monthly") s.subscribers_monthly++;
  else s.subscribers_split++;
  if (canceling) s.canceling++;
}

export function emptySubscriptions(): SubscriptionsSnapshot {
  return { mrr: {}, mrr_monthly: {}, mrr_split: {}, subscribers: 0, subscribers_monthly: 0, subscribers_split: 0, canceling: 0, computed_at: new Date().toISOString() };
}

export function roundSubscriptions(s: SubscriptionsSnapshot) {
  for (const k of ["mrr", "mrr_monthly", "mrr_split"] as const) for (const c of Object.keys(s[k])) s[k][c] = Math.round(s[k][c] * 100) / 100;
  return s;
}

/** Relevés quotidiens du MRR (total, part mensuelle, part répartie), gardés jour après jour. */
export function subscriptionPoints(s: SubscriptionsSnapshot, day: string): DailyPoint[] {
  const currencies = new Set([...Object.keys(s.mrr), ...Object.keys(s.mrr_monthly), ...Object.keys(s.mrr_split)]);
  return [...currencies].flatMap((unit) => [
    { metric: "mrr", day, unit, value: s.mrr[unit] ?? 0 },
    { metric: "mrr_monthly", day, unit, value: s.mrr_monthly[unit] ?? 0 },
    { metric: "mrr_split", day, unit, value: s.mrr_split[unit] ?? 0 },
  ]);
}

export const SUBSCRIPTION_METRICS = ["mrr", "mrr_monthly", "mrr_split"];

const dayInZurich = (unixSeconds: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unixSeconds * 1000));

// ---------------------------------------------------------------------------
// Stripe : paiements encaissés (montant capturé moins remboursé), par jour et par devise.
// ---------------------------------------------------------------------------

// Devises sans décimales chez Stripe (montants déjà en unités).
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

async function stripeGet(key: string, path: string, params: Record<string, string>) {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new ConnectorError("Clé Stripe refusée : vérifie qu'elle est valide et non révoquée.", true);
  if (res.status === 403) throw new ConnectorError(`La clé Stripe n'a pas le droit de lire « ${path} » (403).`, true);
  if (!res.ok) throw new ConnectorError(`Stripe a répondu ${res.status} : ${body?.error?.message ?? "erreur inconnue"}.`);
  return body;
}

export async function stripeTest(key: string) {
  if (!/^(rk|sk)_(live|test)_/.test(key)) throw new ConnectorError("Ce n'est pas une clé Stripe (elle commence par rk_ ou sk_).");
  try {
    await stripeGet(key, "balance_transactions", { limit: "1" });
  } catch (e) {
    if (!(e instanceof ConnectorError) || !e.message.includes("(403)")) throw e;
    try {
      await stripeGet(key, "charges", { limit: "1" });
    } catch {
      throw new ConnectorError("La clé Stripe doit pouvoir lire le solde (Balance : lecture) ou les paiements (Charges : lecture).", true);
    }
  }
}

const INTERVAL_DAYS: Record<string, number> = { day: 1, week: 7, month: 365 / 12, year: 365 };

/**
 * Abonnements Stripe en cours (actifs ou en retard de paiement), permission « Subscriptions : lecture ».
 * Montant de chaque ligne : prix unitaire × quantité, moins une réduction en pourcentage encore valable.
 */
export async function stripeSubscriptions(key: string): Promise<SubscriptionsSnapshot> {
  const snap = emptySubscriptions();
  for (const status of ["active", "past_due"]) {
    let startingAfter: string | undefined;
    for (let page = 0; page < 50; page++) {
      const params: Record<string, string> = { limit: "100", status };
      if (startingAfter) params.starting_after = startingAfter;
      let body;
      try {
        body = await stripeGet(key, "subscriptions", params);
      } catch (e) {
        if (e instanceof ConnectorError && e.authProblem) throw new ConnectorError("Ajoute le droit « Subscriptions : lecture » à la clé Stripe pour le MRR.", true);
        throw e;
      }
      for (const sub of body.data as Record<string, any>[]) {
        const coupon = sub.discount?.coupon;
        const percentOff = coupon && coupon.duration !== "once" && typeof coupon.percent_off === "number" ? coupon.percent_off : 0;
        for (const item of (sub.items?.data ?? []) as Record<string, any>[]) {
          const price = item.price ?? item.plan;
          const interval = price?.recurring?.interval ?? price?.interval;
          const count = Number(price?.recurring?.interval_count ?? price?.interval_count ?? 1);
          const unit = Number(price?.unit_amount ?? price?.amount);
          if (!interval || !INTERVAL_DAYS[interval] || !Number.isFinite(unit) || unit <= 0) continue;
          const currency = String(price.currency ?? "chf").toLowerCase();
          const amount = ((unit * Number(item.quantity ?? 1)) / (ZERO_DECIMAL.has(currency) ? 1 : 100)) * (1 - percentOff / 100);
          addSubscription(snap, currency, amount, INTERVAL_DAYS[interval] * count, sub.cancel_at_period_end === true);
        }
      }
      if (!body.has_more || !body.data.length) break;
      startingAfter = body.data[body.data.length - 1].id;
    }
  }
  return roundSubscriptions(snap);
}

/** Relevé anonyme des abonnements (aucun nom ni e-mail) : pour vérifier la lecture du MRR. */
export async function stripeSubscriptionsProbe(key: string) {
  const rows: Record<string, unknown>[] = [];
  for (const status of ["active", "past_due", "trialing"]) {
    let body;
    try {
      body = await stripeGet(key, "subscriptions", { limit: "100", status, "expand[]": "data.discounts" });
    } catch (e) {
      rows.push({ expand_error: e instanceof Error ? e.message : String(e) });
      body = await stripeGet(key, "subscriptions", { limit: "100", status });
    }
    for (const sub of body.data as Record<string, any>[]) {
      const inv = sub.latest_invoice;
      rows.push({
        status: sub.status,
        created: sub.created,
        trial_end: sub.trial_end,
        cancel_at_period_end: sub.cancel_at_period_end,
        collection_method: sub.collection_method,
        discount: sub.discount ? { percent_off: sub.discount.coupon?.percent_off, amount_off: sub.discount.coupon?.amount_off, duration: sub.discount.coupon?.duration } : null,
        discounts: Array.isArray(sub.discounts)
          ? sub.discounts.map((d: any) =>
              typeof d === "string"
                ? "id"
                : { end: d.end, coupon: d.coupon ? { percent_off: d.coupon.percent_off, amount_off: d.coupon.amount_off, duration: d.coupon.duration, months: d.coupon.duration_in_months } : null, source: d.source ? { type: d.source.type, coupon: typeof d.source.coupon } : null },
            )
          : null,
        items: (sub.items?.data ?? []).map((i: Record<string, any>) => ({
          interval: i.price?.recurring?.interval,
          count: i.price?.recurring?.interval_count,
          unit_amount: i.price?.unit_amount,
          currency: i.price?.currency,
          quantity: i.quantity,
          livemode: i.price?.livemode,
        })),
        latest_invoice: inv && typeof inv === "object" ? { total: inv.total, amount_paid: inv.amount_paid, status: inv.status, billing_reason: inv.billing_reason, discounts: inv.total_discount_amounts } : inv,
      });
    }
  }
  return rows;
}

/** Parcourt une liste Stripe page par page (100 éléments, 50 pages au plus). */
async function stripeList<T extends { id: string }>(key: string, path: string, since: number, each: (item: T) => void) {
  let startingAfter: string | undefined;
  for (let page = 0; page < 50; page++) {
    const params: Record<string, string> = { limit: "100", "created[gte]": String(since) };
    if (startingAfter) params.starting_after = startingAfter;
    const body = await stripeGet(key, path, params);
    for (const item of body.data as T[]) each(item);
    if (!body.has_more || !body.data.length) break;
    startingAfter = body.data[body.data.length - 1].id;
  }
}

/**
 * Chiffres Stripe par jour (heure de Zurich) et par devise :
 * - revenue : encaissé moins remboursé et litiges, à la date de chaque mouvement (peut être négatif) ;
 * - refunds : montant remboursé ; fees : frais Stripe ; payments : nombre de paiements.
 * Source : les transactions du solde (permission « Balance : lecture »). Sans elle, repli sur paiements + remboursements.
 */
export async function stripeDaily(key: string, days = 40): Promise<DailyPoint[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const totals = new Map<string, number>();
  const add = (metric: string, day: string, unit: string, v: number) => {
    if (!v) return;
    const k = `${metric}|${day}|${unit}`;
    totals.set(k, (totals.get(k) ?? 0) + v);
  };
  const units = (currency: string) => (ZERO_DECIMAL.has(currency) ? 1 : 100);

  try {
    type Txn = { id: string; created: number; currency: string; amount: number; fee: number; reporting_category: string };
    await stripeList<Txn>(key, "balance_transactions", since, (t) => {
      const day = dayInZurich(t.created);
      const f = units(t.currency);
      switch (t.reporting_category) {
        case "charge":
          add("revenue", day, t.currency, t.amount / f);
          add("payments", day, "", 1);
          break;
        case "refund":
        case "dispute":
        case "refund_failure":
        case "dispute_reversal":
          add("revenue", day, t.currency, t.amount / f);
          add("refunds", day, t.currency, -t.amount / f);
          break;
        case "fee":
          add("fees", day, t.currency, -t.amount / f);
          break;
        default:
          // Virements vers la banque, transferts, recharges : pas du chiffre d'affaires.
          return;
      }
      if (t.fee) add("fees", day, t.currency, t.fee / f);
    });
  } catch (e) {
    if (!(e instanceof ConnectorError) || !e.message.includes("(403)")) throw e;
    // Clé sans accès au solde : paiements à leur date, remboursements à la leur.
    totals.clear();
    type Charge = { id: string; created: number; currency: string; status: string; paid: boolean; amount_captured: number };
    await stripeList<Charge>(key, "charges", since, (c) => {
      if (c.status !== "succeeded" || !c.paid) return;
      const day = dayInZurich(c.created);
      add("revenue", day, c.currency, c.amount_captured / units(c.currency));
      add("payments", day, "", 1);
    });
    type Refund = { id: string; created: number; currency: string; amount: number; status: string };
    try {
      await stripeList<Refund>(key, "refunds", since, (r) => {
        if (r.status === "failed" || r.status === "canceled") return;
        const day = dayInZurich(r.created);
        add("revenue", day, r.currency, -r.amount / units(r.currency));
        add("refunds", day, r.currency, r.amount / units(r.currency));
      });
    } catch {
      // Sans accès aux remboursements non plus : les paiements seuls restent justes, le net peut être surestimé.
    }
  }

  return [...totals.entries()].map(([k, value]) => {
    const [metric, day, unit] = k.split("|");
    return { metric, day, unit, value: Math.round(value * 100) / 100 };
  });
}

// ---------------------------------------------------------------------------
// Plausible (Stats API v2) : visiteurs, visites et pages vues par jour.
// ---------------------------------------------------------------------------

async function plausibleQuery(key: string, baseUrl: string, body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v2/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new ConnectorError("Clé Plausible refusée : vérifie qu'elle est valide.", true);
  if (res.status === 404) throw new ConnectorError("Site introuvable sur Plausible : vérifie le domaine (site_id).");
  if (!res.ok) throw new ConnectorError(`Plausible a répondu ${res.status} : ${json?.error ?? "erreur inconnue"}.`);
  return json as { results: { metrics: number[]; dimensions: string[] }[] };
}

export async function plausibleTest(key: string, siteId: string, baseUrl: string) {
  if (!siteId) throw new ConnectorError("Indique le domaine du site tel qu'il apparaît dans Plausible.");
  await plausibleQuery(key, baseUrl, { site_id: siteId, metrics: ["visitors"], date_range: "day" });
}

export async function plausibleDaily(key: string, siteId: string, baseUrl: string, days = 40): Promise<DailyPoint[]> {
  const metrics = ["visitors", "visits", "pageviews"];
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const range = [iso(new Date(Date.now() - days * 86400_000)), iso(new Date())];
  const { results } = await plausibleQuery(key, baseUrl, { site_id: siteId, metrics, date_range: range, dimensions: ["time:day"] });
  return results.flatMap((r) =>
    metrics.map((metric, i) => ({ metric, day: String(r.dimensions[0]).slice(0, 10), unit: "", value: Number(r.metrics[i] ?? 0) })),
  );
}
