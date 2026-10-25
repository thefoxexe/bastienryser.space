// Lecture des chiffres réels chez Stripe et Plausible. Aucune estimation : seules les valeurs renvoyées sont gardées.

export class ConnectorError extends Error {
  constructor(message: string, public readonly authProblem = false) {
    super(message);
  }
}

export type DailyPoint = { metric: string; day: string; unit: string; value: number };

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
