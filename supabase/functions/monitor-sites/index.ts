// Toutes les 5 minutes : vérifie que chaque site des business répond, mesure le temps de réponse.
// Alerte (journal d'activité) après 2 échecs consécutifs, puis au retour en ligne.

import { adminClient, authorize, heartbeat, json, logActivity } from "../_shared/supabase.ts";

type Check = { business_id: string; url: string; ok: boolean; status_code: number | null; response_ms: number | null; error: string | null };

async function check(business_id: string, url: string): Promise<Check> {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "bastienryser-monitor/1.0 (+https://bastienryser.space)" },
      signal: AbortSignal.timeout(10_000),
    });
    await res.body?.cancel();
    const ms = Math.round(performance.now() - started);
    return { business_id, url, ok: res.status < 400, status_code: res.status, response_ms: ms, error: res.status < 400 ? null : `Réponse ${res.status}` };
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === "TimeoutError";
    return { business_id, url, ok: false, status_code: null, response_ms: null, error: timeout ? "Aucune réponse en 10 secondes" : "Connexion impossible" };
  }
}

Deno.serve(async (req) => {
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);
  const db = adminClient();

  const { data: businesses } = await db.from("businesses").select("id, name, websites").is("archived_at", null);
  const targets = (businesses ?? []).flatMap((b) => (b.websites as string[]).map((url) => ({ b, url })));
  const results = await Promise.all(targets.map(({ b, url }) => check(b.id, url)));

  for (const r of results) {
    // Les 2 mesures précédentes, pour ne prévenir qu'en cas de vraie panne (pas sur un raté isolé).
    const { data: previous } = await db
      .from("site_checks")
      .select("ok")
      .eq("business_id", r.business_id)
      .eq("url", r.url)
      .order("checked_at", { ascending: false })
      .limit(2);
    const [p1, p2] = previous ?? [];
    const name = businesses?.find((b) => b.id === r.business_id)?.name ?? "";
    const host = r.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!r.ok && p1 && !p1.ok && (!p2 || p2.ok)) {
      await logActivity(db, { business_id: r.business_id, kind: "site.down", message: `Site injoignable : ${host} (${name}) · ${r.error}`, meta: { url: r.url } });
    }
    if (r.ok && p1 && !p1.ok && p2 && !p2.ok) {
      await logActivity(db, { business_id: r.business_id, kind: "site.up", message: `Site de nouveau en ligne : ${host} (${name})`, meta: { url: r.url } });
    }
  }

  if (results.length) await db.from("site_checks").insert(results);
  // Historique gardé 95 jours.
  await db.from("site_checks").delete().lt("checked_at", new Date(Date.now() - 95 * 86400_000).toISOString());

  const down = results.filter((r) => !r.ok).length;
  await heartbeat(db, "monitor-sites", true, `${results.length} site(s) vérifié(s), ${down} injoignable(s)`);
  return json({ checked: results.length, down });
});
