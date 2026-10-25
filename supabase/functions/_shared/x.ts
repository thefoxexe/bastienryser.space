// X (API v2, OAuth 2.0 avec PKCE) : compte, publication (texte + 4 images) et statistiques publiques.
// L'API X est payante à l'usage : chaque post publié et chaque lecture consomme des crédits du compte développeur.
import { env } from "./env.ts";
import { NetworkError } from "./errors.ts";

const API = "https://api.x.com/2";

export const X_SCOPES = "tweet.read tweet.write users.read media.write offline.access";

function xError(status: number, body: { title?: string; detail?: string; errors?: { message?: string }[] }): NetworkError {
  const message = body.detail ?? body.errors?.[0]?.message ?? body.title ?? "erreur inconnue";
  const detail = `X ${status} : ${message}`;
  if (status === 401) return new NetworkError("La connexion X a expiré : reconnecte le compte.", false, true, detail);
  if (status === 402) return new NetworkError("Crédits de l'API X épuisés : recharge le compte développeur X.", false, false, detail);
  if (status === 403) return new NetworkError(`X refuse la publication : ${message}`, false, status === 403 && /scope|permission|oauth/i.test(message), detail);
  if (status === 429) return new NetworkError("X limite temporairement les publications. Nouvel essai automatique.", true, false, detail);
  if (status >= 500) return new NetworkError("X ne répond pas correctement. Nouvel essai automatique.", true, false, detail);
  return new NetworkError(`X a refusé le post : ${message}`, false, false, detail);
}

async function xapi<T>(token: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw xError(res.status, json);
  return json as T;
}

export async function xToken(params: Record<string, string>) {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env("X_CLIENT_ID")}:${env("X_CLIENT_SECRET")}`)}`,
    },
    body: new URLSearchParams({ client_id: env("X_CLIENT_ID"), ...params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.access_token) throw new NetworkError("X refuse la connexion : reconnecte le compte.", false, true, JSON.stringify(body));
  return body as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function xMe(token: string) {
  type Me = { data: { id: string; name: string; username: string; profile_image_url?: string; public_metrics?: { followers_count?: number } } };
  return (await xapi<Me>(token, "/users/me?user.fields=profile_image_url,public_metrics")).data;
}

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function publishX(token: string, text: string, images: { bytes: Uint8Array<ArrayBuffer>; contentType: string }[], username: string | null) {
  const mediaIds: string[] = [];
  for (const img of images.slice(0, 4)) {
    const { data } = await xapi<{ data: { id: string } }>(token, "/media/upload", {
      media: base64(img.bytes),
      media_category: "tweet_image",
      media_type: img.contentType,
    });
    mediaIds.push(data.id);
  }
  const { data } = await xapi<{ data: { id: string } }>(token, "/tweets", { text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) });
  return { externalId: data.id, permalink: `https://x.com/${username ?? "i/web"}/status/${data.id}` };
}

export async function xStats(token: string, ids: string[]) {
  const out = new Map<string, { impressions?: number; likes?: number; replies?: number; reposts?: number; quotes?: number; bookmarks?: number }>();
  for (let i = 0; i < ids.length; i += 100) {
    type Tweets = { data?: { id: string; public_metrics?: Record<string, number> }[] };
    const body = await xapi<Tweets>(token, `/tweets?ids=${ids.slice(i, i + 100).join(",")}&tweet.fields=public_metrics`);
    for (const t of body.data ?? []) {
      const m = t.public_metrics ?? {};
      out.set(t.id, { impressions: m.impression_count, likes: m.like_count, replies: m.reply_count, reposts: m.retweet_count, quotes: m.quote_count, bookmarks: m.bookmark_count });
    }
  }
  return out;
}
