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
  if (res.status === 403) throw new ConnectorError("La clé Stripe n'a pas le droit de lire les paiements (Charges : lecture).", true);
  if (!res.ok) throw new ConnectorError(`Stripe a répondu ${res.status} : ${body?.error?.message ?? "erreur inconnue"}.`);
  return body;
}

export async function stripeTest(key: string) {
  if (!/^(rk|sk)_(live|test)_/.test(key)) throw new ConnectorError("Ce n'est pas une clé Stripe (elle commence par rk_ ou sk_).");
  await stripeGet(key, "charges", { limit: "1" });
}

export async function stripeDaily(key: string, days = 35): Promise<DailyPoint[]> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const totals = new Map<string, number>();
  const add = (metric: string, day: string, unit: string, v: number) => {
    const k = `${metric}|${day}|${unit}`;
    totals.set(k, (totals.get(k) ?? 0) + v);
  };

  let startingAfter: string | undefined;
  for (let page = 0; page < 50; page++) {
    const params: Record<string, string> = { limit: "100", "created[gte]": String(since) };
    if (startingAfter) params.starting_after = startingAfter;
    const body = await stripeGet(key, "charges", params);
    type Charge = { id: string; created: number; currency: string; status: string; paid: boolean; amount_captured: number; amount_refunded: number };
    for (const c of body.data as Charge[]) {
      if (c.status !== "succeeded" || !c.paid) continue;
      const factor = ZERO_DECIMAL.has(c.currency) ? 1 : 100;
      const day = dayInZurich(c.created);
      add("revenue", day, c.currency, (c.amount_captured - c.amount_refunded) / factor);
      add("payments", day, "", 1);
    }
    if (!body.has_more || !body.data.length) break;
    startingAfter = body.data[body.data.length - 1].id;
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

export async function plausibleDaily(key: string, siteId: string, baseUrl: string): Promise<DailyPoint[]> {
  const metrics = ["visitors", "visits", "pageviews"];
  const { results } = await plausibleQuery(key, baseUrl, { site_id: siteId, metrics, date_range: "30d", dimensions: ["time:day"] });
  return results.flatMap((r) =>
    metrics.map((metric, i) => ({ metric, day: String(r.dimensions[0]).slice(0, 10), unit: "", value: Number(r.metrics[i] ?? 0) })),
  );
}
