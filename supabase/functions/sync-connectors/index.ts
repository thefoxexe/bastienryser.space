// Chaque heure : synchronise tous les connecteurs (Stripe, Whop, Plausible, Search Console, Google Analytics)
// et les taux de change BCE (conversion des encaissements en CHF).

import { syncFxRates } from "../_shared/fx.ts";
import { adminClient, authorize, heartbeat, json } from "../_shared/supabase.ts";
import { syncConnector, type ConnectorRow } from "../_shared/sync.ts";

Deno.serve(async (req) => {
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);
  const db = adminClient();
  const { data } = await db.from("connectors").select("id, business_id, kind, label, config, credential_ref, status");

  const results = [];
  for (const c of (data ?? []) as ConnectorRow[]) results.push({ id: c.id, ...(await syncConnector(db, c)) });

  const fx = await syncFxRates(db);

  const failed = results.filter((r) => !r.ok).length;
  await heartbeat(db, "sync-connectors", failed === 0, `${results.length} connecteur(s), ${failed} en erreur${fx.ok ? "" : ` · ${fx.error}`}`);
  return json({ connectors: results.length, failed, results, fx });
});
