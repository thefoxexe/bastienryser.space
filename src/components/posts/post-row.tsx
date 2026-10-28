import Link from "next/link";
import { FileText, ImageIcon, RotateCw } from "lucide-react";
import { retryPost } from "@/app/(panel)/b/[slug]/reseaux/actions";
import { NetworkIcon } from "@/components/network-icon";
import { PostStatusBadge } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { PostSummary } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export function PostThumb({ post, className }: { post: Pick<PostSummary, "cover" | "media_count">; className?: string }) {
  return (
    <span className={cn("relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-fill text-faint", className)}>
      {post.cover?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.cover.url} alt="" className="size-full object-cover" />
      ) : post.cover?.kind === "pdf" ? (
        <FileText className="size-5" />
      ) : (
        <ImageIcon className="size-5" />
      )}
      {post.media_count > 1 ? <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">{post.media_count}</span> : null}
    </span>
  );
}

export function postTitle(post: Pick<PostSummary, "title" | "targets">) {
  return post.title || post.targets[0]?.caption.split("\n")[0]?.slice(0, 80) || "Post sans titre";
}

export function PostRow({ post, href, business }: { post: PostSummary; href: string; business?: { name: string; color: string } }) {
  const when = post.status === "published" ? post.published_at : post.scheduled_at;
  const failed = post.status === "failed" || post.status === "partial";
  return (
    <div className="flex items-center gap-1 rounded-[12px] transition-colors duration-150 hover:bg-fill">
      <Link href={href} className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
        <PostThumb post={post} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{postTitle(post)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
            {business ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-faint" />
                {business.name}
              </span>
            ) : null}
            <span className="tabular">{when ? formatDateTime(when) : "Pas de date"}</span>
            <span className="flex items-center gap-1">
              {post.targets.map((t) => (
                <span key={t.id} className={cn("relative text-muted", t.status === "failed" && "after:absolute after:-right-0.5 after:-top-0.5 after:size-1.5 after:rounded-full after:bg-danger")}>
                  <NetworkIcon network={t.network} className="size-3.5" />
                </span>
              ))}
            </span>
          </div>
        </div>
        <PostStatusBadge status={post.status} />
      </Link>
      {failed ? (
        <form action={retryPost} className="pr-2">
          <input type="hidden" name="postId" value={post.id} />
          <button type="submit" className="flex items-center gap-1 rounded-full bg-fill px-2.5 py-1 text-[12px] font-medium hover:bg-ink hover:text-ink-text" aria-label="Relancer la publication">
            <RotateCw className="size-3" /> Relancer
          </button>
        </form>
      ) : null}
    </div>
  );
}
