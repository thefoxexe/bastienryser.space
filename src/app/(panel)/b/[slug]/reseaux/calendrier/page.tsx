import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PenSquare } from "lucide-react";
import { MonthCalendar, monthRange } from "@/components/posts/calendar";
import { ButtonLink } from "@/components/ui";
import { getBusiness, listPosts } from "@/lib/data";

export const metadata: Metadata = { title: "Calendrier" };

export default async function CalendarPage({ params, searchParams }: PageProps<"/b/[slug]/reseaux/calendrier">) {
  const { slug } = await params;
  const { mois } = await searchParams;
  const business = await getBusiness(slug);
  const range = monthRange(typeof mois === "string" ? mois : undefined);
  const base = `/b/${business.slug}/reseaux`;

  const [scheduled, published] = await Promise.all([
    listPosts({ businessId: business.id, from: range.from, to: range.to, order: "scheduled_asc", limit: 300, withCovers: false }),
    listPosts({ businessId: business.id, statuses: ["published", "partial"], limit: 300, withCovers: false }),
  ]);
  const ids = new Set(scheduled.map((p) => p.id));
  const posts = [...scheduled, ...published.filter((p) => !ids.has(p.id))];

  return (
    <div className="flex flex-col gap-4 px-4 pb-16 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`?mois=${range.prev}`} className="grid size-8 place-items-center rounded-lg border border-border bg-surface shadow-card hover:bg-surface-2" aria-label="Mois précédent">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={`?mois=${range.next}`} className="grid size-8 place-items-center rounded-lg border border-border bg-surface shadow-card hover:bg-surface-2" aria-label="Mois suivant">
            <ChevronRight className="size-4" />
          </Link>
          <h2 className="ml-2 text-lg font-semibold capitalize tracking-tight">{range.label}</h2>
          <Link href="?" className="ml-2 text-[13px] text-muted hover:text-text">
            Aujourd&apos;hui
          </Link>
        </div>
        <ButtonLink href={base} size="sm">
          <PenSquare /> Nouveau post
        </ButtonLink>
      </div>
      <MonthCalendar year={range.year} month={range.month} posts={posts} hrefFor={(p) => `${base}/posts/${p.id}`} />
      <div className="flex flex-wrap gap-4 text-[12px] text-muted">
        <Legend className="bg-info" label="Programmé" />
        <Legend className="bg-warning" label="En cours / partiel" />
        <Legend className="bg-success" label="Publié" />
        <Legend className="bg-danger" label="Échec" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}
