// Google Search Console et Google Analytics 4 (Data API) via OAuth.
// Seules les valeurs renvoyées par Google sont gardées.

import { ConnectorError, type DailyPoint } from "./connectors.ts";
import { env } from "./env.ts";

export const GOOGLE_SCOPES = {
  search_console: "https://www.googleapis.com/auth/webmasters.readonly",
  google_analytics: "https://www.googleapis.com/auth/analytics.readonly",
} as const;

export type GoogleKind = keyof typeof GOOGLE_SCOPES;

/** Échange le refresh token contre un jeton d'accès valable une heure. */
export async function googleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new ConnectorError(
      body.error === "invalid_grant"
        ? "La connexion Google a expiré ou a été révoquée : reconnecte le compte (et vérifie que l'app Google est « En production »)."
        : "Google refuse de renouveler la connexion.",
      true,
    );
  }
  return body.access_token as string;
}

async function google<T>(token: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new ConnectorError("Connexion Google refusée : reconnecte le compte.", true);
  if (res.status === 403) {
    const reason = json?.error?.message ?? "";
    throw new ConnectorError(
      /has not been used|is disabled/i.test(reason)
        ? "L'API Google n'est pas activée dans le projet Google Cloud (Search Console API / Analytics Data API)."
        : "Ce compte Google n'a pas accès à cette propriété.",
      true,
    );
  }
  if (!res.ok) throw new ConnectorError(`Google a répondu ${res.status} : ${json?.error?.message ?? "erreur inconnue"}.`);
  return json as T;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Search Console
// ---------------------------------------------------------------------------

export async function listSearchConsoleSites(token: string): Promise<string[]> {
  const body = await google<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(token, "https://www.googleapis.com/webmasters/v3/sites");
  return (body.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl).sort();
}

type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function gscQuery(token: string, siteUrl: string, body: Record<string, unknown>) {
  const res = await google<{ rows?: GscRow[] }>(
    token,
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    body,
  );
  return res.rows ?? [];
}

export async function searchConsoleData(token: string, siteUrl: string, days = 40) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const range = { startDate: isoDay(start), endDate: isoDay(end) };
  const last28 = { startDate: isoDay(new Date(end.getTime() - 28 * 86400_000)), endDate: isoDay(end) };

  const [daily, queries, pages] = await Promise.all([
    gscQuery(token, siteUrl, { ...range, dimensions: ["date"], rowLimit: 1000 }),
    gscQuery(token, siteUrl, { ...last28, dimensions: ["query"], rowLimit: 10 }),
    gscQuery(token, siteUrl, { ...last28, dimensions: ["page"], rowLimit: 10 }),
  ]);

  // Google omet les jours sans donnée ; la Search Console a 2 à 3 jours de décalage.
  const points: DailyPoint[] = daily.flatMap((r) => [
    { metric: "search_clicks", day: r.keys[0], unit: "", value: r.clicks },
    { metric: "search_impressions", day: r.keys[0], unit: "", value: r.impressions },
    { metric: "search_position", day: r.keys[0], unit: "", value: Math.round(r.position * 10) / 10 },
  ]);
  const row = (r: GscRow) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 });
  return { points, snapshot: { period: "28 jours", queries: queries.map(row), pages: pages.map(row) } };
}

// ---------------------------------------------------------------------------
// Google Analytics 4
// ---------------------------------------------------------------------------

export async function listAnalyticsProperties(token: string): Promise<{ id: string; name: string }[]> {
  type Summaries = { accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[] };
  const body = await google<Summaries>(token, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
  return (body.accountSummaries ?? []).flatMap((a) =>
    (a.propertySummaries ?? []).map((p) => ({ id: p.property.replace("properties/", ""), name: `${p.displayName} (${a.displayName})` })),
  );
}

type Ga4Report = { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };

async function ga4Report(token: string, propertyId: string, body: Record<string, unknown>) {
  const res = await google<Ga4Report>(token, `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, body);
  return res.rows ?? [];
}

export async function analyticsData(token: string, propertyId: string, days = 40) {
  const range = [{ startDate: `${days}daysAgo`, endDate: "today" }];
  const last30 = [{ startDate: "30daysAgo", endDate: "today" }];
  const [daily, pages, channels] = await Promise.all([
    ga4Report(token, propertyId, { dateRanges: range, dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }] }),
    ga4Report(token, propertyId, { dateRanges: last30, dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], limit: 10, orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }] }),
    ga4Report(token, propertyId, { dateRanges: last30, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], limit: 8, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
  ]);

  const day = (v: string) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  const points: DailyPoint[] = daily.flatMap((r) => [
    { metric: "ga_users", day: day(r.dimensionValues[0].value), unit: "", value: Number(r.metricValues[0].value) },
    { metric: "ga_sessions", day: day(r.dimensionValues[0].value), unit: "", value: Number(r.metricValues[1].value) },
    { metric: "ga_pageviews", day: day(r.dimensionValues[0].value), unit: "", value: Number(r.metricValues[2].value) },
  ]);
  return {
    points,
    snapshot: {
      period: "30 jours",
      pages: pages.map((r) => ({ key: r.dimensionValues[0].value, views: Number(r.metricValues[0].value) })),
      channels: channels.map((r) => ({ key: r.dimensionValues[0].value, sessions: Number(r.metricValues[0].value) })),
    },
  };
}

// ---------------------------------------------------------------------------
// Historique par mot-clé (Search Console) : une ligne par jour et par requête.
// ---------------------------------------------------------------------------

export type QueryDay = { day: string; query: string; clicks: number; impressions: number; position: number };

/**
 * Récupère clics, impressions et position par jour et par requête sur `days` jours (pagination jusqu'à 100 000 lignes),
 * puis complète avec les mots-clés suivis absents du résultat (Google ne renvoie que les requêtes les plus vues).
 */
export async function searchConsoleQueries(token: string, siteUrl: string, days: number, tracked: string[], onlyTracked = false): Promise<QueryDay[]> {
  const end = new Date();
  const range = { startDate: isoDay(new Date(end.getTime() - days * 86400_000)), endDate: isoDay(end) };
  const rows: QueryDay[] = [];
  const toRow = (r: GscRow, query?: string): QueryDay => ({
    day: r.keys[0],
    query: (query ?? r.keys[1]).toLowerCase().trim(),
    clicks: r.clicks,
    impressions: r.impressions,
    position: Math.round(r.position * 100) / 100,
  });

  for (let page = 0; page < (onlyTracked ? 0 : 4); page++) {
    const batch = await gscQuery(token, siteUrl, { ...range, dimensions: ["date", "query"], rowLimit: 25000, startRow: page * 25000 });
    rows.push(...batch.map((r) => toRow(r)));
    if (batch.length < 25000) break;
  }

  const seen = new Set(rows.map((r) => r.query));
  for (const q of tracked.filter((t) => !seen.has(t)).slice(0, 50)) {
    const batch = await gscQuery(token, siteUrl, {
      ...range,
      dimensions: ["date"],
      dimensionFilterGroups: [{ filters: [{ dimension: "query", operator: "equals", expression: q }] }],
      rowLimit: 1000,
    });
    rows.push(...batch.map((r) => toRow(r, q)));
  }
  return rows;
}
