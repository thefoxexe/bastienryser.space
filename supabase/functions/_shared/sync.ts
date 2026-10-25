import type { SupabaseClient } from "@supabase/supabase-js";
import { ConnectorError, plausibleDaily, stripeDaily, type DailyPoint } from "./connectors.ts";
import { logActivity, readToken } from "./supabase.ts";

export type ConnectorRow = {
  id: string;
  business_id: string;
  kind: "stripe" | "plausible";
  label: string;
  config: { site_id?: string; base_url?: string };
  credential_ref: string | null;
  status: string;
};

/** Récupère les chiffres d'un connecteur et les enregistre. Met à jour son statut ; ne lève jamais. */
export async function syncConnector(db: SupabaseClient, c: ConnectorRow): Promise<{ ok: boolean; points: number; error?: string }> {
  try {
    const key = await readToken(db, c.credential_ref);
    if (!key) throw new ConnectorError("Clé absente : reconnecte ce connecteur.", true);

    let points: DailyPoint[];
    if (c.kind === "stripe") points = await stripeDaily(key);
    else points = await plausibleDaily(key, c.config.site_id ?? "", c.config.base_url ?? "https://plausible.io");

    if (points.length) {
      const now = new Date().toISOString();
      const { error } = await db.from("metric_points").upsert(
        points.map((p) => ({ connector_id: c.id, business_id: c.business_id, metric: p.metric, day: p.day, unit: p.unit, value: p.value, updated_at: now })),
        { onConflict: "connector_id,metric,day,unit" },
      );
      if (error) throw new ConnectorError("Enregistrement des chiffres impossible.");
    }

    await db.from("connectors").update({ status: "connected", last_error: null, last_sync_at: new Date().toISOString() }).eq("id", c.id);
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
