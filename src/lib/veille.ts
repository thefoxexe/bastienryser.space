import "server-only";
import { createClient } from "@/lib/supabase/server";

export type VeilleSettings = {
  connected: boolean;
  bot_username: string | null;
  chat_id: string | null;
  chat_title: string | null;
  thread_id: number | null;
  instructions: string;
  filter: string;
  disclaimer: boolean;
  enabled: boolean;
};

export type VeilleSource = { id: string; handle: string; enabled: boolean; last_checked_at: string | null; last_error: string | null };

export type VeilleItem = {
  id: string;
  source_id: string | null;
  url: string;
  title: string | null;
  posted_at: string | null;
  status: "queued" | "seen" | "processing" | "sent" | "failed" | "skipped";
  category: string | null;
  transcript: string | null;
  message: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type VeilleRunner = { configured: boolean; last_run_at: string | null; last_ok: boolean | null; last_detail: string | null };

/** Réglages, comptes surveillés, 60 derniers éléments et état de la tâche GitHub. Le jeton du bot n'est jamais lu ici. */
export async function getVeille(businessId: string) {
  const supabase = await createClient();
  const [{ data: s }, { data: sources }, { data: items }, { data: runner }] = await Promise.all([
    supabase.from("veille_settings").select("telegram_ref, bot_username, chat_id, chat_title, thread_id, instructions, filter, disclaimer, enabled").eq("business_id", businessId).maybeSingle(),
    supabase.from("veille_sources").select("id, handle, enabled, last_checked_at, last_error").eq("business_id", businessId).order("created_at"),
    supabase
      .from("veille_items")
      .select("id, source_id, url, title, posted_at, status, category, transcript, message, error, created_at, sent_at")
      .eq("business_id", businessId)
      .neq("status", "seen")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("veille_runner").select("secret_ref, last_run_at, last_ok, last_detail").maybeSingle(),
  ]);
  const settings: VeilleSettings = {
    connected: !!s?.telegram_ref,
    bot_username: s?.bot_username ?? null,
    chat_id: s?.chat_id ?? null,
    chat_title: s?.chat_title ?? null,
    thread_id: s?.thread_id ?? null,
    instructions: s?.instructions ?? "",
    filter: s?.filter ?? "",
    disclaimer: s?.disclaimer ?? true,
    enabled: s?.enabled ?? true,
  };
  return {
    settings,
    sources: (sources ?? []) as VeilleSource[],
    items: (items ?? []) as VeilleItem[],
    runner: { configured: !!runner?.secret_ref, last_run_at: runner?.last_run_at ?? null, last_ok: runner?.last_ok ?? null, last_detail: runner?.last_detail ?? null } as VeilleRunner,
  };
}
