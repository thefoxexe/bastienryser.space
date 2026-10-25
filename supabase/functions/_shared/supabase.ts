import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publishableKey, secretKey, SUPABASE_URL } from "./env.ts";

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Autorise l'appel si :
 * - il vient de pg_cron avec le secret partagé (en-tête x-cron-secret), ou
 * - il porte la session d'un admin (vérifiée par is_admin(), double authentification comprise).
 */
export async function authorize(req: Request): Promise<boolean> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && timingSafeEqual(provided, cronSecret)) return true;

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const userClient = createClient(SUPABASE_URL, publishableKey(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.rpc("is_admin");
  return !error && data === true;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function readToken(db: SupabaseClient, ref: string | null): Promise<string | null> {
  if (!ref) return null;
  const { data, error } = await db.rpc("vault_read_token", { p_id: ref });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function storeToken(db: SupabaseClient, secret: string, name: string, existingRef?: string | null): Promise<string> {
  if (existingRef) {
    const { error } = await db.rpc("vault_update_token", { p_id: existingRef, p_secret: secret });
    if (error) throw error;
    return existingRef;
  }
  const { data, error } = await db.rpc("vault_store_token", { p_secret: secret, p_name: name });
  if (error) throw error;
  return data as string;
}

export async function logActivity(
  db: SupabaseClient,
  entry: { business_id: string | null; kind: string; message: string; meta?: Record<string, unknown> },
) {
  await db.from("activity_log").insert({ ...entry, meta: entry.meta ?? {} });
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
