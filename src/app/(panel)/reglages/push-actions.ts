"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

/** Clé publique VAPID (créée au premier appel par l'Edge Function `push`). */
export async function getPushKey(): Promise<{ publicKey: string } | { error: string }> {
  await requireAdmin();
  const res = await callEdgeFunction<{ publicKey?: string; error?: string }>("push", { action: "key" }, 15000);
  if (res?.publicKey) return { publicKey: res.publicKey };
  return { error: res?.error ?? "La fonction push n'est pas encore déployée ou la migration pas appliquée." };
}

const Subscription = z.object({
  endpoint: z.string().url().startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export async function savePushSubscription(input: unknown, userAgent: string): Promise<Result> {
  await requireAdmin();
  const parsed = Subscription.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Abonnement invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    { endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, user_agent: userAgent.slice(0, 300), last_error: null },
    { onConflict: "endpoint" },
  );
  return error ? { ok: false, error: "Impossible d'enregistrer cet appareil." } : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

export async function sendTestPush(): Promise<{ sent: number; errors: string[] } | { error: string }> {
  await requireAdmin();
  const res = await callEdgeFunction<{ sent?: number; errors?: string[]; error?: string }>("push", { action: "test" }, 20000);
  return typeof res?.sent === "number" ? { sent: res.sent, errors: res.errors ?? [] } : { error: res?.error ?? "Envoi impossible." };
}
