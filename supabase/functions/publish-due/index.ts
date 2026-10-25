// Appelée chaque minute par pg_cron (et tout de suite après « Publier maintenant »).
// 1. Verrouille les cibles dues (claim_due_targets : statut `publishing`, SKIP LOCKED).
// 2. Publie chacune sur son réseau.
// 3. En cas d'erreur passagère : jusqu'à 3 essais espacés, puis `failed` avec un message clair.
// Une cible verrouillée n'est jamais reprise automatiquement : pas de double publication.

import { asNetworkError, NetworkError } from "../_shared/errors.ts";
import { publishLinkedIn, type LinkedInMedia } from "../_shared/linkedin.ts";
import { publishFacebook, publishInstagram } from "../_shared/meta.ts";
import { adminClient, authorize, json, logActivity, readToken } from "../_shared/supabase.ts";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MIN = [2, 10]; // après le 1er puis le 2e échec
const BATCH = 5;

const LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  linkedin_page: "LinkedIn (page)",
  threads: "Threads",
};

type Target = {
  id: string;
  post_id: string;
  social_account_id: string;
  network: string;
  caption: string;
  attempts: number;
};

Deno.serve(async (req) => {
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);
  const db = adminClient();

  await db.rpc("release_stale_targets");
  const { data: claimed, error } = await db.rpc("claim_due_targets", { p_limit: BATCH });
  if (error) {
    console.error("claim", error);
    return json({ error: "claim_failed" }, 500);
  }

  const results = [];
  for (const target of (claimed ?? []) as Target[]) {
    results.push(await processTarget(db, target));
  }
  return json({ processed: results.length, results });
});

async function processTarget(db: ReturnType<typeof adminClient>, target: Target) {
  const { data: account } = await db
    .from("social_accounts")
    .select("id, business_id, network, display_name, external_id, token_ref, meta, status")
    .eq("id", target.social_account_id)
    .single();
  const { data: post } = await db.from("posts").select("id, business_id, title, businesses(name)").eq("id", target.post_id).single();
  const businessName = (post?.businesses as unknown as { name: string } | null)?.name ?? "";

  try {
    if (!account || !post) throw new NetworkError("Le compte ou le post n'existe plus.", false);
    const token = await readToken(db, account.token_ref);
    if (!token) throw new NetworkError("Aucun token pour ce compte : reconnecte-le.", false, true);

    const { data: media } = await db.from("post_media").select("storage_path, kind, mime_type, position").eq("post_id", post.id).order("position");
    const files = media ?? [];

    let result: { externalId: string; permalink: string | null };
    if (account.network === "instagram" || account.network === "facebook") {
      // Meta télécharge les images depuis une adresse publique : URL signées valables 1 h.
      const images = files.filter((m) => m.kind === "image");
      let urls: string[] = [];
      if (images.length) {
        const { data: signed, error } = await db.storage.from("media").createSignedUrls(
          images.map((m) => m.storage_path),
          3600,
        );
        if (error || !signed || signed.some((s) => !s.signedUrl)) throw new NetworkError("Impossible de préparer les images.", true);
        urls = signed.map((s) => s.signedUrl!);
      }
      result =
        account.network === "instagram"
          ? await publishInstagram(account.external_id, token, target.caption, urls)
          : await publishFacebook(account.external_id, token, target.caption, urls);
    } else if (account.network === "linkedin" || account.network === "linkedin_page") {
      const author = (account.meta as { author?: string }).author;
      if (!author) throw new NetworkError("Compte LinkedIn incomplet : reconnecte-le.", false, true);
      const liMedia: LinkedInMedia[] = [];
      for (const m of files) {
        if (m.kind !== "image" && m.kind !== "pdf") continue;
        const { data: blob, error } = await db.storage.from("media").download(m.storage_path);
        if (error || !blob) throw new NetworkError("Impossible de lire un fichier du post.", true);
        liMedia.push({
          bytes: new Uint8Array(await blob.arrayBuffer()),
          contentType: m.mime_type ?? (m.kind === "pdf" ? "application/pdf" : "image/jpeg"),
          kind: m.kind,
          title: post.title ?? undefined,
        });
      }
      result = await publishLinkedIn(author, token, target.caption, liMedia);
    } else {
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

    const kind = files.length > 1 ? "Carrousel" : files.some((f) => f.kind === "pdf") ? "Document" : files.length === 1 ? "Post" : "Texte";
    await logActivity(db, {
      business_id: post.business_id,
      kind: "post.published",
      message: `${kind} publié sur ${LABEL[account.network]} (${businessName})`,
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
