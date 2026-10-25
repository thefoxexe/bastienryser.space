// Tâche quotidienne : renouvelle les tokens qui le permettent et met à jour les statuts.
// - LinkedIn : renouvellement par refresh token quand LinkedIn en fournit un (sinon reconnexion manuelle).
// - Meta : les jetons de Page n'expirent pas, mais l'accès aux données doit être réautorisé
//   environ tous les 90 jours ; on vérifie le jeton et on prévient 7 jours avant.

import { env, META_GRAPH, optionalEnv } from "../_shared/env.ts";
import { adminClient, authorize, heartbeat, json, logActivity, readToken, storeToken } from "../_shared/supabase.ts";

const DAY = 86400_000;

Deno.serve(async (req) => {
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);
  const db = adminClient();
  const { data: accounts } = await db
    .from("social_accounts")
    .select("id, business_id, network, display_name, token_ref, token_expires_at, refresh_token_ref, refresh_expires_at, status");

  const report: { id: string; result: string }[] = [];
  for (const a of accounts ?? []) {
    try {
      const expiresAt = a.token_expires_at ? new Date(a.token_expires_at).getTime() : null;
      const soon = expiresAt !== null && expiresAt - Date.now() < 10 * DAY;

      if ((a.network === "linkedin" || a.network === "linkedin_page") && soon && a.refresh_token_ref) {
        const refresh = await readToken(db, a.refresh_token_ref);
        const pageApp = a.network === "linkedin_page" && optionalEnv("LINKEDIN_PAGE_CLIENT_ID");
        const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refresh ?? "",
            client_id: pageApp ? env("LINKEDIN_PAGE_CLIENT_ID") : env("LINKEDIN_CLIENT_ID"),
            client_secret: pageApp ? env("LINKEDIN_PAGE_CLIENT_SECRET") : env("LINKEDIN_CLIENT_SECRET"),
          }),
        }).then((r) => r.json());
        if (res.access_token) {
          await storeToken(db, res.access_token, `${a.network}:${a.id}`, a.token_ref);
          if (res.refresh_token) await storeToken(db, res.refresh_token, `${a.network}:${a.id}:refresh`, a.refresh_token_ref);
          await db
            .from("social_accounts")
            .update({
              token_expires_at: new Date(Date.now() + res.expires_in * 1000).toISOString(),
              refresh_expires_at: res.refresh_token_expires_in ? new Date(Date.now() + res.refresh_token_expires_in * 1000).toISOString() : a.refresh_expires_at,
              status: "connected",
              last_error: null,
            })
            .eq("id", a.id);
          await logActivity(db, { business_id: a.business_id, kind: "account.refreshed", message: `Connexion LinkedIn renouvelée : ${a.display_name}` });
          report.push({ id: a.id, result: "refreshed" });
          continue;
        }
        await db.from("social_accounts").update({ status: "error", last_error: "Renouvellement refusé par LinkedIn : reconnecte le compte." }).eq("id", a.id);
        await logActivity(db, { business_id: a.business_id, kind: "account.refresh_failed", message: `Échec du renouvellement LinkedIn : ${a.display_name}` });
        report.push({ id: a.id, result: "refresh_failed" });
        continue;
      }

      if (a.network === "instagram" || a.network === "facebook") {
        const token = await readToken(db, a.token_ref);
        const info = await fetch(
          `${META_GRAPH}/debug_token?` + new URLSearchParams({ input_token: token ?? "", access_token: `${env("META_APP_ID")}|${env("META_APP_SECRET")}` }),
        ).then((r) => r.json());
        const d = info.data ?? {};
        if (d.is_valid === false) {
          await db.from("social_accounts").update({ status: "expired", last_error: "Meta a invalidé la connexion : reconnecte le compte." }).eq("id", a.id);
          await logActivity(db, { business_id: a.business_id, kind: "account.expired", message: `Connexion ${a.network === "instagram" ? "Instagram" : "Facebook"} expirée : ${a.display_name}` });
          report.push({ id: a.id, result: "expired" });
          continue;
        }
        const ts = [d.expires_at, d.data_access_expires_at].filter((v: number) => typeof v === "number" && v > 0);
        if (ts.length) {
          await db.from("social_accounts").update({ token_expires_at: new Date(Math.min(...ts) * 1000).toISOString() }).eq("id", a.id);
        }
      }

      // Statut d'après l'échéance (pour tous les réseaux).
      const { data: fresh } = await db.from("social_accounts").select("token_expires_at, status").eq("id", a.id).single();
      const exp = fresh?.token_expires_at ? new Date(fresh.token_expires_at).getTime() : null;
      let status = fresh?.status ?? a.status;
      if (exp !== null && exp < Date.now()) status = "expired";
      else if (exp !== null && exp - Date.now() < 7 * DAY) status = "expiring";
      else if (status === "expiring" || status === "expired") status = "connected";
      if (status !== fresh?.status) await db.from("social_accounts").update({ status }).eq("id", a.id);
      report.push({ id: a.id, result: status });
    } catch (e) {
      console.error("refresh", a.id, e);
      report.push({ id: a.id, result: "error" });
    }
  }
  const errors = report.filter((r) => r.result === "error" || r.result === "refresh_failed").length;
  await heartbeat(db, "refresh-tokens", errors === 0, `${report.length} compte(s) vérifié(s), ${errors} problème(s)`);
  return json({ accounts: report.length, report });
});
