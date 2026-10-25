// Threads API (graph.threads.net) : profil, publication (texte, image, carrousel, vidéo) et statistiques.
import { env } from "./env.ts";
import { metaError, NetworkError } from "./errors.ts";

const API = "https://graph.threads.net/v1.0";

export const THREADS_SCOPES = "threads_basic,threads_content_publish,threads_manage_insights";

type Params = Record<string, string | number | boolean | undefined>;

async function th<T>(method: "GET" | "POST", path: string, token: string, params: Params = {}): Promise<T> {
  const url = new URL(`${API}/${path.replace(/^\//, "")}`);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) };
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) (method === "GET" ? url.searchParams : body).set(k, String(v));
  if (method === "POST") init.body = body;
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data as { error?: unknown }).error) throw metaError(res.status, data);
  return data as T;
}

/** Code → jeton court (1 h) → jeton long (60 jours). */
export async function threadsExchange(code: string, redirectUri: string) {
  const short = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("THREADS_APP_ID"),
      client_secret: env("THREADS_APP_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  }).then((r) => r.json());
  if (!short.access_token) throw new NetworkError("Échange du code Threads refusé.", false, true, JSON.stringify(short));
  const long = await fetch(
    "https://graph.threads.net/access_token?" +
      new URLSearchParams({ grant_type: "th_exchange_token", client_secret: env("THREADS_APP_SECRET"), access_token: short.access_token }),
  ).then((r) => r.json());
  return { token: (long.access_token ?? short.access_token) as string, expiresIn: (long.expires_in ?? 3600) as number };
}

/** Prolonge un jeton long de 60 jours (il doit avoir plus de 24 h et ne pas être expiré). */
export async function threadsRefresh(token: string) {
  const res = await fetch("https://graph.threads.net/refresh_access_token?" + new URLSearchParams({ grant_type: "th_refresh_token", access_token: token })).then((r) =>
    r.json(),
  );
  if (!res.access_token) throw new NetworkError("Renouvellement Threads refusé : reconnecte le compte.", false, true, JSON.stringify(res));
  return { token: res.access_token as string, expiresIn: res.expires_in as number };
}

export async function threadsProfile(token: string) {
  return th<{ id: string; username?: string; name?: string; threads_profile_picture_url?: string }>("GET", "me", token, {
    fields: "id,username,name,threads_profile_picture_url",
  });
}

async function waitReady(id: string, token: string, video: boolean) {
  for (let i = 0; i < (video ? 40 : 15); i++) {
    const { status, error_message } = await th<{ status?: string; error_message?: string }>("GET", id, token, { fields: "status,error_message" });
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") throw new NetworkError(`Threads n'a pas pu traiter le média (${error_message ?? status}).`, false);
    await new Promise((r) => setTimeout(r, i < 3 ? 1500 : 2500));
  }
  throw new NetworkError("Threads met trop de temps à traiter le média. Nouvel essai automatique.", true);
}

export async function publishThreads(userId: string, token: string, text: string, media: { images: string[]; video?: string }) {
  let creationId: string;
  if (media.video) {
    ({ id: creationId } = await th<{ id: string }>("POST", `${userId}/threads`, token, { media_type: "VIDEO", video_url: media.video, text }));
  } else if (media.images.length === 1) {
    ({ id: creationId } = await th<{ id: string }>("POST", `${userId}/threads`, token, { media_type: "IMAGE", image_url: media.images[0], text }));
  } else if (media.images.length > 1) {
    const children: string[] = [];
    for (const url of media.images.slice(0, 20)) {
      const { id } = await th<{ id: string }>("POST", `${userId}/threads`, token, { media_type: "IMAGE", image_url: url, is_carousel_item: true });
      children.push(id);
    }
    for (const c of children) await waitReady(c, token, false);
    ({ id: creationId } = await th<{ id: string }>("POST", `${userId}/threads`, token, { media_type: "CAROUSEL", children: children.join(","), text }));
  } else {
    ({ id: creationId } = await th<{ id: string }>("POST", `${userId}/threads`, token, { media_type: "TEXT", text }));
  }
  await waitReady(creationId, token, Boolean(media.video));
  const { id } = await th<{ id: string }>("POST", `${userId}/threads_publish`, token, { creation_id: creationId });
  let permalink: string | null = null;
  try {
    ({ permalink } = await th<{ permalink: string }>("GET", id, token, { fields: "permalink" }));
  } catch {
    permalink = null;
  }
  return { externalId: id, permalink };
}

type Insights = { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
const readInsights = (r: Insights) => {
  const out: Record<string, number> = {};
  for (const d of r.data ?? []) {
    const v = d.total_value?.value ?? d.values?.[d.values.length - 1]?.value;
    if (typeof v === "number") out[d.name] = v;
  }
  return out;
};

export async function threadsInsights(token: string, mediaId: string) {
  return readInsights(await th<Insights>("GET", `${mediaId}/insights`, token, { metric: "views,likes,replies,reposts,quotes" }));
}

export async function threadsFollowers(token: string, userId: string) {
  return readInsights(await th<Insights>("GET", `${userId}/threads_insights`, token, { metric: "followers_count" })).followers_count;
}
