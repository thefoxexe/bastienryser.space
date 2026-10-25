"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { triggerPublishNow } from "@/lib/publish";
import { checkTarget, NETWORKS } from "@/lib/social/networks";
import { supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { MediaKind, SocialNetwork } from "@/lib/types";

const MIME: Record<string, { kind: MediaKind; ext: string }> = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" },
  "application/pdf": { kind: "pdf", ext: "pdf" },
};

/** Prépare l'envoi direct d'un fichier vers Supabase Storage (URL signée à usage unique). */
export async function createUploadTarget(input: { businessId: string; mimeType: string; size: number }) {
  await requireAdmin();
  const type = MIME[input.mimeType];
  if (!type) return { error: "Format non pris en charge (JPEG, PNG, WebP ou PDF)." } as const;
  const max = type.kind === "pdf" ? 100 : 8;
  if (input.size > max * 1024 * 1024) return { error: `Fichier trop lourd (${max} Mo max).` } as const;

  const supabase = await createClient();
  const path = `${input.businessId}/${randomUUID()}.${type.ext}`;
  const { data, error } = await supabase.storage.from("media").createSignedUploadUrl(path);
  if (error || !data) return { error: "Impossible de préparer l'envoi." } as const;
  const { data: preview } = await supabase.storage.from("media").createSignedUrl(path, 3600);
  return { path, token: data.token, kind: type.kind, previewUrl: preview?.signedUrl ?? null } as const;
}

