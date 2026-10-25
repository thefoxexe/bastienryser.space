// TikTok (Login Kit + Content Posting API v2) : compte, publication de vidéo et statistiques.
// Tant que l'app n'a pas passé l'audit TikTok, la publication directe n'est permise que vers un compte privé :
// la vidéo part alors dans la boîte de réception TikTok du compte, à finaliser dans l'app.
import { env } from "./env.ts";
import { NetworkError } from "./errors.ts";

const API = "https://open.tiktokapis.com";

export const TIKTOK_SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.publish,video.upload,video.list";

type TikTokBody<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } };

function tiktokError(status: number, error: TikTokBody<unknown>["error"]): NetworkError {
  const code = error?.code ?? "";
  const detail = `TikTok ${status} ${code} : ${error?.message ?? "?"}`;
  if (code === "access_token_invalid" || code === "scope_not_authorized" || status === 401) {
    return new NetworkError("La connexion TikTok a expiré ou manque d'autorisations : reconnecte le compte.", false, true, detail);
  }
  if (code === "rate_limit_exceeded" || code === "spam_risk_too_many_posts" || status === 429) {
    return new NetworkError("TikTok limite temporairement les publications. Nouvel essai automatique.", true, false, detail);
  }
  if (status >= 500) return new NetworkError("TikTok ne répond pas correctement. Nouvel essai automatique.", true, false, detail);
  return new NetworkError(`TikTok a refusé la vidéo : ${error?.message ?? code ?? "erreur inconnue"}`, false, false, detail);
}

async function tt<T>(token: string, path: string, body?: unknown): Promise<{ status: number; json: TikTokBody<T> }> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json; charset=UTF-8" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as TikTokBody<T> };
}

async function ttOk<T>(token: string, path: string, body?: unknown): Promise<T> {
  const { status, json } = await tt<T>(token, path, body);
  if (status >= 400 || (json.error?.code && json.error.code !== "ok")) throw tiktokError(status, json.error);
  return json.data as T;
}

export type TikTokTokens = { access_token: string; refresh_token: string; open_id: string; expires_in: number; refresh_expires_in: number };

export async function tiktokToken(params: Record<string, string>): Promise<TikTokTokens> {
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), ...params }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.access_token) throw new NetworkError("TikTok refuse la connexion : reconnecte le compte.", false, true, JSON.stringify(body));
  return body as TikTokTokens;
}

export async function tiktokUser(token: string) {
  type User = { user: { open_id: string; display_name?: string; username?: string; avatar_url?: string; follower_count?: number } };
  const data = await ttOk<User>(token, "/v2/user/info/?fields=open_id,display_name,username,avatar_url,follower_count");
  return data.user;
}

export async function publishTikTok(token: string, caption: string, video: { bytes: Uint8Array<ArrayBuffer>; contentType: string }, username: string | null) {
  const size = video.bytes.byteLength;
  // Une seule tranche : autorisée jusqu'à 64 Mo (nos vidéos sont plafonnées plus bas).
  const source_info = { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 };

  const creator = await ttOk<{ privacy_level_options?: string[] }>(token, "/v2/post/publish/creator_info/query/", {});
  const options = creator.privacy_level_options ?? [];
  const privacy = options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : (options[0] ?? "SELF_ONLY");

  let inbox = false;
  let init = await tt<{ publish_id: string; upload_url: string }>(token, "/v2/post/publish/video/init/", {
    post_info: { title: caption, privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false },
    source_info,
  });
  if (init.json.error?.code === "unaudited_client_can_only_post_to_private_accounts") {
    inbox = true;
    init = await tt(token, "/v2/post/publish/inbox/video/init/", { source_info });
  }
  if (init.status >= 400 || (init.json.error?.code && init.json.error.code !== "ok") || !init.json.data) throw tiktokError(init.status, init.json.error);
  const { publish_id, upload_url } = init.json.data;

  const put = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": video.contentType, "Content-Length": String(size), "Content-Range": `bytes 0-${size - 1}/${size}` },
    body: video.bytes,
    signal: AbortSignal.timeout(130_000),
  });
  if (!put.ok) throw new NetworkError("TikTok n'a pas accepté le fichier vidéo.", put.status >= 500, false, `upload ${put.status}`);

  // Suivi du traitement (TikTok continue de son côté si on s'arrête avant la fin).
  type Status = { status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] };
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await ttOk<Status>(token, "/v2/post/publish/status/fetch/", { publish_id });
    if (s.status === "FAILED") throw new NetworkError(`TikTok n'a pas pu publier la vidéo (${s.fail_reason ?? "raison inconnue"}).`, false);
    if (s.status === "SEND_TO_USER_INBOX") return { externalId: publish_id, permalink: null, inbox: true };
    if (s.status === "PUBLISH_COMPLETE") {
      const postId = s.publicaly_available_post_id?.[0];
      return {
        externalId: postId ? String(postId) : publish_id,
        permalink: postId && username ? `https://www.tiktok.com/@${username}/video/${postId}` : null,
        inbox,
      };
    }
  }
  return { externalId: publish_id, permalink: null, inbox };
}

export async function tiktokStats(token: string, ids: string[]) {
  const out = new Map<string, { views?: number; likes?: number; comments?: number; shares?: number }>();
  for (let i = 0; i < ids.length; i += 20) {
    type Videos = { videos?: { id: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number }[] };
    const data = await ttOk<Videos>(token, "/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count", { filters: { video_ids: ids.slice(i, i + 20) } });
    for (const v of data.videos ?? []) out.set(String(v.id), { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count });
  }
  return out;
}
