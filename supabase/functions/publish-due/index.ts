// Appelée chaque minute par pg_cron (et tout de suite après « Publier maintenant »).
// 1. Verrouille les cibles dues (claim_due_targets : statut `publishing`, SKIP LOCKED).
// 2. Publie chacune sur son réseau.
// 3. En cas d'erreur passagère : jusqu'à 3 essais espacés, puis `failed` avec un message clair.
// Une cible verrouillée n'est jamais reprise automatiquement : pas de double publication.

import { publishBluesky } from "../_shared/bluesky.ts";
import { asNetworkError, NetworkError } from "../_shared/errors.ts";
import { publishLinkedIn, type LinkedInMedia } from "../_shared/linkedin.ts";
import { IG_GRAPH, isInstagramLogin } from "../_shared/instagram.ts";
import { publishFacebook, publishFacebookReel, publishInstagram } from "../_shared/meta.ts";
import { publishPinterest } from "../_shared/pinterest.ts";
import { adminClient, authorize, heartbeat, json, logActivity } from "../_shared/supabase.ts";
import { publishThreads } from "../_shared/threads.ts";
import { publishTikTok } from "../_shared/tiktok.ts";
import { accessToken, ACCOUNT_COLUMNS, blueskyFor, type AccountRow } from "../_shared/tokens.ts";
import { publishX } from "../_shared/x.ts";
import { publishYouTube, youtubeTitle } from "../_shared/youtube.ts";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MIN = [2, 10]; // après le 1er puis le 2e échec
const BATCH = 5;

const LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  linkedin_page: "LinkedIn (page)",
  threads: "Threads",
  youtube: "YouTube",
  tiktok: "TikTok",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
  x: "X",
};

type Target = {
  id: string;
  post_id: string;
  social_account_id: string | null;
  network: string;
  caption: string;
  attempts: number;
  container_id: string | null;
};

Deno.serve(async (req) => {
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);
  const db = adminClient();

  await db.rpc("release_stale_targets");
  const { data: claimed, error } = await db.rpc("claim_due_targets", { p_limit: BATCH });
  if (error) {
    console.error("claim", error);
    await heartbeat(db, "publish-due", false, "Impossible de lire les publications dues.");
    return json({ error: "claim_failed" }, 500);
  }

  const results = [];
  for (const target of (claimed ?? []) as Target[]) {
    results.push(await processTarget(db, target));
  }
  const failed = results.filter((r) => r.status === "failed").length;
  await heartbeat(db, "publish-due", true, results.length ? `${results.length} cible(s) traitée(s), ${failed} échec(s)` : "Rien à publier");
  return json({ processed: results.length, results });
});

type MediaRow = {
  storage_path: string;
  kind: "image" | "video" | "pdf";
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  cover_ms: number | null;
  cover_path: string | null;
};

// Même règle que le composer (src/lib/social/networks.ts) : vertical et 3 à 90 s.
const isFacebookReel = (v: MediaRow) => !!v.width && !!v.height && v.height > v.width && (v.duration_ms ?? 0) >= 3000 && (v.duration_ms ?? 0) <= 90_000;

