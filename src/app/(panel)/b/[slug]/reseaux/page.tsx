import type { Metadata } from "next";
import { Composer, type ComposerInitial } from "@/components/composer/composer";
import { getBusiness, getPost, listAccounts } from "@/lib/data";

export const metadata: Metadata = { title: "Composer" };

export default async function ComposePage({ params, searchParams }: PageProps<"/b/[slug]/reseaux">) {
  const { slug } = await params;
  const { post: postId } = await searchParams;
  const business = await getBusiness(slug);
  const accounts = await listAccounts(business.id);

  let initial: ComposerInitial | undefined;
  if (typeof postId === "string") {
    const post = await getPost(postId);
    if (post.business_id === business.id && (post.status === "draft" || post.status === "scheduled")) {
      initial = {
        postId: post.id,
        title: post.title ?? "",
        scheduledAt: post.scheduled_at,
        media: post.media.map((m) => ({
          key: m.id,
          status: "ready",
          storagePath: m.storage_path,
          kind: m.kind,
          mimeType: m.mime_type ?? "image/jpeg",
          size: m.size_bytes ?? 0,
          width: m.width,
          height: m.height,
          previewUrl: m.url,
          name: m.storage_path.split("/").pop() ?? "fichier",
          durationMs: m.duration_ms,
          coverMs: m.cover_ms,
          coverPath: m.cover_path,
          coverUrl: m.cover_url,
        })),
        targets: post.targets.filter((t) => t.social_account_id).map((t) => ({ accountId: t.social_account_id!, caption: t.caption })),
      };
    }
  }

  return <Composer key={initial?.postId ?? "new"} business={{ id: business.id, slug: business.slug, name: business.name, color: business.color }} accounts={accounts} initial={initial} />;
}
