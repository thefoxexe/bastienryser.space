import type { SupabaseClient } from "@supabase/supabase-js";
import { storeToken } from "./supabase.ts";

export type AccountValues = {
  business_id: string;
  network: string;
  external_id: string;
  display_name: string;
  username?: string | null;
  avatar_url?: string | null;
  token: string;
  token_expires_at: string | null;
  refresh_token?: string | null;
  refresh_expires_at?: string | null;
  meta?: Record<string, unknown>;
};

/** Crée ou met à jour un compte connecté ; les tokens vont dans Vault. Renvoie true s'il existait déjà. */
export async function upsertAccount(db: SupabaseClient, values: AccountValues) {
  const { data: existing } = await db
    .from("social_accounts")
    .select("id, token_ref, refresh_token_ref, meta")
    .eq("business_id", values.business_id)
    .eq("network", values.network)
    .eq("external_id", values.external_id)
    .maybeSingle();

  const label = `${values.network}:${values.external_id}`;
  const tokenRef = await storeToken(db, values.token, label, existing?.token_ref);
  const refreshRef = values.refresh_token
    ? await storeToken(db, values.refresh_token, `${label}:refresh`, existing?.refresh_token_ref)
    : (existing?.refresh_token_ref ?? null);

  const row = {
    business_id: values.business_id,
    network: values.network,
    external_id: values.external_id,
    display_name: values.display_name,
    username: values.username ?? null,
    avatar_url: values.avatar_url ?? null,
    token_ref: tokenRef,
    token_expires_at: values.token_expires_at,
    refresh_token_ref: refreshRef,
    refresh_expires_at: values.refresh_expires_at ?? null,
    status: "connected",
    last_error: null,
    // Les réglages choisis dans le panel (ex. tableau Pinterest) survivent à une reconnexion.
    meta: { ...((existing?.meta as Record<string, unknown>) ?? {}), ...(values.meta ?? {}) },
    connected_at: new Date().toISOString(),
  };
  if (existing) await db.from("social_accounts").update(row).eq("id", existing.id);
  else await db.from("social_accounts").insert(row);
  return Boolean(existing);
}

export const inSeconds = (s: number | undefined | null) => (s ? new Date(Date.now() + s * 1000).toISOString() : null);