async function processTarget(db: ReturnType<typeof adminClient>, target: Target) {
  const { data } = target.social_account_id
    ? await db.from("social_accounts").select(ACCOUNT_COLUMNS).eq("id", target.social_account_id).maybeSingle()
    : { data: null };
  const account = data as AccountRow | null;
  const { data: post } = await db.from("posts").select("id, business_id, title, businesses(name)").eq("id", target.post_id).single();
  const businessName = (post?.businesses as unknown as { name: string } | null)?.name ?? "";
  let note: string | null = null;

  try {
    if (!post) throw new NetworkError("Le post n'existe plus.", false);
    if (!account) throw new NetworkError(`Compte ${LABEL[target.network] ?? target.network} déconnecté : reconnecte-le puis relance.`, false);

    const { data: media } = await db
      .from("post_media")
      .select("storage_path, kind, mime_type, width, height, duration_ms, cover_ms, cover_path, position")
      .eq("post_id", post.id)
      .order("position");
    const files = (media ?? []) as MediaRow[];
    const images = files.filter((m) => m.kind === "image");
    const video = files.find((m) => m.kind === "video");

    // Les réseaux qui téléchargent eux-mêmes les fichiers reçoivent des URL signées valables 1 h.
    const signed = async (list: MediaRow[]) => {
      if (!list.length) return [];
      const { data: urls, error } = await db.storage.from("media").createSignedUrls(list.map((m) => m.storage_path), 3600);
      if (error || !urls || urls.some((u) => !u.signedUrl)) throw new NetworkError("Impossible de préparer les fichiers.", true);
      return urls.map((u) => u.signedUrl!);
    };
    const download = async (m: MediaRow) => {
      const { data: blob, error } = await db.storage.from("media").download(m.storage_path);
      if (error || !blob) throw new NetworkError("Impossible de lire un fichier du post.", true);
      return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: m.mime_type ?? (m.kind === "video" ? "video/mp4" : "image/jpeg"), width: m.width, height: m.height };
    };
    const needVideo = () => {
      if (!video) throw new NetworkError(`${LABEL[account.network]} demande une vidéo.`, false);
      return video;
    };

    let result: { externalId: string; permalink: string | null };
    switch (account.network) {
      case "instagram": {
        const token = await accessToken(db, account);
        const urls = await signed(images);
        const videoUrl = video ? (await signed([video]))[0] : undefined;
        const coverUrl = video?.cover_path
          ? (await db.storage.from("media").createSignedUrl(video.cover_path, 3600)).data?.signedUrl
          : undefined;
        result = await publishInstagram(account.external_id, token, target.caption, urls, videoUrl, isInstagramLogin(account.meta) ? IG_GRAPH : undefined, {
          coverUrl,
          thumbOffsetMs: video?.cover_ms ?? undefined,
          containerId: target.container_id,
          onContainer: async (id) => {
            await db.from("post_targets").update({ container_id: id }).eq("id", target.id);
          },
        });
        break;
      }
      case "facebook": {
        const token = await accessToken(db, account);
        const urls = await signed(images);
        const videoUrl = video ? (await signed([video]))[0] : undefined;
        const reel = video && videoUrl && isFacebookReel(video) ? await publishFacebookReel(account.external_id, token, target.caption, videoUrl) : null;
        result = reel ?? (await publishFacebook(account.external_id, token, target.caption, urls, videoUrl));
        break;
      }
      case "threads": {
        const token = await accessToken(db, account);
        result = await publishThreads(account.external_id, token, target.caption, {
          images: await signed(images),
          video: video ? (await signed([video]))[0] : undefined,
        });
        break;
      }
      case "linkedin":
      case "linkedin_page": {
        const token = await accessToken(db, account);
        const author = (account.meta as { author?: string }).author;
        if (!author) throw new NetworkError("Compte LinkedIn incomplet : reconnecte-le.", false, true);
        if (video) throw new NetworkError("La vidéo n'est pas encore prise en charge sur LinkedIn.", false);
        const liMedia: LinkedInMedia[] = [];
        for (const m of files) {
          if (m.kind !== "image" && m.kind !== "pdf") continue;
          const file = await download(m);
          liMedia.push({ bytes: file.bytes, contentType: file.contentType, kind: m.kind, title: post.title ?? undefined });
        }
        result = await publishLinkedIn(author, token, target.caption, liMedia);
        break;
      }
      case "youtube": {
        const token = await accessToken(db, account);
        const file = await download(needVideo());
        result = await publishYouTube(token, file, youtubeTitle(post.title, target.caption), target.caption);
        break;
      }
      case "tiktok": {
        const token = await accessToken(db, account);
        const file = await download(needVideo());
        const r = await publishTikTok(token, target.caption, file, account.username, video?.cover_ms ?? undefined);
        if (r.inbox) note = "Vidéo envoyée dans la boîte de réception TikTok : ouvre l'app pour la publier.";
        result = r;
        break;
      }
      case "bluesky": {
        const session = await blueskyFor(db, account);
        const files = [];
        for (const m of images.slice(0, 4)) files.push(await download(m));
        result = await publishBluesky(session, target.caption, files);
        break;
      }
      case "pinterest": {
        const token = await accessToken(db, account);
        const meta = account.meta as { board_id?: string; boards?: { id: string }[] };
        const boardId = meta.board_id ?? meta.boards?.[0]?.id;
        if (!boardId) throw new NetworkError("Aucun tableau Pinterest : crée-en un sur Pinterest puis reconnecte le compte.", false);
        result = await publishPinterest(token, boardId, {
          title: youtubeTitle(post.title, target.caption),
          description: [...target.caption].slice(0, 800).join(""),
          link: target.caption.match(/https?:\/\/[^\s]+/)?.[0] ?? null,
          imageUrls: await signed(images.slice(0, 5)),
        });
        break;
      }
      case "x": {
        const token = await accessToken(db, account);
        const files = [];
        for (const m of images.slice(0, 4)) files.push(await download(m));
        result = await publishX(token, target.caption, files, account.username);
        break;
      }
      default:
        throw new NetworkError(`${LABEL[account.network] ?? account.network} n'est pas encore pris en charge.`, false);
    }

    await db
      .from("post_targets")
      .update({
        status: "published",
        external_post_id: result.externalId,
        permalink: result.permalink,
        error_message: null,
        locked_at: null,
        published_at: new Date().toISOString(),
      })
      .eq("id", target.id);

    const kind = video ? "Vidéo" : files.length > 1 ? "Carrousel" : files.some((f) => f.kind === "pdf") ? "Document" : files.length === 1 ? "Post" : "Texte";
    await logActivity(db, {
      business_id: post.business_id,
      kind: "post.published",
      message: note ? `${note} (${businessName})` : `${kind} publié sur ${LABEL[account.network]} (${businessName})`,
      meta: { post_id: post.id, target_id: target.id, permalink: result.permalink },
    });
    return { id: target.id, status: "published" };
  } catch (e) {
    const err = asNetworkError(e);
    console.error("publish", target.id, err.detail ?? err.message);

    if (err.authProblem && account) {
      await db.from("social_accounts").update({ status: "error", last_error: err.message }).eq("id", account.id);
    }

    const retry = err.retryable && target.attempts < MAX_ATTEMPTS;
    if (retry) {
      const delay = RETRY_DELAYS_MIN[Math.min(target.attempts - 1, RETRY_DELAYS_MIN.length - 1)];
      await db
        .from("post_targets")
        .update({
          status: "pending",
          locked_at: null,
          error_message: err.message,
          next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString(),
        })
        .eq("id", target.id);
      return { id: target.id, status: "retry", in_minutes: delay };
    }

    await db.from("post_targets").update({ status: "failed", locked_at: null, error_message: err.message }).eq("id", target.id);
    await logActivity(db, {
      business_id: post?.business_id ?? account?.business_id ?? null,
      kind: "post.failed",
      message: `Échec de publication sur ${LABEL[target.network] ?? target.network} (${businessName}) : ${err.message}`,
      meta: { post_id: target.post_id, target_id: target.id },
    });
    return { id: target.id, status: "failed" };
  }
}
