"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";
import { createClient } from "@/lib/supabase/server";

export type VeilleState = { ok?: boolean; error?: string; nonce?: number };
type EdgeResult = { ok?: boolean; error?: string; code?: string; message?: string };

const refresh = (slug: string) => revalidatePath(`/b/${slug}/veille`);

/** Message lisible : fonction absente chez Supabase, serveur muet, ou erreur renvoyée par la fonction. */
function edgeError(res: EdgeResult | null, fallback = "Telegram ne répond pas, réessaie.") {
  if (!res) return "Le serveur ne répond pas : réessaie dans un instant.";
  if (res.code === "NOT_FOUND" || /not found/i.test(res.message ?? "")) return "La fonction « veille » n'est pas encore déployée sur Supabase.";
  return res.error ?? fallback;
}

/** Le jeton part directement à l'Edge Function, qui le vérifie puis le range dans Vault. */
export async function connectTelegram(_prev: VeilleState, formData: FormData): Promise<VeilleState> {
  await requireAdmin();
  const slug = String(formData.get("slug"));
  const res = await callEdgeFunction<EdgeResult>("veille", { action: "telegram_connect", business_id: formData.get("businessId"), token: formData.get("token") }, 20_000);
  if (!res?.ok) return { error: edgeError(res) };
  refresh(slug);
  return { ok: true, nonce: Date.now() };
}

export type TelegramChat = { id: string; title: string; type: string; topics: { id: number; name: string }[] };

export async function findChats(businessId: string): Promise<{ chats?: TelegramChat[]; error?: string }> {
  await requireAdmin();
  const res = await callEdgeFunction<EdgeResult & { chats?: TelegramChat[] }>("veille", { action: "telegram_chats", business_id: businessId }, 20_000);
  if (!res?.ok) return { error: edgeError(res) };
  return { chats: res.chats ?? [] };
}

export async function setTarget(input: { businessId: string; slug: string; chatId: string; chatTitle: string; threadId: number | null }) {
  await requireAdmin();
  const res = await callEdgeFunction<EdgeResult>("veille", { action: "telegram_target", business_id: input.businessId, chat_id: input.chatId, chat_title: input.chatTitle, thread_id: input.threadId }, 15_000);
  refresh(input.slug);
  return res?.ok ? {} : { error: edgeError(res, "Enregistrement impossible.") };
}

export async function sendTest(businessId: string) {
  await requireAdmin();
  const res = await callEdgeFunction<EdgeResult>("veille", { action: "telegram_test", business_id: businessId }, 20_000);
  return res?.ok ? { ok: true } : { error: edgeError(res, "Envoi impossible.") };
}

/** Clé de la tâche GitHub : générée et rangée dans Vault par l'Edge Function, montrée une seule fois. */
export async function generateRunnerSecret(slug: string): Promise<{ secret?: string; error?: string }> {
  await requireAdmin();
  const res = await callEdgeFunction<EdgeResult & { secret?: string }>("veille", { action: "secret" }, 15_000);
  refresh(slug);
  return res?.ok && res.secret ? { secret: res.secret } : { error: edgeError(res, "Génération impossible.") };
}

const settingsSchema = z.object({
  businessId: z.string().uuid(),
  slug: z.string().min(1),
  instructions: z.string().max(2000, "Consignes trop longues (2000 caractères au plus)."),
});

export async function saveSettings(_prev: VeilleState, formData: FormData): Promise<VeilleState> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse({ businessId: formData.get("businessId"), slug: formData.get("slug"), instructions: formData.get("instructions") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const supabase = await createClient();
  const { error } = await supabase.from("veille_settings").upsert({
    business_id: parsed.data.businessId,
    instructions: parsed.data.instructions.trim(),
    disclaimer: formData.get("disclaimer") === "on",
    enabled: formData.get("enabled") === "on",
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "Enregistrement impossible." };
  refresh(parsed.data.slug);
  return { ok: true, nonce: Date.now() };
}

/** « @prisma_fx », « prisma_fx » ou un lien de profil TikTok → nom du compte. */
function handleOf(raw: string) {
  const s = raw.trim();
  const fromUrl = /tiktok\.com\/@([A-Za-z0-9._]+)/.exec(s)?.[1];
  const handle = (fromUrl ?? s).replace(/^@/, "");
  return /^[A-Za-z0-9._]{2,40}$/.test(handle) ? handle : null;
}

export async function addSource(_prev: VeilleState, formData: FormData): Promise<VeilleState> {
  await requireAdmin();
  const slug = String(formData.get("slug"));
  const handle = handleOf(String(formData.get("handle") ?? ""));
  if (!handle) return { error: "Indique un compte TikTok : @nom ou le lien du profil." };
  const supabase = await createClient();
  const { error } = await supabase.from("veille_sources").insert({ business_id: String(formData.get("businessId")), platform: "tiktok", handle });
  if (error) return { error: error.code === "23505" ? "Ce compte est déjà surveillé." : "Ajout impossible." };
  refresh(slug);
  return { ok: true, nonce: Date.now() };
}

export async function toggleSource(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("veille_sources").update({ enabled: formData.get("enabled") === "true" }).eq("id", String(formData.get("id")));
  refresh(String(formData.get("slug")));
}

export async function deleteSource(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("veille_sources").delete().eq("id", String(formData.get("id")));
  refresh(String(formData.get("slug")));
}

/** Lien TikTok à traiter au prochain passage de la tâche (dans l'heure). */
export async function queueLink(_prev: VeilleState, formData: FormData): Promise<VeilleState> {
  await requireAdmin();
  const slug = String(formData.get("slug"));
  const url = String(formData.get("url") ?? "").trim();
  if (!/^https:\/\/(www\.|vm\.|vt\.|m\.)?tiktok\.com\//.test(url)) return { error: "Colle un lien TikTok (tiktok.com ou vm.tiktok.com)." };
  const supabase = await createClient();
  const { error } = await supabase.from("veille_items").insert({ business_id: String(formData.get("businessId")), url, status: "queued" });
  if (error) return { error: "Ajout impossible." };
  refresh(slug);
  return { ok: true, nonce: Date.now() };
}

export async function retryItem(formData: FormData) {
  await requireAdmin();
  await callEdgeFunction("veille", { action: "retry", business_id: formData.get("businessId"), item_id: formData.get("id") }, 150_000);
  refresh(String(formData.get("slug")));
}

export async function deleteItem(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("veille_items").delete().eq("id", String(formData.get("id")));
  refresh(String(formData.get("slug")));
}
