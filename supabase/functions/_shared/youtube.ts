// YouTube Data API v3 : chaîne, envoi de vidéo (upload résumable) et statistiques.
import { NetworkError } from "./errors.ts";

const API = "https://www.googleapis.com/youtube/v3";

export const YOUTUBE_SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

function youtubeError(status: number, body: { error?: { message?: string; errors?: { reason?: string }[] } }): NetworkError {
  const reason = body.error?.errors?.[0]?.reason ?? "";
  const detail = `YouTube ${status} ${reason} : ${body.error?.message ?? "?"}`;
  if (status === 401) return new NetworkError("La connexion YouTube a expiré : reconnecte la chaîne.", false, true, detail);
  if (reason === "quotaExceeded" || reason === "uploadLimitExceeded") {
    return new NetworkError("Limite d'envoi YouTube atteinte pour aujourd'hui. Nouvel essai plus tard.", true, false, detail);
  }
  if (status === 403) return new NetworkError("YouTube refuse l'envoi (chaîne ou autorisation manquante).", false, true, detail);
  if (status >= 500) return new NetworkError("YouTube ne répond pas correctement. Nouvel essai automatique.", true, false, detail);
  return new NetworkError(`YouTube a refusé la vidéo : ${body.error?.message ?? "erreur inconnue"}`, false, false, detail);
}

async function yt<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw youtubeError(res.status, body);
  return body as T;
}

export async function youtubeChannel(token: string) {
  type Channels = { items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } }; statistics?: { subscriberCount?: string } }[] };
  const body = await yt<Channels>(token, "/channels?part=snippet,statistics&mine=true");
  const c = body.items?.[0];
  if (!c) return null;
  return {
    id: c.id,
    title: c.snippet.title,
    handle: c.snippet.customUrl?.replace(/^@/, "") ?? null,
    avatar: c.snippet.thumbnails?.default?.url ?? null,
    subscribers: c.statistics?.subscriberCount ? Number(c.statistics.subscriberCount) : null,
  };
}

/** Titre YouTube : celui du post, sinon la première ligne ; 100 caractères, sans < ni >. */
export function youtubeTitle(title: string | null | undefined, caption: string) {
  const raw = (title?.trim() || caption.split("\n").find((l) => l.trim()) || "Vidéo").replace(/[<>]/g, "");
  return [...raw].slice(0, 100).join("").trim();
}

export async function publishYouTube(token: string, video: { bytes: Uint8Array<ArrayBuffer>; contentType: string }, title: string, description: string) {
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(video.bytes.byteLength),
      "X-Upload-Content-Type": video.contentType,
    },
    body: JSON.stringify({
      snippet: { title, description: description.replace(/[<>]/g, ""), categoryId: "22" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!init.ok) throw youtubeError(init.status, await init.json().catch(() => ({})));
  const location = init.headers.get("location");
  if (!location) throw new NetworkError("YouTube n'a pas ouvert l'envoi.", true);

  const put = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": video.contentType, "Content-Length": String(video.bytes.byteLength) },
    body: video.bytes,
    signal: AbortSignal.timeout(130_000),
  });
  const body = await put.json().catch(() => ({}));
  if (!put.ok) throw youtubeError(put.status, body);
  const id = (body as { id?: string }).id;
  if (!id) throw new NetworkError("YouTube n'a pas renvoyé l'identifiant de la vidéo.", false);
  return { externalId: id, permalink: `https://www.youtube.com/watch?v=${id}` };
}

export async function youtubeStats(token: string, ids: string[]) {
  const out = new Map<string, { views?: number; likes?: number; comments?: number }>();
  for (let i = 0; i < ids.length; i += 50) {
    type Videos = { items?: { id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] };
    const body = await yt<Videos>(token, `/videos?part=statistics&id=${ids.slice(i, i + 50).join(",")}`);
    for (const v of body.items ?? []) {
      const s = v.statistics ?? {};
      out.set(v.id, {
        views: s.viewCount !== undefined ? Number(s.viewCount) : undefined,
        likes: s.likeCount !== undefined ? Number(s.likeCount) : undefined,
        comments: s.commentCount !== undefined ? Number(s.commentCount) : undefined,
      });
    }
  }
  return out;
}
