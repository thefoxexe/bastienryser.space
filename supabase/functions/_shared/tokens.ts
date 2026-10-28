// Jeton d'accès valide pour un compte connecté, renouvelé (et réenregistré dans Vault) quand il arrive à échéance.
import type { SupabaseClient } from "@supabase/supabase-js";
import { inSeconds } from "./accounts.ts";
import { blueskySession, type BlueskyCredentials, type BlueskySession } from "./bluesky.ts";
import { NetworkError } from "./errors.ts";
import { googleAccessToken } from "./google.ts";
import { igRefresh, isInstagramLogin } from "./instagram.ts";
import { ConnectorError } from "./connectors.ts";
import { pinterestToken } from "./pinterest.ts";
import { readToken, storeToken } from "./supabase.ts";
import { threadsRefresh } from "./threads.ts";
import { tiktokToken } from "./tiktok.ts";
import { xToken } from "./x.ts";

export type AccountRow = {
  id: string;
  business_id: string;
  network: string;
  display_name: string;
  username: string | null;
  external_id: string;
  token_ref: string | null;
  token_expires_at: string | null;
  refresh_token_ref: string | null;
  refresh_expires_at: string | null;
  meta: Record<string, unknown>;
  status: string;
};

export const ACCOUNT_COLUMNS =
  "id, business_id, network, display_name, username, external_id, token_ref, token_expires_at, refresh_token_ref, refresh_expires_at, meta, status";

const soon = (iso: string | null, ms: number) => iso !== null && new Date(iso).getTime() - Date.now() < ms;

async function save(db: SupabaseClient, a: AccountRow, access: string, expiresIn: number, refresh?: string | null, refreshExpiresIn?: number | null) {
  await storeToken(db, access, `${a.network}:${a.external_id}`, a.token_ref);
  const refreshRef = refresh ? await storeToken(db, refresh, `${a.network}:${a.external_id}:refresh`, a.refresh_token_ref) : a.refresh_token_ref;
  const patch = {
    token_expires_at: inSeconds(expiresIn),
    refresh_token_ref: refreshRef,
    ...(refreshExpiresIn ? { refresh_expires_at: inSeconds(refreshExpiresIn) } : {}),
    status: "connected",
    last_error: null,
  };
  await db.from("social_accounts").update(patch).eq("id", a.id);
  Object.assign(a, patch);
}

/** Jeton prêt à l'emploi. Lève une NetworkError « problème de connexion » si le réseau refuse le renouvellement. */
export async function accessToken(db: SupabaseClient, a: AccountRow): Promise<string> {
  const token = await readToken(db, a.token_ref);
  if (!token) throw new NetworkError("Aucun token pour ce compte : reconnecte-le.", false, true);

  switch (a.network) {
    // YouTube : le token stocké est le refresh token Google ; on demande un jeton d'une heure à chaque usage.
    case "youtube":
      try {
        return await googleAccessToken(token);
      } catch (e) {
        throw new NetworkError(e instanceof ConnectorError ? e.message : "Google refuse la connexion YouTube.", false, true, String(e));
      }
    case "tiktok":
    case "x":
    case "pinterest": {
      const margin = a.network === "pinterest" ? 86400_000 : 5 * 60_000;
      if (!soon(a.token_expires_at, margin)) return token;
      const refresh = await readToken(db, a.refresh_token_ref);
      if (!refresh) throw new NetworkError("Connexion expirée : reconnecte le compte.", false, true);
      if (a.network === "tiktok") {
        const t = await tiktokToken({ grant_type: "refresh_token", refresh_token: refresh });
        await save(db, a, t.access_token, t.expires_in, t.refresh_token, t.refresh_expires_in);
        return t.access_token;
      }
      if (a.network === "x") {
        const t = await xToken({ grant_type: "refresh_token", refresh_token: refresh });
        await save(db, a, t.access_token, t.expires_in, t.refresh_token ?? null);
        return t.access_token;
      }
      const t = await pinterestToken({ grant_type: "refresh_token", refresh_token: refresh });
      await save(db, a, t.access_token, t.expires_in, t.refresh_token ?? null, t.refresh_token_expires_in ?? null);
      return t.access_token;
    }
    case "instagram": {
      // Connexion via une Page Facebook : jeton de Page, sans renouvellement nécessaire.
      if (!isInstagramLogin(a.meta)) return token;
      // Connexion Instagram directe : jeton long de 60 jours, prolongé dès qu'il reste moins d'une semaine.
      if (!soon(a.token_expires_at, 7 * 86400_000)) return token;
      try {
        const t = await igRefresh(token);
        await save(db, a, t.token, t.expiresIn);
        return t.token;
      } catch (e) {
        if (a.token_expires_at && new Date(a.token_expires_at).getTime() > Date.now()) return token;
        throw e;
      }
    }
    case "threads": {
      // Jeton long de 60 jours, prolongé dès qu'il reste moins d'une semaine.
      if (!soon(a.token_expires_at, 7 * 86400_000)) return token;
      try {
        const t = await threadsRefresh(token);
        await save(db, a, t.token, t.expiresIn);
        return t.token;
      } catch (e) {
        if (a.token_expires_at && new Date(a.token_expires_at).getTime() > Date.now()) return token;
        throw e;
      }
    }
    default:
      return token;
  }
}

/** Bluesky : le « token » stocké est l'identifiant et le mot de passe d'application ; on ouvre une session à chaque usage. */
export async function blueskyFor(db: SupabaseClient, a: AccountRow): Promise<BlueskySession> {
  const raw = await readToken(db, a.token_ref);
  if (!raw) throw new NetworkError("Identifiants Bluesky absents : reconnecte le compte.", false, true);
  return blueskySession(JSON.parse(raw) as BlueskyCredentials);
}
