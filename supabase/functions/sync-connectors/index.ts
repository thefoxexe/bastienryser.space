// Chaque heure : synchronise tous les connecteurs (Stripe, Plausible, Search Console, Google Analytics).

import { adminClient, authorize, heartbeat, json } from "../_shared/supabase.ts";
import { syncConnector, type ConnectorRow } from "../_shared/sync.ts";

Deno.serve(async (req) => {
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);
  const db = adminClient();
  const { data } = await db.from("connectors").select("id, business_id, kind, label, config, credential_ref, status");

  const results = [];
  for (const c of (data ?? []) as ConnectorRow[]) results.push({ id: c.id, ...(await syncConnector(db, c)) });

  const failed = results.filter((r) => !r.ok).length;
  await heartbeat(db, "sync-connectors", failed === 0, `${results.length} connecteur(s), ${failed} en erreur`);
  return json({ connectors: results.length, failed, results });
});
