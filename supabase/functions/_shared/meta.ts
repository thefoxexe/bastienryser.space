import { META_GRAPH } from "./env.ts";
import { metaError, NetworkError } from "./errors.ts";

type Params = Record<string, string | number | boolean | undefined>;

async function graph<T>(method: "GET" | "POST", path: string, token: string, params: Params = {}, jsonBody?: unknown, base = META_GRAPH): Promise<T> {
  const url = new URL(`${base}/${path.replace(/^\//, "")}`);
  const init: RequestInit = { method, signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${token}` } };
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  } else if (jsonBody !== undefined) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(jsonBody);
  } else {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
    init.body = body;
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data as { error?: unknown }).error) throw metaError(res.status, data);
  return data as T;
}

// `base` : graph.facebook.com (comptes connectés via Facebook) ou graph.instagram.com (connexion Instagram directe).
export const metaGet = <T>(path: string, token: string, params?: Params, base?: string) => graph<T>("GET", path, token, params, undefined, base);
export const metaPost = <T>(path: string, token: string, params?: Params, jsonBody?: unknown, base?: string) => graph<T>("POST", path, token, params, jsonBody, base);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Instagram (API Graph via Facebook Login) : conteneurs puis media_publish.
// ---------------------------------------------------------------------------

async function waitForContainer(containerId: string, token: string, video = false, base?: string) {
  for (let i = 0; i < (video ? 40 : 20); i++) {
    const { status_code } = await metaGet<{ status_code?: string }>(containerId, token, { fields: "status_code" }, base);
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new NetworkError("Instagram n'a pas pu traiter l'image (format ou ratio refusé).", false);
    }
    await sleep(i < 5 ? 1500 : 3000);
  }
  throw new NetworkError("Instagram met trop de temps à traiter les images. Nouvel essai automatique.", true);
}

export async function publishInstagram(igUserId: string, token: string, caption: string, imageUrls: string[], videoUrl?: string, base?: string) {
  if (!imageUrls.length && !videoUrl) throw new NetworkError("Instagram demande une image ou une vidéo.", false);
  let creationId: string;
  if (videoUrl) {
    // Vidéo : publiée en Reel, et aussi visible dans le fil.
    const { id } = await metaPost<{ id: string }>(`${igUserId}/media`, token, { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: true }, undefined, base);
    creationId = id;
  } else if (imageUrls.length === 1) {
    const { id } = await metaPost<{ id: string }>(`${igUserId}/media`, token, { image_url: imageUrls[0], caption }, undefined, base);
    creationId = id;
  } else {
    const children: string[] = [];
    for (const url of imageUrls.slice(0, 10)) {
      const { id } = await metaPost<{ id: string }>(`${igUserId}/media`, token, { image_url: url, is_carousel_item: true }, undefined, base);
      children.push(id);
    }
    for (const child of children) await waitForContainer(child, token, false, base);
    const { id } = await metaPost<{ id: string }>(`${igUserId}/media`, token, { media_type: "CAROUSEL", children: children.join(","), caption }, undefined, base);
    creationId = id;
  }
  await waitForContainer(creationId, token, Boolean(videoUrl), base);
  const { id: mediaId } = await metaPost<{ id: string }>(`${igUserId}/media_publish`, token, { creation_id: creationId }, undefined, base);

  // La publication est faite : un échec ici ne doit jamais provoquer de nouvel essai.
  let permalink: string | null = null;
  try {
    ({ permalink } = await metaGet<{ permalink: string }>(mediaId, token, { fields: "permalink" }, base));
  } catch {
    permalink = null;
  }
  return { externalId: mediaId, permalink };
}

// ---------------------------------------------------------------------------
// Page Facebook : photo simple, multi-photos (attached_media) ou texte.
// ---------------------------------------------------------------------------

export async function publishFacebook(pageId: string, token: string, message: string, imageUrls: string[], videoUrl?: string) {
  let postId: string;
  if (videoUrl) {
    ({ id: postId } = await metaPost<{ id: string }>(`${pageId}/videos`, token, { file_url: videoUrl, description: message }));
  } else if (imageUrls.length === 0) {
    ({ id: postId } = await metaPost<{ id: string }>(`${pageId}/feed`, token, { message }));
  } else if (imageUrls.length === 1) {
    const res = await metaPost<{ id: string; post_id?: string }>(`${pageId}/photos`, token, { url: imageUrls[0], caption: message, published: true });
    postId = res.post_id ?? res.id;
  } else {
    const photoIds: string[] = [];
    for (const url of imageUrls) {
      const { id } = await metaPost<{ id: string }>(`${pageId}/photos`, token, { url, published: false });
      photoIds.push(id);
    }
    ({ id: postId } = await metaPost<{ id: string }>(`${pageId}/feed`, token, undefined, {
      message,
      attached_media: photoIds.map((id) => ({ media_fbid: id })),
    }));
  }
  let permalink: string | null = null;
  try {
    ({ permalink_url: permalink } = await metaGet<{ permalink_url: string }>(postId, token, { fields: "permalink_url" }));
    // Les vidéos renvoient un chemin relatif.
    if (permalink?.startsWith("/")) permalink = `https://www.facebook.com${permalink}`;
  } catch {
    permalink = null;
  }
  return { externalId: postId, permalink };
}

// ---------------------------------------------------------------------------
// Statistiques : chaque métrique est demandée seule si la requête groupée échoue,
// pour ne garder que les chiffres que l'API fournit vraiment.
// ---------------------------------------------------------------------------

export async function insightsValues(objectId: string, token: string, metrics: string[], extra: Params = {}, base?: string): Promise<Record<string, number>> {
  type Insight = { data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] };
  const read = (r: Insight) => {
    const out: Record<string, number> = {};
    for (const d of r.data) {
      const v = d.total_value?.value ?? d.values?.[d.values.length - 1]?.value;
      if (typeof v === "number") out[d.name] = v;
    }
    return out;
  };
  try {
    return read(await metaGet<Insight>(`${objectId}/insights`, token, { metric: metrics.join(","), ...extra }, base));
  } catch {
    const out: Record<string, number> = {};
    for (const m of metrics) {
      try {
        Object.assign(out, read(await metaGet<Insight>(`${objectId}/insights`, token, { metric: m, ...extra }, base)));
      } catch {
        // Métrique non disponible pour ce type de média : on n'invente rien.
      }
    }
    return out;
  }
}
