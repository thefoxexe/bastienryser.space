import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarX, ExternalLink, FileText, Pencil, RotateCw, Trash2 } from "lucide-react";
import { NetworkChip } from "@/components/network-icon";
import { postTitle } from "@/components/posts/post-row";
import { Button, ButtonLink, Card, PostStatusBadge, TargetStatusBadge } from "@/components/ui";
import { getBusiness, getPost } from "@/lib/data";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { NETWORKS } from "@/lib/social/networks";
import { deletePost, retryTarget, unschedulePost } from "../../actions";

export const metadata: Metadata = { title: "Post" };

export default async function PostPage({ params }: PageProps<"/b/[slug]/reseaux/posts/[id]">) {
  const { slug, id } = await params;
  const business = await getBusiness(slug);
  const post = await getPost(id);
  if (post.business_id !== business.id) notFound();
  const base = `/b/${business.slug}/reseaux`;
  const editable = post.status === "draft" || post.status === "scheduled";

  return (
    <div className="flex flex-col gap-6 px-4 pb-16 sm:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href={`${base}/historique`} className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-text">
            <ArrowLeft className="size-3.5" /> Historique
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{postTitle({ title: post.title, targets: post.targets })}</h2>
            <PostStatusBadge status={post.status} />
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {post.status === "published" && post.published_at
              ? `Publié le ${formatDateTime(post.published_at)}`
              : post.scheduled_at
                ? `Prévu le ${formatDateTime(post.scheduled_at)}`
                : `Brouillon modifié ${formatRelative(post.updated_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <ButtonLink href={`${base}?post=${post.id}`} variant="secondary" size="sm">
              <Pencil /> Modifier
            </ButtonLink>
          ) : null}
          {post.status === "scheduled" ? (
            <form action={unschedulePost}>
              <input type="hidden" name="postId" value={post.id} />
              <Button type="submit" variant="secondary" size="sm">
                <CalendarX /> Déprogrammer
              </Button>
            </form>
          ) : null}
          {post.status !== "publishing" ? (
            <form action={deletePost}>
              <input type="hidden" name="postId" value={post.id} />
              <Button type="submit" variant="danger" size="sm" title={post.status === "published" ? "Supprime du panel uniquement, pas du réseau" : undefined}>
                <Trash2 /> Supprimer
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {post.media.length ? (
        <div className="scrollbar-none -mx-4 flex gap-2.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {post.media.map((m, i) => (
            <div key={m.id} className="relative aspect-[4/5] w-36 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2 sm:w-44">
              {m.kind === "image" && m.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="size-full object-cover" />
              ) : (
                <div className="grid size-full place-items-center text-muted">
                  <FileText className="size-8" />
                </div>
              )}
              <span className="absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-md bg-black/60 px-1 text-[11px] font-semibold text-white">{i + 1}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {post.targets.map((t) => {
          const m = t.metrics;
          const linkedinPersonal = t.network === "linkedin";
          return (
            <Card key={t.id} className="flex flex-col">
              <div className="flex items-center gap-3 border-b border-border p-4">
                <NetworkChip network={t.network} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.account?.display_name ?? "Compte supprimé"}</p>
                  <p className="text-[12px] text-muted">
                    {NETWORKS[t.network].label}
                    {t.published_at ? ` · ${formatDateTime(t.published_at)}` : ""}
                    {t.attempts > 1 ? ` · ${t.attempts} essais` : ""}
                  </p>
                </div>
                <TargetStatusBadge status={t.status} />
              </div>

              {t.status === "failed" ? (
                <div className="flex flex-col gap-3 border-b border-border bg-[color-mix(in_oklab,var(--danger)_5%,transparent)] p-4 sm:flex-row sm:items-center">
                  <p className="flex-1 text-[13px] text-danger">{t.error_message ?? "La publication a échoué."}</p>
                  <form action={retryTarget}>
                    <input type="hidden" name="targetId" value={t.id} />
                    <Button type="submit" size="sm" variant="secondary">
                      <RotateCw /> Réessayer
                    </Button>
                  </form>
                </div>
              ) : null}

              {t.status === "published" ? (
                <div className="grid grid-cols-3 gap-4 border-b border-border p-4 sm:grid-cols-6">
                  {[
                    ["Vues", m?.impressions],
                    ["Portée", m?.reach],
                    ["J'aime", m?.likes],
                    ["Comm.", m?.comments],
                    ["Partages", m?.shares],
                    ["Enreg.", m?.saves],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <p className="text-[11px] uppercase tracking-wide text-faint">{label as string}</p>
                      <p className="tabular text-lg font-semibold">{formatNumber(value as number | null | undefined)}</p>
                    </div>
                  ))}
                  <p className="col-span-full text-[12px] text-faint">
                    {m
                      ? `Chiffres réels de l'API, mis à jour ${formatRelative(m.fetched_at)}.`
                      : linkedinPersonal
                        ? "LinkedIn ne fournit pas ces chiffres pour un profil personnel."
                        : "Les chiffres arrivent avec la récupération quotidienne (jusqu'à 48 h de délai chez Meta)."}
                  </p>
                </div>
              ) : null}

              <div className="flex-1 p-4">
                <p className="line-clamp-[8] whitespace-pre-line text-[13px] leading-relaxed text-muted">{t.caption || "Pas de texte."}</p>
              </div>
              {t.permalink ? (
                <a
                  href={t.permalink}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center justify-center gap-1.5 border-t border-border p-3 text-[13px] font-medium hover:bg-surface-2"
                >
                  Voir la publication <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </Card>
          );
        })}
        {post.targets.length === 0 ? <p className="text-sm text-muted">Aucun compte choisi pour ce brouillon.</p> : null}
      </div>
    </div>
  );
}
