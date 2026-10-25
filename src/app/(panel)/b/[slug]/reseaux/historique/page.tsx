import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { PostRow } from "@/components/posts/post-row";
import { Card, EmptyState, ButtonLink } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { getBusiness, listPosts } from "@/lib/data";
import type { PostStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Historique" };

const FILTERS: { value: string; label: string; statuses?: PostStatus[] }[] = [
  { value: "tous", label: "Tous" },
  { value: "publies", label: "Publiés", statuses: ["published"] },
  { value: "programmes", label: "Programmés", statuses: ["scheduled"] },
  { value: "erreurs", label: "Échecs et partiels", statuses: ["failed", "partial"] },
  { value: "brouillons", label: "Brouillons", statuses: ["draft"] },
];

export default async function HistoryPage({ params, searchParams }: PageProps<"/b/[slug]/reseaux/historique">) {
  const { slug } = await params;
  const { filtre } = await searchParams;
  const business = await getBusiness(slug);
  const active = FILTERS.find((f) => f.value === filtre) ?? FILTERS[0];
  const posts = await listPosts({ businessId: business.id, statuses: active.statuses, limit: 100 });
  const base = `/b/${business.slug}/reseaux`;

  return (
    <div className="flex flex-col gap-4 px-4 pb-16 sm:px-8">
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "tous" ? "?" : `?filtre=${f.value}`}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1 text-[13px] transition",
              active.value === f.value ? "border-text bg-text text-bg" : "border-border bg-surface text-muted hover:text-text",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <Card className="p-2">
        {posts.length ? (
          <div className="divide-y divide-border">
            {posts.map((p) => (
              <PostRow key={p.id} post={p} href={`${base}/posts/${p.id}`} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<History />} title="Rien ici pour l'instant" description="Les posts apparaîtront ici avec leur statut et leurs chiffres." action={<ButtonLink href={base} size="sm">Composer un post</ButtonLink>} />
        )}
      </Card>
    </div>
  );
}
