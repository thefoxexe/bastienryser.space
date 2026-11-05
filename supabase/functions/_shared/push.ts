// Envoi de notifications push à tous les appareils abonnés (clés VAPID : publique en base, privée dans Vault).

import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const SUBJECT = "https://bastienryser.space";

export async function vapidKeys(db: SupabaseClient) {
  const { data } = await db.from("push_config").select("public_key, private_key_ref").maybeSingle();
  if (data) {
    const { data: priv, error } = await db.rpc("vault_read_token", { p_id: data.private_key_ref });
    if (error || !priv) throw new Error("Clé privée VAPID introuvable dans le Vault.");
    return { publicKey: data.public_key as string, privateKey: priv as string };
  }
  const keys = webpush.generateVAPIDKeys();
  const { data: ref, error } = await db.rpc("vault_store_token", { p_secret: keys.privateKey, p_name: "vapid_private" });
  if (error) throw error;
  const { error: insertError } = await db.from("push_config").insert({ public_key: keys.publicKey, private_key_ref: ref });
  if (insertError) throw insertError;
  return keys;
}

export type Payload = { title: string; body: string; url: string; tag: string };

export async function sendAll(db: SupabaseClient, payload: Payload) {
  const keys = await vapidKeys(db);
  const { data: subs } = await db.from("push_subscriptions").select("endpoint, p256dh, auth");
  let sent = 0;
  const errors: string[] = [];
  for (const s of subs ?? []) {
    try {
      // Chiffrement et signature VAPID par web-push, envoi par fetch (plus fiable sous Deno que son client https).
      const request = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60 * 24,
      });
      const res = await fetch(request.endpoint, { method: request.method, headers: request.headers as Record<string, string>, body: new Uint8Array(request.body as Uint8Array) as BodyInit });
      if (!res.ok) throw { statusCode: res.status, body: await res.text() };
      await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString(), last_error: null }).eq("endpoint", s.endpoint);
      sent++;
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string };
      const detail = `${err.statusCode ?? "?"} ${err.body || err.message || String(e)}`.slice(0, 300);
      console.error("push send", s.endpoint.slice(0, 60), detail);
      errors.push(detail);
      // Seul 410 (Gone) signifie à coup sûr que l'appareil s'est désabonné.
      if (err.statusCode === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else await db.from("push_subscriptions").update({ last_error: detail }).eq("endpoint", s.endpoint);
    }
  }
  return { sent, total: (subs ?? []).length, errors };
}
