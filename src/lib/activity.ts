import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function logActivity(
  supabase: SupabaseClient,
  entry: { business_id: string | null; kind: string; message: string; meta?: Record<string, unknown> },
) {
  await supabase.from("activity_log").insert({ ...entry, meta: entry.meta ?? {} });
}
