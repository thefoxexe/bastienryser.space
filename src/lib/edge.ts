import "server-only";
import { createClient } from "@/lib/supabase/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Appelle une Edge Function avec la session de l'admin : la fonction vérifie elle-même is_admin().
 * Aucun token de réseau ni clé d'API stockée ne transite par le site Next.js.
 */
export async function callEdgeFunction<T = unknown>(name: string, body: unknown = {}, timeoutMs = 8000): Promise<T | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

/** Déclenche tout de suite `publish-due` (sinon pg_cron la lance dans la minute). */
export async function triggerPublishNow() {
  await callEdgeFunction("publish-due");
}
