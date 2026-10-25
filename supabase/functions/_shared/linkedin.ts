import { LINKEDIN_VERSION } from "./env.ts";
import { linkedinError, NetworkError } from "./errors.ts";

const API = "https://api.linkedin.com";

function headers(token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    ...extra,
  };
}

export async function liFetch(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: headers(token, (init.headers as Record<string, string>) ?? {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw linkedinError(res.status, body);
  }
  return res;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function upload(token: string, kind: "images" | "documents", owner: string, bytes: Uint8Array<ArrayBuffer>, contentType: string) {
  const init = await liFetch(token, `/rest/${kind}?action=initializeUpload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  const { value } = (await init.json()) as { value: { uploadUrl: string; image?: string; document?: string } };
  const urn = (kind === "images" ? value.image : value.document)!;
  const put = await fetch(value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: bytes,
    signal: AbortSignal.timeout(120_000),
  });
  if (!put.ok) throw new NetworkError("LinkedIn n'a pas accepté le fichier envoyé.", put.status >= 500);

  // Attend que LinkedIn ait traité le fichier avant de créer le post.
  for (let i = 0; i < 20; i++) {
    const res = await liFetch(token, `/rest/${kind}/${encodeURIComponent(urn)}`);
    const { status } = (await res.json()) as { status?: string };
    if (status === "AVAILABLE") return urn;
    if (status === "PROCESSING_FAILED") throw new NetworkError("LinkedIn n'a pas pu traiter le fichier.", false);
    await sleep(i < 5 ? 1500 : 3000);
  }
  throw new NetworkError("LinkedIn met trop de temps à traiter le fichier. Nouvel essai automatique.", true);
}

/**
 * Convertit le texte au format « little text » de LinkedIn : caractères réservés échappés,
 * hashtags transformés en vrais hashtags cliquables.
 */
export function toLittleText(text: string) {
  const escape = (s: string) => s.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`);
  let out = "";
  let last = 0;
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const start = m.index! + m[1].length;
    out += escape(text.slice(last, start)) + `{hashtag|\\#|${m[2]}}`;
    last = start + 1 + m[2].length;
  }
  return out + escape(text.slice(last));
}

export type LinkedInMedia = { bytes: Uint8Array<ArrayBuffer>; contentType: string; kind: "image" | "pdf"; title?: string };

export async function publishLinkedIn(author: string, token: string, commentary: string, media: LinkedInMedia[]) {
  const images = media.filter((m) => m.kind === "image");
  const pdf = media.find((m) => m.kind === "pdf");

  let content: Record<string, unknown> | undefined;
  if (pdf) {
    const urn = await upload(token, "documents", author, pdf.bytes, "application/pdf");
    content = { media: { id: urn, title: pdf.title || "Document" } };
  } else if (images.length === 1) {
    const urn = await upload(token, "images", author, images[0].bytes, images[0].contentType);
    content = { media: { id: urn } };
  } else if (images.length > 1) {
    const urns: string[] = [];
    for (const img of images.slice(0, 20)) urns.push(await upload(token, "images", author, img.bytes, img.contentType));
    content = { multiImage: { images: urns.map((id) => ({ id })) } };
  }

  const res = await liFetch(token, "/rest/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      author,
      commentary: toLittleText(commentary),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(content ? { content } : {}),
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  const postUrn = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
  if (!postUrn) throw new NetworkError("LinkedIn n'a pas renvoyé l'identifiant du post.", false);
  return { externalId: postUrn, permalink: `https://www.linkedin.com/feed/update/${postUrn}/` };
}
