"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";
import { supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ConnectState = { ok?: boolean; error?: string; warning?: string };

/**
 * Transmet la clé à l'Edge Function `connectors`, qui la teste puis la chiffre dans Vault.
 * La clé n'est ni stockée ni journalisée par le site Next.js.
 */
export async function connectConnector(_prev: ConnectState, formData: FormData): Promise<ConnectState> {
  await requireAdmin();
  const slug = String(formData.get("slug"));
  const res = await callEdgeFunction<{ ok: boolean; error?: string; warning?: string }>(
    "connectors",
    {
      action: "connect",
      business_id: formData.get("businessId"),
      kind: formData.get("kind"),
      api_key: formData.get("apiKey"),
      site_id: formData.get("siteId"),
      base_url: formData.get("baseUrl"),
    },
    45_000,
  );
  if (!res) return { error: "Le serveur ne répond pas. Réessaie dans un instant." };
  if (!res.ok) return { error: res.error ?? "Connexion impossible." };
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
  return { ok: true, warning: res.warning };
}

export async function syncConnectorNow(formData: FormData) {
  await requireAdmin();
  await callEdgeFunction("connectors", { action: "sync", connector_id: formData.get("connectorId") }, 45_000);
  revalidatePath(`/b/${formData.get("slug")}`, "layout");
}

export async function disconnectConnector(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("connectors").select("id, business_id, label").eq("id", formData.get("connectorId")).single();
  if (!data) return;
  // La suppression efface aussi la clé du Vault (trigger) et les chiffres associés.
  await supabase.from("connectors").delete().eq("id", data.id);
  await logActivity(supabase, { business_id: data.business_id, kind: "connector.disconnected", message: `Connecteur retiré : ${data.label}` });
  revalidatePath(`/b/${formData.get("slug")}`, "layout");
  revalidatePath("/");
}

/** « Connecter avec Google » : flux OAuth officiel, géré par l'Edge Function `oauth` (refresh token chiffré dans Vault). */
export async function startGoogleConnect(formData: FormData) {
  await requireAdmin();
  const kind = formData.get("kind") === "google_analytics" ? "google_analytics" : "search_console";
  const supabase = await createClient();
  const state = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("oauth_states").insert({ state, business_id: formData.get("businessId"), provider: "google", context: { kind } });
  if (error) throw new Error("Impossible de démarrer la connexion Google.");
  redirect(`${supabaseUrl}/functions/v1/oauth/start?state=${encodeURIComponent(state)}`);
}

/** Choix du site Search Console ou de la propriété GA4 quand le compte Google en a plusieurs. */
export async function configureConnector(_prev: ConnectState, formData: FormData): Promise<ConnectState> {
  await requireAdmin();
  const res = await callEdgeFunction<{ ok: boolean; error?: string; warning?: string }>(
    "connectors",
    { action: "configure", connector_id: formData.get("connectorId"), choice: formData.get("choice") },
    45_000,
  );
  if (!res) return { error: "Le serveur ne répond pas. Réessaie dans un instant." };
  if (!res.ok) return { error: res.error ?? "Enregistrement impossible." };
  revalidatePath(`/b/${formData.get("slug")}`, "layout");
  return { ok: true, warning: res.warning };
}

/** Ajoute un mot-clé suivi, puis lance une synchronisation pour récupérer ses 90 jours d'historique. */
export async function trackKeyword(formData: FormData) {
  await requireAdmin();
  const query = String(formData.get("query") ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 200);
  const businessId = String(formData.get("businessId"));
  if (!query) return;
  const supabase = await createClient();
  await supabase.from("tracked_keywords").upsert({ business_id: businessId, query }, { onConflict: "business_id,query", ignoreDuplicates: true });
  const { data: gsc } = await supabase.from("connectors").select("id").eq("business_id", businessId).eq("kind", "search_console").eq("status", "connected").maybeSingle();
  if (gsc) await callEdgeFunction("connectors", { action: "sync", connector_id: gsc.id }, 45_000);
  revalidatePath(`/b/${formData.get("slug")}`, "layout");
}

export async function untrackKeyword(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("tracked_keywords").delete().eq("business_id", String(formData.get("businessId"))).eq("query", String(formData.get("query")));
  revalidatePath(`/b/${formData.get("slug")}`, "layout");
}
