import "server-only";
import { createClient } from "@/lib/supabase/server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Déclenche tout de suite l'edge function `publish-due` (sinon pg_cron la lance dans la minute).
 * On transmet le jeton de session de l'admin : la fonction vérifie elle-même is_admin().
 * Aucun token de réseau ne transite par ici.
 */
export async function triggerPublishNow() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/publish-due`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Pas grave : la tâche programmée prendra le relais dans la minute.
  }
}
