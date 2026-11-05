import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  ConnectorError,
  plausibleDaily,
  stripeDaily,
  stripeSubscriptionSpans,
  stripeSubscriptions,
  SUBSCRIPTION_METRICS,
  subscriptionHistory,
  subscriptionPoints,
  type DailyPoint,
  type SubscriptionsSnapshot,
} from "./connectors.ts";
import { analyticsData, googleAccessToken, searchConsoleData, searchConsoleQueries } from "./google.ts";
import { logActivity, readToken } from "./supabase.ts";
import { whopDaily, whopSubscriptionSpans, whopSubscriptions } from "./whop.ts";

export type ConnectorRow = {
  id: string;
  business_id: string;
  kind: "stripe" | "plausible" | "search_console" | "google_analytics" | "whop";
  label: string;
  config: { site_id?: string; base_url?: string; site_url?: string; property_id?: string; backfilled?: boolean; mrr_history_day?: string };
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

    // Premier passage : environ 13 mois d'historique (Whop : depuis toujours) ; ensuite les 40 derniers jours (corrections tardives comprises).
    const days = c.config.backfilled ? 40 : c.kind === "whop" ? 3650 : 400;
    let points: DailyPoint[];
    let snapshot: Record<string, unknown> | null = null;
    if (c.kind === "stripe" || c.kind === "whop") {
      points = c.kind === "stripe" ? await stripeDaily(key, days) : await whopDaily(key, days);
      // MRR du jour, gardé jour après jour (ni Stripe ni Whop ne fournissent son historique).
      // Sans le droit de lire les abonnements, les encaissements restent synchronisés.
      try {
        const subs: SubscriptionsSnapshot = c.kind === "stripe" ? await stripeSubscriptions(key) : await whopSubscriptions(key);
        snapshot = { ...subs };
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
        const rows = subscriptionPoints(subs, today).map((p) => ({ connector_id: c.id, business_id: c.business_id, ...p, updated_at: subs.computed_at }));
        // Un abonnement résilié fait disparaître sa devise : le relevé du jour est remplacé en entier.
        await db.from("metric_points").delete().eq("connector_id", c.id).eq("day", today).in("metric", SUBSCRIPTION_METRICS);
        if (rows.length) await db.from("metric_points").upsert(rows, { onConflict: "connector_id,metric,day,unit" });

        // Historique reconstitué depuis les abonnements (terminés compris), une fois par jour.
        if (c.config.mrr_history_day !== today) {
          const spans = c.kind === "stripe" ? await stripeSubscriptionSpans(key) : await whopSubscriptionSpans(key);
          const history = subscriptionHistory(spans).map((p) => ({ connector_id: c.id, business_id: c.business_id, ...p, updated_at: subs.computed_at }));
          for (let i = 0; i < history.length; i += 1000) {
            const { error } = await db.from("metric_points").upsert(history.slice(i, i + 1000), { onConflict: "connector_id,metric,day,unit" });
            if (error) throw new ConnectorError("Enregistrement de l'historique du MRR impossible.");
          }
          c.config = { ...c.config, mrr_history_day: today };
          await db.from("connectors").update({ config: c.config }).eq("id", c.id);
        }
      } catch (e) {
        snapshot = { mrr_error: e instanceof ConnectorError ? e.message : "Abonnements illisibles." };
      }
    } else if (c.kind === "plausible") points = await plausibleDaily(key, c.config.site_id ?? "", c.config.base_url ?? "https://plausible.io", days);
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
    let clear = db
      .from("metric_points")
      .delete()
      .eq("connector_id", c.id)
      .gte("day", c.kind === "stripe" || c.kind === "whop" ? since : (minDay ?? "9999-12-31"));
    // Le MRR est un relevé quotidien, pas un recalcul : on ne l'efface jamais.
    if (c.kind === "whop" || c.kind === "stripe") clear = clear.not("metric", "in", `(${SUBSCRIPTION_METRICS.join(",")})`);
    const { error: clearError } = await clear;
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
    // Refus passager (quota Google) : rien de cassé, le passage suivant reprend. Pas d'alerte ni de statut en erreur.
    if (e instanceof ConnectorError && e.transient) return { ok: false, points: 0, error: message };
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
