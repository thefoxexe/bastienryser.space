import type { SupabaseClient } from "@supabase/supabase-js";
import { ConnectorError, plausibleDaily, stripeDaily, type DailyPoint } from "./connectors.ts";
import { analyticsData, googleAccessToken, searchConsoleData, searchConsoleQueries } from "./google.ts";
import { logActivity, readToken } from "./supabase.ts";

export type ConnectorRow = {
  id: string;
  business_id: string;
  kind: "stripe" | "plausible" | "search_console" | "google_analytics";
  label: string;
  config: { site_id?: string; base_url?: string; site_url?: string; property_id?: string; backfilled?: boolean };
  credential_ref: string | null;
  status: string;
};

/** Récupère les chiffres d'un connecteur et les enregistre. Met à jour son statut ; ne lève jamais. */
export async function syncConnector(db: SupabaseClient, c: ConnectorRow): Promise<{ ok: boolean; points: number; error?: string }> {
  try {
    const key = await readToken(db, c.credential_ref);
    if (!key) throw new ConnectorError("Clé absente : reconnecte ce connecteur.", true);

    // Compte Google connecté mais propriété pas encore choisie : rien à synchroniser.
    if (c.status === "pending") return { ok: true, points: 0 };

    // Premier passage : environ 13 mois d'historique ; ensuite les 40 derniers jours (corrections tardives comprises).
    const days = c.config.backfilled ? 40 : 400;
    let points: DailyPoint[];
    let snapshot: Record<string, unknown> | null = null;
    if (c.kind === "stripe") points = await stripeDaily(key, days);
    else if (c.kind === "plausible") points = await plausibleDaily(key, c.config.site_id ?? "", c.config.base_url ?? "https://plausible.io", days);
    else {
      const token = await googleAccessToken(key);
      const result =
        c.kind === "search_console" ? await searchConsoleData(token, c.config.site_url ?? "", days) : await analyticsData(token, c.config.property_id ?? "", days);
      points = result.points;
      snapshot = result.snapshot;
      if (c.kind === "search_console") await syncKeywords(db, c, token);
    }

    // La période synchronisée est remplacée en entier : un remboursement peut ramener un jour déjà compté à zéro.
    const since = new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10);
    const minDay = points.reduce<string | null>((m, p) => (m === null || p.day < m ? p.day : m), null);
    const { error: clearError } = await db
      .from("metric_points")
      .delete()
      .eq("connector_id", c.id)
      .gte("day", c.kind === "stripe" ? since : (minDay ?? "9999-12-31"));
    if (clearError) throw new ConnectorError("Mise à jour des chiffres impossible.");

    if (points.length) {
      const now = new Date().toISOString();
      const { error } = await db.from("metric_points").upsert(
        points.map((p) => ({ connector_id: c.id, business_id: c.business_id, metric: p.metric, day: p.day, unit: p.unit, value: p.value, updated_at: now })),
        { onConflict: "connector_id,metric,day,unit" },
      );
      if (error) throw new ConnectorError("Enregistrement des chiffres impossible.");
    }

    await db
      .from("connectors")
      .update({
        status: "connected",
        last_error: null,
        last_sync_at: new Date().toISOString(),
        ...(snapshot ? { snapshot } : {}),
        ...(c.config.backfilled ? {} : { config: { ...c.config, backfilled: true } }),
      })
      .eq("id", c.id);
    return { ok: true, points: points.length };
  } catch (e) {
    const message = e instanceof ConnectorError ? e.message : "Erreur inattendue pendant la synchronisation.";
    console.error("sync", c.id, e);
    if (c.status !== "error") {
      await logActivity(db, { business_id: c.business_id, kind: "connector.error", message: `${c.label} : ${message}` });
    }
    await db.from("connectors").update({ status: "error", last_error: message }).eq("id", c.id);
    return { ok: false, points: 0, error: message };
  }
}

/** Historique des mots-clés : 90 jours au premier passage, puis les 10 derniers jours (Google consolide avec retard). */
async function syncKeywords(db: SupabaseClient, c: ConnectorRow, token: string) {
  const { count } = await db.from("search_queries_daily").select("query", { count: "exact", head: true }).eq("connector_id", c.id);
  const { data: tracked } = await db.from("tracked_keywords").select("query").eq("business_id", c.business_id);
  const trackedQueries = (tracked ?? []).map((t) => t.query);
  const rows = await searchConsoleQueries(token, c.config.site_url ?? "", count ? 10 : 90, trackedQueries);

  // Mots-clés suivis récemment, sans historique : on remonte 90 jours pour eux.
  if (count && trackedQueries.length) {
    const { data: known } = await db.from("search_queries_daily").select("query").eq("connector_id", c.id).in("query", trackedQueries).limit(1000);
    const knownSet = new Set((known ?? []).map((k) => k.query));
    const fresh = trackedQueries.filter((q) => !knownSet.has(q));
    if (fresh.length) rows.push(...(await searchConsoleQueries(token, c.config.site_url ?? "", 90, fresh, true)));
  }

  // Une même requête peut revenir en double après normalisation (casse, espaces) : on agrège.
  const merged = new Map<string, { clicks: number; impressions: number; weighted: number }>();
  for (const r of rows) {
    const k = `${r.day}|${r.query}`;
    const m = merged.get(k) ?? { clicks: 0, impressions: 0, weighted: 0 };
    m.clicks += r.clicks;
    m.impressions += r.impressions;
    m.weighted += r.position * Math.max(r.impressions, 1);
    merged.set(k, m);
  }
  const records = [...merged.entries()].map(([k, m]) => {
    const [day, query] = k.split("|");
    return {
      connector_id: c.id,
      business_id: c.business_id,
      day,
      query,
      clicks: m.clicks,
      impressions: m.impressions,
      position: Math.round((m.weighted / Math.max(m.impressions, 1)) * 100) / 100,
    };
  });
  for (let i = 0; i < records.length; i += 1000) {
    const { error } = await db.from("search_queries_daily").upsert(records.slice(i, i + 1000), { onConflict: "connector_id,day,query" });
    if (error) throw new ConnectorError("Enregistrement des mots-clés impossible.");
  }
  // La Search Console garde 16 mois : on fait de même.
  await db.from("search_queries_daily").delete().eq("connector_id", c.id).lt("day", new Date(Date.now() - 486 * 86400_000).toISOString().slice(0, 10));
}
