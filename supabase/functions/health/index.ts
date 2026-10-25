// Diagnostic pour la page « État du système » (admin uniquement).
// Indique quels secrets sont configurés, par oui ou non : aucune valeur n'est jamais renvoyée.

import { authorize, json } from "../_shared/supabase.ts";

const SECRETS = [
  "APP_URL",
  "CRON_SECRET",
  "META_APP_ID",
  "META_APP_SECRET",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_PAGE_CLIENT_ID",
  "LINKEDIN_PAGE_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "THREADS_APP_ID",
  "THREADS_APP_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "PINTEREST_APP_ID",
  "PINTEREST_APP_SECRET",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
] as const;

Deno.serve(async (req) => {
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);
  const secrets = Object.fromEntries(SECRETS.map((name) => [name, Boolean(Deno.env.get(name))]));
  return json({ ok: true, secrets, region: Deno.env.get("SB_REGION") ?? null });
});
