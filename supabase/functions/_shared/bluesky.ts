// Bluesky (AT Protocol) : connexion par mot de passe d'application, publication texte + images, statistiques publiques.
import { NetworkError } from "./errors.ts";

const ENTRYWAY = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";

export type BlueskyCredentials = { identifier: string; password: string };
export type BlueskySession = { accessJwt: string; did: string; handle: string; pds: string };

function blueskyError(status: number, body: { error?: string; message?: string }): NetworkError {
  const detail = `Bluesky ${status} ${body.error ?? ""} : ${body.message ?? "?"}`;
  if (status === 401 || body.error === "AuthenticationRequired" || body.error === "AccountTakedown") {
    return new NetworkError("Bluesky refuse la connexion : vérifie l'identifiant et le mot de passe d'application.", false, true, detail);
  }
  if (status === 429 || body.error === "RateLimitExceeded") {
    return new NetworkError("Bluesky limite temporairement les publications. Nouvel essai automatique.", true, false, detail);
  }
  if (status >= 500) return new NetworkError("Bluesky ne répond pas correctement. Nouvel essai automatique.", true, false, detail);
  return new NetworkError(`Bluesky a refusé le post : ${body.message ?? body.error ?? "erreur inconnue"}`, false, false, detail);
}

async function xrpc<T>(base: string, method: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(`${base}/xrpc/${method}`, {
    ...rest,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...((rest.headers as Record<string, string>) ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw blueskyError(res.status, body);
  return body as T;
}

export async function blueskySession(creds: BlueskyCredentials): Promise<BlueskySession> {
  type Session = { accessJwt: string; did: string; handle: string; didDoc?: { service?: { id: string; serviceEndpoint: string }[] } };
  const s = await xrpc<Session>(ENTRYWAY, "com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: creds.identifier.replace(/^@/, "").trim(), password: creds.password.trim() }),
  });
  // Chaque compte vit sur son serveur (PDS) : on y écrit directement.
  const pds = s.didDoc?.service?.find((x) => x.id.endsWith("#atproto_pds"))?.serviceEndpoint ?? ENTRYWAY;
  return { accessJwt: s.accessJwt, did: s.did, handle: s.handle, pds };
}

export async function blueskyProfile(actor: string) {
  return xrpc<{ did: string; handle: string; displayName?: string; avatar?: string; followersCount?: number }>(
    APPVIEW,
    `app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
  );
}

type Facet = { index: { byteStart: number; byteEnd: number }; features: Record<string, string>[] };

/** Hashtags et liens cliquables : positions en octets UTF-8, comme l'exige le protocole. */
export function blueskyFacets(text: string): Facet[] {
  const enc = new TextEncoder();
  const bytes = (s: string) => enc.encode(s).length;
  const facets: Facet[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s]+[^\s.,;:!?)\]»"']/g)) {
    const start = bytes(text.slice(0, m.index));
    facets.push({ index: { byteStart: start, byteEnd: start + bytes(m[0]) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const startChar = m.index! + m[1].length;
    const start = bytes(text.slice(0, startChar));
    facets.push({ index: { byteStart: start, byteEnd: start + bytes(`#${m[2]}`) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }] });
  }
  return facets;
}

export async function publishBluesky(
  session: BlueskySession,
  text: string,
  images: { bytes: Uint8Array<ArrayBuffer>; contentType: string; width?: number | null; height?: number | null }[],
) {
  const uploaded = [];
  for (const img of images.slice(0, 4)) {
    if (img.bytes.byteLength > 1_000_000) throw new NetworkError("Image trop lourde pour Bluesky (1 Mo maximum).", false);
    const { blob } = await xrpc<{ blob: unknown }>(session.pds, "com.atproto.repo.uploadBlob", {
      method: "POST",
      token: session.accessJwt,
      headers: { "Content-Type": img.contentType },
      body: img.bytes,
    });
    uploaded.push({ alt: "", image: blob, ...(img.width && img.height ? { aspectRatio: { width: img.width, height: img.height } } : {}) });
  }
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    langs: ["fr"],
    facets: blueskyFacets(text),
    ...(uploaded.length ? { embed: { $type: "app.bsky.embed.images", images: uploaded } } : {}),
  };
  const { uri } = await xrpc<{ uri: string }>(session.pds, "com.atproto.repo.createRecord", {
    method: "POST",
    token: session.accessJwt,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
  });
  return { externalId: uri, permalink: `https://bsky.app/profile/${session.handle}/post/${uri.split("/").pop()}` };
}

export async function blueskyStats(uris: string[]) {
  const out = new Map<string, { likes?: number; reposts?: number; replies?: number; quotes?: number }>();
  for (let i = 0; i < uris.length; i += 25) {
    const q = uris.slice(i, i + 25).map((u) => `uris=${encodeURIComponent(u)}`).join("&");
    type Posts = { posts?: { uri: string; likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number }[] };
    const body = await xrpc<Posts>(APPVIEW, `app.bsky.feed.getPosts?${q}`);
    for (const p of body.posts ?? []) out.set(p.uri, { likes: p.likeCount, reposts: p.repostCount, replies: p.replyCount, quotes: p.quoteCount });
  }
  return out;
}
