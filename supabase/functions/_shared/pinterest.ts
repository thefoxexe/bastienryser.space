// Pinterest API v5 : compte, tableaux, création d'épingles et statistiques.
// En accès « Trial », les épingles créées ne sont visibles que par leur auteur : l'accès « Standard » lève cette limite.
import { env } from "./env.ts";
import { NetworkError } from "./errors.ts";

const API = "https://api.pinterest.com/v5";

export const PINTEREST_SCOPES = "boards:read,pins:read,pins:write,user_accounts:read";

function pinterestError(status: number, body: { code?: number; message?: string }): NetworkError {
  const detail = `Pinterest ${status} ${body.code ?? ""} : ${body.message ?? "?"}`;
  if (status === 401) return new NetworkError("La connexion Pinterest a expiré : reconnecte le compte.", false, true, detail);
  if (status === 403) return new NetworkError("Pinterest refuse l'accès (autorisation ou niveau d'accès de l'app insuffisant).", false, true, detail);
  if (status === 429) return new NetworkError("Pinterest limite temporairement les publications. Nouvel essai automatique.", true, false, detail);
  if (status >= 500) return new NetworkError("Pinterest ne répond pas correctement. Nouvel essai automatique.", true, false, detail);
  return new NetworkError(`Pinterest a refusé l'épingle : ${body.message ?? "erreur inconnue"}`, false, false, detail);
}

async function pin<T>(token: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw pinterestError(res.status, json);
  return json as T;
}

export async function pinterestToken(params: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env("PINTEREST_APP_ID")}:${env("PINTEREST_APP_SECRET")}`)}`,
    },
    body: new URLSearchParams({ ...params, ...(params.grant_type === "refresh_token" ? { continuous_refresh: "true" } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.access_token) throw new NetworkError("Pinterest refuse la connexion : reconnecte le compte.", false, true, JSON.stringify(body));
  return body as { access_token: string; refresh_token?: string; expires_in: number; refresh_token_expires_in?: number };
}

export async function pinterestUser(token: string) {
  return pin<{ username: string; profile_image?: string; business_name?: string; follower_count?: number }>(token, "/user_account");
}

export async function pinterestBoards(token: string) {
  const body = await pin<{ items?: { id: string; name: string }[] }>(token, "/boards?page_size=100");
  return (body.items ?? []).map((b) => ({ id: b.id, name: b.name }));
}

export async function publishPinterest(token: string, boardId: string, pinData: { title: string; description: string; link: string | null; imageUrls: string[] }) {
  if (!pinData.imageUrls.length) throw new NetworkError("Pinterest demande au moins une image.", false);
  const media_source =
    pinData.imageUrls.length === 1
      ? { source_type: "image_url", url: pinData.imageUrls[0] }
      : { source_type: "multiple_image_urls", items: pinData.imageUrls.slice(0, 5).map((url) => ({ url })) };
  const { id } = await pin<{ id: string }>(token, "/pins", {
    board_id: boardId,
    title: pinData.title,
    description: pinData.description,
    ...(pinData.link ? { link: pinData.link } : {}),
    media_source,
  });
  return { externalId: id, permalink: `https://www.pinterest.com/pin/${id}/` };
}

export async function pinterestStats(token: string, pinId: string, since: string) {
  const end = new Date().toISOString().slice(0, 10);
  type Analytics = { all?: { lifetime_metrics?: Record<string, number>; summary_metrics?: Record<string, number> } };
  const body = await pin<Analytics>(token, `/pins/${pinId}/analytics?start_date=${since}&end_date=${end}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`);
  return body.all?.summary_metrics ?? body.all?.lifetime_metrics ?? {};
}
