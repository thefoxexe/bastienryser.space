import type { Metadata } from "next";
import { CalendarClock, Megaphone, PenSquare, Plug } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { KpiStrip } from "@/components/kpi-strip";
import { TodoCard } from "@/components/todo-card";
import { listOpenTasks } from "@/lib/projects";
import { BriefCard } from "@/components/ai/brief-card";
import { NetworkChip } from "@/components/network-icon";
import { PostRow } from "@/components/posts/post-row";
import { Page } from "@/components/shell/page";
import { AccountStatusBadge, ButtonLink, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { getBusiness, listAccounts, listActivity, listPosts, metricsLast30Days } from "@/lib/data";
import { periodFrom } from "@/lib/finance";
import { formatNumber } from "@/lib/format";
import { NETWORKS } from "@/lib/social/networks";

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const business = await getBusiness(slug);
  return { title: business.name };
}

export default async function BusinessOverview({ params, searchParams }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const period = periodFrom((await searchParams).periode, 30);
  const business = await getBusiness(slug);
  const social = business.modules.includes("social");
  const base = `/b/${business.slug}/reseaux`;

  const [upcoming, recent, accounts, metrics, activity] = await Promise.all([
    listPosts({ businessId: business.id, statuses: ["scheduled"], order: "scheduled_asc", limit: 5 }),
    listPosts({ businessId: business.id, statuses: ["published", "partial", "failed", "publishing"], limit: 5 }),
    listAccounts(business.id),
    metricsLast30Days(business.id),
    listActivity({ businessId: business.id, limit: 8 }),
  ]);

  const sum = (key: "reach" | "interactions" | "followers") => {
    const values = metrics.map((m) => m[key]).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };

  return (
    <Page>
      {/* Le même tableau de bord que l'accueil, avec les seuls chiffres de ce business. */}
      <BriefCard slug={business.slug} />
      <KpiStrip businesses={[business]} business={business} period={period} base={`/b/${business.slug}`} />

      <TodoCard tasks={await listOpenTasks({ businessId: business.id, limit: 6 })} href={`/b/${business.slug}/projets`} showBusiness={false} />

      {social ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Vue d&apos;ensemble</h2>
            <ButtonLink href={base}>
              <PenSquare /> Nouveau post
            </ButtonLink>
          </div>

          <Card className="grid grid-cols-2 gap-6 p-5 sm:grid-cols-4 sm:p-6">
            <Stat label="Programmés" value={upcoming.length} hint="à venir" />
            <Stat label="Portée 30 j" value={formatNumber(sum("reach"))} hint={sum("reach") === null ? "pas encore de données" : "comptes uniques"} />
            <Stat label="Interactions 30 j" value={formatNumber(sum("interactions"))} hint="j'aime, commentaires, partages" />
            <Stat label="Abonnés" value={formatNumber(sum("followers"))} hint={`${accounts.length} compte${accounts.length > 1 ? "s" : ""} connecté${accounts.length > 1 ? "s" : ""}`} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardHeader title="Prochains posts" action={<ButtonLink href={`${base}/calendrier`} variant="ghost" size="sm">Calendrier</ButtonLink>} />
                <div className="p-2 pt-3">
                  {upcoming.length ? (
                    upcoming.map((p) => <PostRow key={p.id} post={p} href={`${base}/posts/${p.id}`} />)
                  ) : (
                    <EmptyState icon={<CalendarClock />} title="Rien de programmé" description="Les posts programmés apparaîtront ici." />
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="Derniers posts" action={<ButtonLink href={`${base}/historique`} variant="ghost" size="sm">Historique</ButtonLink>} />
                <div className="p-2 pt-3">
                  {recent.length ? (
                    recent.map((p) => <PostRow key={p.id} post={p} href={`${base}/posts/${p.id}`} />)
                  ) : (
                    <EmptyState icon={<Megaphone />} title="Aucune publication" description="Compose ton premier post pour ce business." />
                  )}
                </div>
              </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              <Card>
                <CardHeader title="Comptes connectés" action={<ButtonLink href={`${base}/comptes`} variant="ghost" size="sm">Gérer</ButtonLink>} />
                <div className="p-2 pt-3">
                  {accounts.length ? (
                    <ul>
                      {accounts.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2">
                          <NetworkChip network={a.network} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{a.display_name}</p>
                            <p className="text-[12px] text-muted">{NETWORKS[a.network].label}</p>
                          </div>
                          <AccountStatusBadge status={a.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={<Plug />}
                      title="Aucun compte"
                      description="Connecte Instagram, Facebook ou LinkedIn pour publier."
                      action={<ButtonLink href={`${base}/comptes`} size="sm">Connecter</ButtonLink>}
                    />
                  )}
                </div>
              </Card>
              <Card>
                <CardHeader title="Activité" />
                <div className="p-5 pt-4">
                  <ActivityFeed entries={activity} />
                </div>
              </Card>
            </div>
          </div>
        </>
      ) : (
        <Card>
          <EmptyState title="Aucun module activé" description="Active le module Réseaux sociaux dans les réglages du business." action={<ButtonLink href={`/reglages/business/${business.slug}`} size="sm">Modifier</ButtonLink>} />
        </Card>
      )}
    </Page>
  );
}
