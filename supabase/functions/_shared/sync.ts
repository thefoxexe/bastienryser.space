import type { SupabaseClient } from "@supabase/supabase-js";
import { ConnectorError, plausibleDaily, stripeDaily, type DailyPoint } from "./connectors.ts";
import { analyticsData, googleAccessToken, searchConsoleData } from "./google.ts";
import { logActivity, readToken } from "./supabase.ts";

export type ConnectorRow = {
  id: string;
  business_id: string;
  kind: "stripe" | "plausible" | "search_console" | "google_analytics";
  label: string;
  config: { site_id?: string; base_url?: string; site_url?: string; property_id?: string };
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

    let points: DailyPoint[];
    let snapshot: Record<string, unknown> | null = null;
    if (c.kind === "stripe") points = await stripeDaily(key);
    else if (c.kind === "plausible") points = await plausibleDaily(key, c.config.site_id ?? "", c.config.base_url ?? "https://plausible.io");
    else {
      const token = await googleAccessToken(key);
      const result = c.kind === "search_console" ? await searchConsoleData(token, c.config.site_url ?? "") : await analyticsData(token, c.config.property_id ?? "");
      points = result.points;
      snapshot = result.snapshot;
    }

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
      .update({ status: "connected", last_error: null, last_sync_at: new Date().toISOString(), ...(snapshot ? { snapshot } : {}) })
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
