import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CalendarDays, CheckCircle2, Clock, PenSquare, RotateCw } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { BusinessMark } from "@/components/business-mark";
import { NetworkIcon } from "@/components/network-icon";
import { PostRow, postTitle } from "@/components/posts/post-row";
import { Page } from "@/components/shell/page";
import { Button, ButtonLink, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { listAlerts } from "@/lib/alerts";
import { listActivity, listBusinesses, listPosts, metricsLast30Days, type PostSummary } from "@/lib/data";
import { formatDate, formatNumber, formatTime, TIME_ZONE, zurichDayKey } from "@/lib/format";
import { NETWORKS } from "@/lib/social/networks";
import { retryTarget } from "./b/[slug]/reseaux/actions";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86400_000);
  const [businesses, alerts, upcoming, recent, metrics, activity] = await Promise.all([
    listBusinesses(),
    listAlerts(),
    listPosts({ statuses: ["scheduled", "publishing"], from: new Date(now.getTime() - 3600_000).toISOString(), to: in14.toISOString(), order: "scheduled_asc", limit: 200 }),
    listPosts({ statuses: ["published", "partial", "failed"], limit: 30 }),
    metricsLast30Days(),
    listActivity({ limit: 15 }),
  ]);

  const byId = new Map(businesses.map((b) => [b.id, b]));
  const bizMap = new Map(businesses.map((b) => [b.id, { name: b.name, color: b.color }]));
  const helloRaw = new Intl.DateTimeFormat("fr-CH", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(now);
  const hello = helloRaw.charAt(0).toUpperCase() + helloRaw.slice(1);
  const hour = Number(new Intl.DateTimeFormat("fr-CH", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(now));

  return (
    <Page>
      <PageHeader
        eyebrow={hello}
        title={hour < 18 ? "Bonjour Bastien" : "Bonsoir Bastien"}
        description={
          alerts.length
            ? `${alerts.length} point${alerts.length > 1 ? "s" : ""} à traiter · ${upcoming.length} post${upcoming.length > 1 ? "s" : ""} prévu${upcoming.length > 1 ? "s" : ""} sur 14 jours`
            : `Tout est en ordre · ${upcoming.length} post${upcoming.length > 1 ? "s" : ""} prévu${upcoming.length > 1 ? "s" : ""} sur 14 jours`
        }
        actions={
          businesses[0] ? (
            <ButtonLink href={`/b/${businesses[0].slug}/reseaux`} variant="brand">
              <PenSquare /> Nouveau post
            </ButtonLink>
          ) : null
        }
      />

      {/* À traiter */}
      {alerts.length ? (
        <Card className="overflow-hidden border-[color-mix(in_oklab,var(--danger)_30%,var(--border))]">
          <div className="flex items-center gap-2 border-b border-border bg-[color-mix(in_oklab,var(--danger)_6%,transparent)] px-5 py-3">
            <AlertTriangle className="size-4 text-danger" />
            <h2 className="text-[15px] font-semibold tracking-tight">À traiter</h2>
            <span className="ml-auto text-[13px] text-muted">{alerts.length}</span>
          </div>
          <ul className="divide-y divide-border">
            {alerts.map((a) => {
              const b = byId.get(a.business_id);
              if (!b) return null;
              if (a.kind === "failed_post") {
                return (
                  <li key={a.target_id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <NetworkIcon network={a.network} className="mt-0.5 size-4 shrink-0" />
                      <div className="min-w-0">
                        <Link href={`/b/${b.slug}/reseaux/posts/${a.post_id}`} className="text-sm font-medium hover:underline">
                          Échec sur {NETWORKS[a.network].label} · {a.title}
                        </Link>
                        <p className="mt-0.5 text-[13px] text-muted">
                          <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: b.color }} />
                          {b.name} · {a.message ?? "Erreur inconnue"}
                        </p>
                      </div>
                    </div>
                    <form action={retryTarget}>
                      <input type="hidden" name="targetId" value={a.target_id} />
                      <Button type="submit" size="sm" variant="secondary">
                        <RotateCw /> Réessayer
                      </Button>
                    </form>
                  </li>
                );
              }
              const expired = a.account.status === "expired" || (a.account.token_expires_at && new Date(a.account.token_expires_at) < now);
              return (
                <li key={a.account.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <NetworkIcon network={a.account.network} className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {a.account.status === "error"
                          ? `Problème de connexion : ${a.account.display_name}`
                          : expired
                            ? `Connexion expirée : ${a.account.display_name}`
                            : `Connexion à renouveler : ${a.account.display_name}`}
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: b.color }} />
                        {b.name} · {NETWORKS[a.account.network].label}
                        {a.account.token_expires_at ? ` · ${expired ? "expirée le" : "expire le"} ${formatDate(a.account.token_expires_at)}` : ""}
                        {a.account.last_error ? ` · ${a.account.last_error}` : ""}
                      </p>
                    </div>
                  </div>
                  <ButtonLink href={`/b/${b.slug}/reseaux/comptes`} size="sm" variant="secondary">
                    Reconnecter
                  </ButtonLink>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* Cartes par business */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-faint">Business</h2>
        {businesses.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {businesses.map((b) => {
              const next = upcoming.filter((p) => p.business_id === b.id).slice(0, 2);
              const last = recent.filter((p) => p.business_id === b.id).slice(0, 2);
              const bAlerts = alerts.filter((a) => a.business_id === b.id).length;
              return (
                <Card key={b.id} className="group flex flex-col overflow-hidden transition hover:shadow-pop">
                  <div className="h-1" style={{ background: b.color }} />
                  <Link href={`/b/${b.slug}`} className="flex items-center gap-3 px-5 pb-3 pt-4">
                    <BusinessMark name={b.name} color={b.color} logoUrl={b.logo_url} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold tracking-tight">{b.name}</p>
                      <p className="truncate text-[12px] text-muted">{b.websites[0]?.replace(/^https?:\/\//, "") ?? b.description ?? ""}</p>
                    </div>
                    {bAlerts ? (
                      <span className="rounded-full bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] px-2 py-0.5 text-[12px] font-medium text-danger">{bAlerts} alerte{bAlerts > 1 ? "s" : ""}</span>
                    ) : (
                      <ArrowUpRight className="size-4 text-faint transition group-hover:text-text" />
                    )}
                  </Link>
                  <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
                    <MiniList title="Prochains" icon={<Clock />} posts={next} slug={b.slug} empty="Rien de programmé" />
                    <MiniList title="Derniers publiés" icon={<CheckCircle2 />} posts={last} slug={b.slug} empty="Aucune publication" />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <EmptyState title="Aucun business" description="Crée ton premier business pour commencer." action={<ButtonLink href="/reglages/business/nouveau" size="sm">Créer un business</ButtonLink>} />
          </Card>
        )}
      </section>

      {/* Calendrier 14 jours */}
      <Card>
        <CardHeader title="14 prochains jours" description="Tous business confondus" />
        <FourteenDays posts={upcoming} businesses={byId} start={now} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* Chiffres 30 jours */}
        <Card>
          <CardHeader title="Réseaux, 30 derniers jours" description="Chiffres réels fournis par les API. « — » quand le réseau ne donne pas la donnée." />
          <div className="overflow-x-auto p-2 pt-3">
            {metrics.length ? (
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
                    <th className="px-3 py-2 font-medium">Compte</th>
                    <th className="px-3 py-2 text-right font-medium">Posts</th>
                    <th className="px-3 py-2 text-right font-medium">Portée</th>
                    <th className="px-3 py-2 text-right font-medium">Interactions</th>
                    <th className="px-3 py-2 text-right font-medium">Abonnés</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metrics
                    .sort((a, b) => (byId.get(a.business_id)?.name ?? "").localeCompare(byId.get(b.business_id)?.name ?? "") || a.network.localeCompare(b.network))
                    .map((m) => {
                      const b = byId.get(m.business_id);
                      return (
                        <tr key={`${m.business_id}:${m.network}`}>
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-2">
                              <NetworkIcon network={m.network} />
                              <span className="font-medium">{NETWORKS[m.network].label}</span>
                              <span className="text-[12px] text-muted">{b?.name}</span>
                            </span>
                          </td>
                          <td className="tabular px-3 py-2.5 text-right">{m.posts}</td>
                          <td className="tabular px-3 py-2.5 text-right">{formatNumber(m.reach)}</td>
                          <td className="tabular px-3 py-2.5 text-right">{formatNumber(m.interactions)}</td>
                          <td className="tabular px-3 py-2.5 text-right">{formatNumber(m.followers)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={<CalendarDays />} title="Pas encore de chiffres" description="Ils apparaissent après les premières publications et la récupération quotidienne." />
            )}
          </div>
        </Card>

        {/* Journal */}
        <Card>
          <CardHeader title="Journal d'activité" />
          <div className="p-5 pt-4">
            <ActivityFeed entries={activity} businesses={bizMap} />
          </div>
        </Card>
      </div>
    </Page>
  );
}

function MiniList({
  title,
  icon,
  posts,
  slug,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  posts: PostSummary[];
  slug: string;
  empty: string;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint [&_svg]:size-3">
        {icon}
        {title}
      </p>
      {posts.length ? (
        <ul className="-mx-3">
          {posts.map((p) => (
            <li key={p.id}>
              <PostRow post={p} href={`/b/${slug}/reseaux/posts/${p.id}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">{empty}</p>
      )}
    </div>
  );
}

function FourteenDays({
  posts,
  businesses,
  start,
}: {
  posts: PostSummary[];
  businesses: Map<string, { slug: string; name: string; color: string }>;
  start: Date;
}) {
  const days = Array.from({ length: 14 }, (_, i) => new Date(start.getTime() + i * 86400_000));
  const today = zurichDayKey(start);
  const fmt = new Intl.DateTimeFormat("fr-CH", { timeZone: TIME_ZONE, weekday: "short" });
  const dayNum = new Intl.DateTimeFormat("fr-CH", { timeZone: TIME_ZONE, day: "numeric" });

  return (
    <div className="scrollbar-none overflow-x-auto p-5 pt-4">
      <div className="grid min-w-[980px] gap-1.5" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
        {days.map((d) => {
          const key = zurichDayKey(d);
          const list = posts.filter((p) => p.scheduled_at && zurichDayKey(p.scheduled_at) === key);
          const weekend = ["sam.", "dim."].includes(fmt.format(d));
          return (
            <div key={key} className={cn("flex min-h-36 flex-col gap-1.5 rounded-xl border border-border p-1.5", weekend ? "bg-surface-2" : "bg-surface", key === today && "ring-1 ring-text")}>
              <div className="flex items-baseline justify-between px-1">
                <span className="text-[11px] uppercase text-faint">{fmt.format(d)}</span>
                <span className={cn("tabular text-sm font-semibold", key === today ? "text-text" : "text-muted")}>{dayNum.format(d)}</span>
              </div>
              {list.map((p) => {
                const b = businesses.get(p.business_id);
                return (
                  <Link
                    key={p.id}
                    href={b ? `/b/${b.slug}/reseaux/posts/${p.id}` : "#"}
                    className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-1.5 text-[11px] shadow-card transition hover:border-border-strong"
                    style={{ borderLeft: `3px solid ${b?.color ?? "var(--border)"}` }}
                  >
                    <span className="tabular text-muted">{formatTime(p.scheduled_at!)}</span>
                    <span className="line-clamp-2 font-medium leading-tight">{postTitle(p)}</span>
                    <span className="flex gap-0.5">
                      {[...new Set(p.targets.map((t) => t.network))].map((n) => (
                        <NetworkIcon key={n} network={n} className="size-3" />
                      ))}
                    </span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
