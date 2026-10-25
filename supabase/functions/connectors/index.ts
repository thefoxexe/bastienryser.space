// Branchement d'un connecteur par l'admin : la clé est testée, chiffrée dans Vault, puis une première synchronisation est lancée.
// La clé n'est jamais renvoyée ni journalisée.
//   POST { action: "connect", business_id, kind, api_key, site_id?, base_url? }
//   POST { action: "sync", connector_id }
//   POST { action: "configure", connector_id, choice }   (choix du site Search Console ou de la propriété GA4)
//   POST { action: "bluesky", business_id, identifier, password }   (compte Bluesky, par mot de passe d'application)

import { upsertAccount } from "../_shared/accounts.ts";
import { blueskyProfile, blueskySession } from "../_shared/bluesky.ts";
import { ConnectorError, plausibleTest, stripeTest } from "../_shared/connectors.ts";
import { NetworkError } from "../_shared/errors.ts";
import { adminClient, isAdminRequest, json, logActivity, storeToken } from "../_shared/supabase.ts";
import { syncConnector, type ConnectorRow } from "../_shared/sync.ts";

const LABELS = { stripe: "Stripe", plausible: "Plausible" } as const;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await isAdminRequest(req))) return json({ error: "unauthorized" }, 401);
  const db = adminClient();
  const body = await req.json().catch(() => ({}));

  if (body.action === "sync") {
    const { data: c } = await db.from("connectors").select("id, business_id, kind, label, config, credential_ref, status").eq("id", body.connector_id).maybeSingle();
    if (!c) return json({ ok: false, error: "Connecteur introuvable." }, 404);
    const result = await syncConnector(db, c as ConnectorRow);
    return json(result.ok ? { ok: true, points: result.points } : { ok: false, error: result.error });
  }

  if (body.action === "configure") {
    const { data: c } = await db.from("connectors").select("id, business_id, kind, label, config, credential_ref, status").eq("id", body.connector_id).maybeSingle();
    if (!c) return json({ ok: false, error: "Connecteur introuvable." }, 404);
    const options = ((c.config as { options?: { value: string; label: string }[] }).options ?? []);
    const choice = options.find((o) => o.value === body.choice);
    if (!choice) return json({ ok: false, error: "Choix invalide." }, 400);
    const config = c.kind === "search_console" ? { ...c.config, site_url: choice.value } : { ...c.config, property_id: choice.value };
    const label = `${c.kind === "search_console" ? "Search Console" : "Google Analytics"} · ${choice.label}`;
    const { data: saved } = await db
      .from("connectors")
      .update({ config, label, status: "connected", last_error: null })
      .eq("id", c.id)
      .select("id, business_id, kind, label, config, credential_ref, status")
      .single();
    const result = await syncConnector(db, saved as ConnectorRow);
    return json(result.ok ? { ok: true, points: result.points } : { ok: true, warning: result.error });
  }

  if (body.action === "bluesky") {
    const identifier = String(body.identifier ?? "").trim().replace(/^@/, "");
    const password = String(body.password ?? "").trim();
    if (!identifier || !password) return json({ ok: false, error: "Indique ton identifiant et un mot de passe d'application." }, 400);
    const { data: business } = await db.from("businesses").select("id, name").eq("id", body.business_id).maybeSingle();
    if (!business) return json({ ok: false, error: "Business introuvable." }, 404);
    try {
      const session = await blueskySession({ identifier, password });
      const profile = await blueskyProfile(session.did).catch(() => null);
      const renewed = await upsertAccount(db, {
        business_id: business.id,
        network: "bluesky",
        external_id: session.did,
        display_name: profile?.displayName || session.handle,
        username: session.handle,
        avatar_url: profile?.avatar ?? null,
        // Identifiant + mot de passe d'application, chiffrés dans Vault : une session est ouverte à chaque publication.
        token: JSON.stringify({ identifier, password }),
        token_expires_at: null,
      });
      await logActivity(db, {
        business_id: business.id,
        kind: renewed ? "account.refreshed" : "account.connected",
        message: renewed ? `Connexion Bluesky renouvelée : @${session.handle}` : `Compte Bluesky connecté : @${session.handle} (${business.name})`,
      });
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: e instanceof NetworkError ? e.message : "Connexion à Bluesky impossible." });
    }
  }

  if (body.action !== "connect") return json({ ok: false, error: "Action inconnue." }, 400);

  const kind = body.kind as keyof typeof LABELS;
  const apiKey = String(body.api_key ?? "").trim();
  const siteId = String(body.site_id ?? "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const baseUrl = String(body.base_url ?? "").trim() || "https://plausible.io";
  if (!(kind in LABELS)) return json({ ok: false, error: "Ce connecteur se branche avec « Connecter avec Google »." }, 400);
  if (!apiKey) return json({ ok: false, error: "Colle la clé d'API." }, 400);
  if (kind === "plausible" && !URL.canParse(baseUrl)) return json({ ok: false, error: "Adresse Plausible invalide." }, 400);

  const { data: business } = await db.from("businesses").select("id, name").eq("id", body.business_id).maybeSingle();
  if (!business) return json({ ok: false, error: "Business introuvable." }, 404);

  try {
    if (kind === "stripe") await stripeTest(apiKey);
    else await plausibleTest(apiKey, siteId, baseUrl);
  } catch (e) {
    return json({ ok: false, error: e instanceof ConnectorError ? e.message : "Test de connexion impossible." });
  }

  const { data: existing } = await db.from("connectors").select("id, credential_ref").eq("business_id", business.id).eq("kind", kind).maybeSingle();
  const credentialRef = await storeToken(db, apiKey, `connector:${kind}:${business.id}`, existing?.credential_ref);
  const label = kind === "plausible" ? `Plausible · ${siteId}` : LABELS[kind];
  const row = {
    business_id: business.id,
    kind,
    label,
    config: kind === "plausible" ? { site_id: siteId, base_url: baseUrl } : {},
    credential_ref: credentialRef,
    status: "connected",
    last_error: null,
  };
  const { data: saved, error } = existing
    ? await db.from("connectors").update(row).eq("id", existing.id).select("id, business_id, kind, label, config, credential_ref, status").single()
    : await db.from("connectors").insert(row).select("id, business_id, kind, label, config, credential_ref, status").single();
  if (error || !saved) return json({ ok: false, error: "Enregistrement du connecteur impossible." }, 500);

  await logActivity(db, {
    business_id: business.id,
    kind: existing ? "connector.refreshed" : "connector.connected",
    message: `${existing ? "Connecteur mis à jour" : "Connecteur ajouté"} : ${label} (${business.name})`,
  });

  const first = await syncConnector(db, saved as ConnectorRow);
  return json(first.ok ? { ok: true, points: first.points } : { ok: true, warning: first.error });
});
