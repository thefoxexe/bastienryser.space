import "server-only";
import { createClient } from "@/lib/supabase/server";
import { zurichDayKey } from "@/lib/format";
import { lastDays } from "@/lib/metrics";

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

export type VeilleStats = {
  sent: number;
  skipped: number;
  failed: number;
  sent30: number;
  /** Messages envoyés par jour (heure de Zurich), 30 derniers jours. */
  perDay: { day: string; value: number }[];
  latest: Pick<VeilleItem, "id" | "url" | "title" | "category" | "sent_at">[];
};

/** Chiffres réels de la veille : messages envoyés, vidéos filtrées, échecs. */
export async function veilleStats(businessId: string): Promise<VeilleStats> {
  const supabase = await createClient();
  const days = lastDays(30);
  const count = (status: VeilleItem["status"]) =>
    supabase.from("veille_items").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", status);
  const [sent, skipped, failed, { data: recent }, { data: latest }] = await Promise.all([
    count("sent"),
    count("skipped"),
    count("failed"),
    supabase
      .from("veille_items")
      .select("sent_at")
      .eq("business_id", businessId)
      .eq("status", "sent")
      .gte("sent_at", new Date(Date.now() - 32 * 86400_000).toISOString())
      .limit(1000),
    supabase
      .from("veille_items")
      .select("id, url, title, category, sent_at")
      .eq("business_id", businessId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(5),
  ]);
  const byDay = new Map<string, number>();
  for (const r of recent ?? []) {
    if (!r.sent_at) continue;
    const day = zurichDayKey(r.sent_at);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const perDay = days.map((day) => ({ day, value: byDay.get(day) ?? 0 }));
  return {
    sent: sent.count ?? 0,
    skipped: skipped.count ?? 0,
    failed: failed.count ?? 0,
    sent30: perDay.reduce((a, p) => a + p.value, 0),
    perDay,
    latest: (latest ?? []) as VeilleStats["latest"],
  };
}
