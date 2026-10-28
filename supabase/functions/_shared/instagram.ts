// Instagram API avec connexion Instagram (sans Page Facebook) : jetons et profil.
// La publication et les statistiques réutilisent le code Meta (meta.ts) avec la base graph.instagram.com.
import { env } from "./env.ts";
import { NetworkError } from "./errors.ts";

export const IG_GRAPH = "https://graph.instagram.com/v23.0";

export const IG_SCOPES = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights";

/** Compte connecté par Instagram directement (et non via une Page Facebook). */
export const isInstagramLogin = (meta: Record<string, unknown> | null | undefined) => meta?.via === "instagram_login";

/** Code → jeton court (1 h) → jeton long (60 jours). */
export async function igExchange(code: string, redirectUri: string) {
  const short = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("INSTAGRAM_APP_ID"),
      client_secret: env("INSTAGRAM_APP_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      // Instagram ajoute parfois « #_ » à la fin du code renvoyé.
      code: code.replace(/#_$/, ""),
    }),
  }).then((r) => r.json());
  if (!short.access_token) throw new NetworkError("Échange du code Instagram refusé.", false, true, JSON.stringify(short));
  const long = await fetch(
    "https://graph.instagram.com/access_token?" +
      new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: env("INSTAGRAM_APP_SECRET"), access_token: short.access_token }),
  ).then((r) => r.json());
  return { token: (long.access_token ?? short.access_token) as string, expiresIn: (long.expires_in ?? 3600) as number };
}

/** Prolonge un jeton long de 60 jours (il doit avoir plus de 24 h et ne pas être expiré). */
export async function igRefresh(token: string) {
  const res = await fetch("https://graph.instagram.com/refresh_access_token?" + new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })).then((r) =>
    r.json(),
  );
  if (!res.access_token) throw new NetworkError("Renouvellement Instagram refusé : reconnecte le compte.", false, true, JSON.stringify(res));
  return { token: res.access_token as string, expiresIn: res.expires_in as number };
}

export async function igProfile(token: string) {
  const res = await fetch(`${IG_GRAPH}/me?` + new URLSearchParams({ fields: "user_id,username,name,profile_picture_url,account_type", access_token: token })).then((r) =>
    r.json(),
  );
  if (!res.user_id) throw new NetworkError("Profil Instagram illisible.", false, true, JSON.stringify(res));
  return res as { user_id: string; username?: string; name?: string; profile_picture_url?: string; account_type?: string };
}