const mediaSchema = z.object({
  storagePath: z.string().min(1),
  kind: z.enum(["image", "pdf"]),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

const saveSchema = z.object({
  postId: z.string().uuid().nullable(),
  businessId: z.string().uuid(),
  title: z.string().trim().max(120),
  media: z.array(mediaSchema).max(20),
  targets: z.array(z.object({ accountId: z.string().uuid(), caption: z.string().max(70000) })).max(20),
  mode: z.enum(["draft", "now", "schedule"]),
  scheduledAt: z.string().datetime().nullable(),
});

export type SaveInput = z.infer<typeof saveSchema>;

export async function savePost(raw: SaveInput): Promise<{ error?: string; postId?: string }> {
  await requireAdmin();
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return { error: "Données invalides." };
  const input = parsed.data;
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("id, slug, name").eq("id", input.businessId).single();
  if (!business) return { error: "Business introuvable." };

  // Tous les fichiers doivent appartenir au dossier de ce business.
  if (input.media.some((m) => !m.storagePath.startsWith(`${business.id}/`))) return { error: "Fichier invalide." };

  const accountIds = input.targets.map((t) => t.accountId);
  const { data: accounts } = accountIds.length
    ? await supabase.from("social_accounts").select("id, network, display_name, status").eq("business_id", business.id).in("id", accountIds)
    : { data: [] as { id: string; network: SocialNetwork; display_name: string; status: string }[] };
  const byId = new Map((accounts ?? []).map((a) => [a.id, a]));

  if (input.mode !== "draft") {
    if (!input.targets.length) return { error: "Choisis au moins un compte." };
    for (const t of input.targets) {
      const account = byId.get(t.accountId);
      if (!account) return { error: "Un compte choisi n'existe plus." };
      if (account.status === "expired") return { error: `La connexion de ${account.display_name} a expiré : reconnecte le compte.` };
      const issues = checkTarget(account.network as SocialNetwork, t.caption, input.media).filter((i) => i.level === "error");
      if (issues.length) return { error: `${NETWORKS[account.network as SocialNetwork].label} : ${issues[0].message}` };
    }
  }

  let scheduledAt: string | null = null;
  if (input.mode === "schedule") {
    if (!input.scheduledAt) return { error: "Choisis une date et une heure." };
    if (new Date(input.scheduledAt).getTime() < Date.now() - 60_000) return { error: "La date choisie est déjà passée." };
    scheduledAt = input.scheduledAt;
  }
  if (input.mode === "now") scheduledAt = new Date().toISOString();

  let postId = input.postId;
  if (postId) {
    const { data: existing } = await supabase.from("posts").select("status").eq("id", postId).single();
    if (!existing) return { error: "Post introuvable." };
    if (!["draft", "scheduled"].includes(existing.status)) return { error: "Ce post est déjà en cours de publication ou publié." };
    const { count } = await supabase.from("post_targets").select("id", { count: "exact", head: true }).eq("post_id", postId).gt("attempts", 0);
    if (count) return { error: "La publication a déjà commencé." };
  }

  const postRow = {
    business_id: business.id,
    title: input.title || null,
    status: input.mode === "draft" ? "draft" : "scheduled",
    scheduled_at: input.mode === "draft" ? null : scheduledAt,
  };

  if (postId) {
    const { error } = await supabase.from("posts").update(postRow).eq("id", postId);
    if (error) return { error: "Enregistrement impossible." };
    // Remplace médias et cibles (le post n'a encore rien publié).
    const { data: oldMedia } = await supabase.from("post_media").select("storage_path").eq("post_id", postId);
    await supabase.from("post_targets").delete().eq("post_id", postId);
    await supabase.from("post_media").delete().eq("post_id", postId);
    const keep = new Set(input.media.map((m) => m.storagePath));
    const orphans = (oldMedia ?? []).map((m) => m.storage_path).filter((p) => !keep.has(p));
    if (orphans.length) await supabase.storage.from("media").remove(orphans);
  } else {
    const { data, error } = await supabase.from("posts").insert(postRow).select("id").single();
    if (error || !data) return { error: "Création impossible." };
    postId = data.id;
  }

  if (input.media.length) {
    const { error } = await supabase.from("post_media").insert(
      input.media.map((m, position) => ({
        post_id: postId,
        position,
        storage_path: m.storagePath,
        kind: m.kind,
        mime_type: m.mimeType,
        size_bytes: m.size,
        width: m.width,
        height: m.height,
      })),
    );
    if (error) return { error: "Les images n'ont pas pu être enregistrées." };
  }

  if (input.targets.length) {
    const { error } = await supabase.from("post_targets").insert(
      input.targets
        .filter((t) => byId.has(t.accountId))
        .map((t) => ({
          post_id: postId,
          social_account_id: t.accountId,
          network: byId.get(t.accountId)!.network,
          caption: t.caption,
          status: "pending",
          next_attempt_at: input.mode === "draft" ? null : scheduledAt,
        })),
    );
    if (error) return { error: "Les comptes cibles n'ont pas pu être enregistrés." };
  }

  const label = input.title || "Post";
  if (input.mode === "schedule") {
    await logActivity(supabase, {
      business_id: business.id,
      kind: "post.scheduled",
      message: `${label} programmé pour le ${formatDateTime(scheduledAt)} (${business.name})`,
      meta: { post_id: postId },
    });
  } else if (input.mode === "now") {
    await logActivity(supabase, { business_id: business.id, kind: "post.publish_requested", message: `Publication lancée : ${label} (${business.name})`, meta: { post_id: postId } });
    await triggerPublishNow();
  }

  revalidatePath(`/b/${business.slug}`, "layout");
  revalidatePath("/");
  return { postId: postId! };
}

export async function retryTarget(formData: FormData) {
  await requireAdmin();
  const targetId = String(formData.get("targetId"));
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("post_targets")
    .select("id, network, status, post_id, posts(business_id, title, businesses(slug, name))")
    .eq("id", targetId)
    .single();
  if (!target || target.status !== "failed") return;

  await supabase
    .from("post_targets")
    .update({ status: "pending", attempts: 0, error_message: null, locked_at: null, next_attempt_at: new Date().toISOString() })
    .eq("id", targetId)
    .eq("status", "failed");

  const post = target.posts as unknown as { business_id: string; title: string | null; businesses: { slug: string; name: string } };
  await logActivity(supabase, {
    business_id: post.business_id,
    kind: "post.retry",
    message: `Nouvel essai sur ${NETWORKS[target.network as SocialNetwork].label} (${post.businesses.name})`,
    meta: { post_id: target.post_id },
  });
  await triggerPublishNow();
  revalidatePath(`/b/${post.businesses.slug}`, "layout");
  revalidatePath("/");
}

export async function deletePost(formData: FormData) {
  await requireAdmin();
  const postId = String(formData.get("postId"));
  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("id, status, businesses(slug)").eq("id", postId).single();
  if (!post || post.status === "publishing") return;
  const { data: media } = await supabase.from("post_media").select("storage_path").eq("post_id", postId);
  await supabase.from("posts").delete().eq("id", postId);
  if (media?.length) await supabase.storage.from("media").remove(media.map((m) => m.storage_path));
  const slug = (post.businesses as unknown as { slug: string }).slug;
  revalidatePath(`/b/${slug}`, "layout");
  redirect(`/b/${slug}/reseaux/historique`);
}

export async function unschedulePost(formData: FormData) {
  await requireAdmin();
  const postId = String(formData.get("postId"));
  const supabase = await createClient();
  const { count } = await supabase.from("post_targets").select("id", { count: "exact", head: true }).eq("post_id", postId).gt("attempts", 0);
  if (count) return;
  await supabase.from("post_targets").update({ next_attempt_at: null }).eq("post_id", postId).eq("status", "pending");
  const { data: post } = await supabase.from("posts").update({ status: "draft", scheduled_at: null }).eq("id", postId).select("businesses(slug)").single();
  const slug = (post?.businesses as unknown as { slug: string } | undefined)?.slug;
  if (slug) revalidatePath(`/b/${slug}`, "layout");
}

// ---------------------------------------------------------------------------
// Comptes connectés
// ---------------------------------------------------------------------------

const PROVIDERS = ["meta", "linkedin", "linkedin_page"] as const;

/** Démarre le flux OAuth officiel : l'edge function `oauth` prend la suite et garde les tokens côté serveur. */
export async function startOAuth(formData: FormData) {
  await requireAdmin();
  const provider = String(formData.get("provider"));
  const businessId = String(formData.get("businessId"));
  if (!PROVIDERS.includes(provider as (typeof PROVIDERS)[number])) return;
  const supabase = await createClient();
  const state = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("oauth_states").insert({ state, business_id: businessId, provider });
  if (error) throw new Error("Impossible de démarrer la connexion.");
  redirect(`${supabaseUrl}/functions/v1/oauth/start?state=${encodeURIComponent(state)}`);
}

export async function disconnectAccount(formData: FormData) {
  await requireAdmin();
  const accountId = String(formData.get("accountId"));
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("social_accounts")
    .select("id, business_id, network, display_name, businesses(slug)")
    .eq("id", accountId)
    .single();
  if (!account) return;
  await supabase.from("social_accounts").delete().eq("id", accountId);
  await logActivity(supabase, {
    business_id: account.business_id,
    kind: "account.disconnected",
    message: `Compte ${NETWORKS[account.network as SocialNetwork].label} « ${account.display_name} » déconnecté`,
  });
  revalidatePath(`/b/${(account.businesses as unknown as { slug: string }).slug}`, "layout");
}
