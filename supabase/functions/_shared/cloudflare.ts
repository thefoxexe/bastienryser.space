// Cloudflare Web Analytics (sans cookies, robots écartés par Cloudflare) via l'API GraphQL d'analytique.
// Jeton d'API avec le droit « Account Analytics : Read ». Un business suit un domaine et tous ses sous-domaines
// (cantia.ch, partner.cantia.ch…). Cloudflare compte des visites et des pages vues, pas de visiteurs uniques.

import { ConnectorError, type DailyPoint } from "./connectors.ts";

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

type Group = { count: number; sum: { visits: number }; dimensions: Record<string, string> };

async function cfQuery(token: string, query: string, variables: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ConnectorError("Cloudflare ne répond pas.", false, true);
  }
  if (res.status === 401 || res.status === 403) throw new ConnectorError("Cloudflare refuse le jeton : il lui faut le droit « Account Analytics : Read ».", true);
  if (res.status === 429) throw new ConnectorError("Cloudflare limite temporairement les demandes.", false, true);
  const body = (await res.json().catch(() => null)) as { data?: any; errors?: { message: string }[] } | null;
  if (body?.errors?.length) {
    const msg = body.errors.map((e) => e.message).join(" ; ");
    if (/auth|permission|not authorized|access/i.test(msg)) throw new ConnectorError("Cloudflare refuse le jeton ou l'identifiant de compte : vérifie le droit « Account Analytics : Read ».", true);
    throw new ConnectorError(`Cloudflare : ${msg.slice(0, 200)}`);
  }
  if (!res.ok || !body?.data) throw new ConnectorError(`Cloudflare a répondu ${res.status}.`, false, res.status >= 500);
  const accounts = body.data.viewer?.accounts;
  if (!Array.isArray(accounts) || !accounts.length) throw new ConnectorError("Compte Cloudflare introuvable : vérifie l'identifiant du compte.", true);
  return accounts[0] as Record<string, Group[]>;
}

const QUERY = `query ($account: String!, $from: Date!, $to: Date!, $limit: Int!) {
  viewer { accounts(filter: { accountTag: $account }) {
    days: rumPageloadEventsAdaptiveGroups(limit: $limit, filter: { date_geq: $from, date_leq: $to }, orderBy: [date_ASC]) {
      count sum { visits } dimensions { date requestHost }
    }
  } }
}`;

const DETAIL = `query ($account: String!, $from: Date!, $to: Date!) {
  viewer { accounts(filter: { accountTag: $account }) {
    pages: rumPageloadEventsAdaptiveGroups(limit: 500, filter: { date_geq: $from, date_leq: $to }, orderBy: [count_DESC]) {
      count sum { visits } dimensions { requestHost requestPath }
    }
    referrers: rumPageloadEventsAdaptiveGroups(limit: 300, filter: { date_geq: $from, date_leq: $to }, orderBy: [sum_visits_DESC]) {
      count sum { visits } dimensions { requestHost refererHost }
    }
    countries: rumPageloadEventsAdaptiveGroups(limit: 300, filter: { date_geq: $from, date_leq: $to }, orderBy: [sum_visits_DESC]) {
      count sum { visits } dimensions { requestHost countryName }
    }
    devices: rumPageloadEventsAdaptiveGroups(limit: 100, filter: { date_geq: $from, date_leq: $to }, orderBy: [sum_visits_DESC]) {
      count sum { visits } dimensions { requestHost deviceType }
    }
  } }
}`;

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Le domaine suivi et tous ses sous-domaines. */
const matches = (host: string, domain: string) => {
  const h = host.toLowerCase().replace(/^www\./, "");
  return h === domain || h.endsWith(`.${domain}`);
};
export const cleanDomain = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

export async function cloudflareTest(token: string, account: string, domain: string) {
  if (!/^[a-f0-9]{32}$/i.test(account)) throw new ConnectorError("L'identifiant du compte Cloudflare fait 32 caractères (page d'accueil du tableau de bord).");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new ConnectorError("Domaine invalide (ex. cantia.ch).");
  const today = new Date();
  await cfQuery(token, QUERY, { account, from: iso(new Date(today.getTime() - 86400_000)), to: iso(today), limit: 10 });
}

/** Visites et pages vues par jour (date UTC de Cloudflare), domaine et sous-domaines réunis ; détail des 30 derniers jours. */
export async function cloudflareData(token: string, account: string, domain: string, days: number): Promise<{ points: DailyPoint[]; snapshot: Record<string, unknown> }> {
  const visits = new Map<string, number>();
  const views = new Map<string, number>();
  const now = new Date();
  // Par tranches de 30 jours (limite de période de l'API).
  for (let back = 0; back < days; back += 30) {
    const to = new Date(now.getTime() - back * 86400_000);
    const from = new Date(now.getTime() - Math.min(days - 1, back + 29) * 86400_000);
    const acc = await cfQuery(token, QUERY, { account, from: iso(from), to: iso(to), limit: 10000 });
    for (const g of acc.days ?? []) {
      if (!matches(g.dimensions.requestHost ?? "", domain)) continue;
      const day = g.dimensions.date;
      visits.set(day, (visits.get(day) ?? 0) + (g.sum?.visits ?? 0));
      views.set(day, (views.get(day) ?? 0) + (g.count ?? 0));
    }
  }
  const points: DailyPoint[] = [...visits.keys()].flatMap((day) => [
    { metric: "cf_visits", day, unit: "", value: visits.get(day) ?? 0 },
    { metric: "cf_pageviews", day, unit: "", value: views.get(day) ?? 0 },
  ]);

  // Détail sur 30 jours : sous-domaines, pages, provenance, pays, appareils.
  const detail = await cfQuery(token, DETAIL, { account, from: iso(new Date(now.getTime() - 29 * 86400_000)), to: iso(now) });
  const own = (list: Group[] | undefined) => (list ?? []).filter((g) => matches(g.dimensions.requestHost ?? "", domain));
  const top = (list: Group[], key: (g: Group) => string, by: "visits" | "views", n: number) => {
    const m = new Map<string, number>();
    for (const g of list) m.set(key(g), (m.get(key(g)) ?? 0) + (by === "visits" ? (g.sum?.visits ?? 0) : (g.count ?? 0)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ key: k, value: v }));
  };
  const pages = own(detail.pages);
  const hosts = new Map<string, { visits: number; views: number }>();
  for (const g of pages) {
    const h = g.dimensions.requestHost.toLowerCase();
    const v = hosts.get(h) ?? { visits: 0, views: 0 };
    v.visits += g.sum?.visits ?? 0;
    v.views += g.count ?? 0;
    hosts.set(h, v);
  }
  return {
    points,
    snapshot: {
      period: "30 derniers jours",
      domain,
      hosts: [...hosts.entries()].sort((a, b) => b[1].visits - a[1].visits).map(([key, v]) => ({ key, ...v })),
      pages: top(pages, (g) => `${g.dimensions.requestHost}${g.dimensions.requestPath}`, "views", 20).map((p) => ({ key: p.key, views: p.value })),
      referrers: top(own(detail.referrers).filter((g) => g.dimensions.refererHost && !matches(g.dimensions.refererHost, domain)), (g) => g.dimensions.refererHost, "visits", 15),
      countries: top(own(detail.countries), (g) => g.dimensions.countryName || "Inconnu", "visits", 12),
      devices: top(own(detail.devices), (g) => g.dimensions.deviceType || "inconnu", "visits", 6),
    },
  };
}
