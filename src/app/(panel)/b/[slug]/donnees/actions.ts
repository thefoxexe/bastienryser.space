"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { callEdgeFunction } from "@/lib/edge";
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
