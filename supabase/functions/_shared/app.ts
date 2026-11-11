// Connecteur « Application » : une application maison expose ses chiffres sur une fonction `panel-stats`
// (contrat version 1 : daily, totals, organizations ; voir integrations/cantia-panel-stats). Clé dans Vault.

import { ConnectorError, type DailyPoint } from "./connectors.ts";

export type AppStats = {
  version: number;
  app?: string;
  generated_at: string;
  daily: { day: string; metric: string; value: number }[];
  totals: Record<string, unknown>;
  organizations: Record<string, unknown>[];
};

export async function appFetch(url: string, key: string): Promise<AppStats> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new ConnectorError("L'application ne répond pas : vérifie l'adresse.", false, true);
  }
  if (res.status === 401 || res.status === 403) throw new ConnectorError("L'application refuse la clé : vérifie PANEL_STATS_KEY.", true);
  if (res.status === 404) throw new ConnectorError("Adresse introuvable : la fonction panel-stats est-elle déployée ?", true);
  if (!res.ok) throw new ConnectorError(`L'application a répondu ${res.status}.`, false, res.status >= 500);
  const body = (await res.json().catch(() => null)) as AppStats | null;
  if (!body || body.version !== 1 || !Array.isArray(body.daily)) throw new ConnectorError("Réponse inattendue de l'application (contrat version 1 attendu).");
  return body;
}

export async function appTest(url: string, key: string) {
  if (!/^https:\/\//.test(url)) throw new ConnectorError("L'adresse doit commencer par https://.");
  await appFetch(url, key);
}

/** Séries quotidiennes (métriques préfixées app_) et relevé du jour (totaux, entreprises). */
export async function appData(url: string, key: string): Promise<{ points: DailyPoint[]; snapshot: Record<string, unknown> }> {
  const stats = await appFetch(url, key);
  const points = stats.daily
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.day) && /^[a-z0-9_]{1,40}$/.test(p.metric) && Number.isFinite(Number(p.value)))
    .map((p) => ({ metric: `app_${p.metric}`, day: p.day, unit: "", value: Number(p.value) }));
  return { points, snapshot: { app: stats.app ?? null, generated_at: stats.generated_at, totals: stats.totals ?? {}, organizations: stats.organizations ?? [] } };
}
