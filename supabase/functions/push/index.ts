// Notifications push.
// - pg_cron (chaque lundi) : résumé de la semaine envoyé à tous les appareils abonnés.
// - Admin : { action: "key" } renvoie la clé publique VAPID (générée au premier appel, privée rangée dans le Vault),
//           { action: "test" } envoie une notification d'essai.
// Les chiffres viennent de metric_points et ledger_entries : jamais d'estimation.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAll, vapidKeys, type Payload } from "../_shared/push.ts";
import { adminClient, heartbeat, isAdminRequest, isCronRequest, json } from "../_shared/supabase.ts";

const day = (offset: number) => new Date(Date.now() - offset * 86400_000).toISOString().slice(0, 10);
const nf = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 });

/** Les 7 derniers jours comparés aux 7 précédents, tous business réunis. */
async function weeklySummary(db: SupabaseClient): Promise<Payload> {
  const { data: points } = await db
    .from("metric_points")
    .select("business_id, metric, day, value, unit")
    .in("metric", ["visitors", "ga_users", "search_clicks", "revenue"])
    .gte("day", day(17));
  const { data: entries } = await db.from("ledger_entries").select("day, kind, amount, currency").gte("day", day(7));
  const rows = (points ?? []).map((p) => ({ ...p, value: Number(p.value) }));
  const sum = (filter: (p: (typeof rows)[number]) => boolean) => rows.filter(filter).reduce((a, p) => a + p.value, 0);

  // Visiteurs : Plausible si le business l'a, sinon Analytics (jamais les deux).
  const plausible = new Set(rows.filter((p) => p.metric === "visitors").map((p) => p.business_id));
  const visit = (p: (typeof rows)[number]) => (p.metric === "visitors" || (p.metric === "ga_users" && !plausible.has(p.business_id)));
  const visitors = sum((p) => visit(p) && p.day >= day(7));
  const before = sum((p) => visit(p) && p.day >= day(14) && p.day < day(7));
  // Search Console : 2 à 3 jours de retard, on prend la dernière semaine livrée.
  const clicks = sum((p) => p.metric === "search_clicks" && p.day >= day(10) && p.day < day(3));
  const cashed =
    sum((p) => p.metric === "revenue" && p.unit === "chf" && p.day >= day(7)) +
    (entries ?? []).filter((e) => e.kind === "income" && e.currency === "chf").reduce((a, e) => a + Number(e.amount), 0);

  const parts: string[] = [];
  if (visitors || before) {
    const change = before ? Math.round(((visitors - before) / before) * 100) : null;
    parts.push(`${nf.format(visitors)} visiteurs${change !== null ? ` (${change >= 0 ? "+" : ""}${change} %)` : ""}`);
  }
  if (clicks) parts.push(`${nf.format(clicks)} clics Google`);
  if (cashed) parts.push(`${nf.format(cashed)} CHF encaissés`);
  return {
    title: "Ta semaine en bref",
    body: parts.length ? `${parts.join(", ")}. Viens voir le détail et le brief.` : "Ton point de la semaine est prêt : viens voir le brief.",
    url: "/",
    tag: "weekly",
  };
}

Deno.serve(async (req) => {
  const db = adminClient();
  const cron = await isCronRequest(req);
  if (!cron && !(await isAdminRequest(req))) return json({ error: "unauthorized" }, 401);
  const body = (await req.json().catch(() => ({}))) as { action?: string };

  try {
    if (!cron && body.action === "key") return json({ publicKey: (await vapidKeys(db)).publicKey });
    if (!cron && body.action === "test") {
      const result = await sendAll(db, { title: "Bastien's Space", body: "Les notifications fonctionnent. Rendez-vous lundi pour le résumé de la semaine.", url: "/", tag: "test" });
      return json(result);
    }
    const result = await sendAll(db, await weeklySummary(db));
    await heartbeat(db, "push", true, `${result.sent}/${result.total} appareil(s) notifié(s)`);
    return json(result);
  } catch (e) {
    console.error("push", e);
    if (cron) await heartbeat(db, "push", false, String((e as Error).message ?? e));
    return json({ error: (e as Error).message ?? "push failed" }, 500);
  }
});
