import type { Metadata } from "next";
import { PlugZap } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { Bars, channelLabel, Ranking } from "@/components/data-blocks";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodChips } from "@/components/period-chips";
import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { periodFrom, periodShort, weekly } from "@/lib/finance";
import { listConnectors, metricSeries, type SeriesPoint } from "@/lib/metrics";

export const metadata: Metadata = { title: "Visites" };

const total = (s: SeriesPoint[] | null) => (s ? s.reduce((a, p) => a + p.value, 0) : null);

export default async function VisitsPage({ params, searchParams }: PageProps<"/b/[slug]/donnees/visites">) {
  const { slug } = await params;
  const period = periodFrom((await searchParams).periode, 30);
  const business = await getBusiness(slug);
  const base = `/b/${business.slug}/donnees`;
  const id = business.id;

  const [connectors, plVisitors, plVisits, plPageviews, gaUsers, gaSessions, gaPageviews] = await Promise.all([
    listConnectors(id),
    metricSeries({ businessId: id, metric: "visitors", days: period }),
    metricSeries({ businessId: id, metric: "visits", days: period }),
    metricSeries({ businessId: id, metric: "pageviews", days: period }),
    metricSeries({ businessId: id, metric: "ga_users", days: period }),
    metricSeries({ businessId: id, metric: "ga_sessions", days: period }),
    metricSeries({ businessId: id, metric: "ga_pageviews", days: period }),
  ]);
  // Une seule source, jamais additionnée : Plausible s'il est branché, sinon Google Analytics.
  const plausible = Boolean(plVisitors);
  const visitors = plVisitors ?? gaUsers;
  const visits = plausible ? plVisits : gaSessions;
  const pageviews = plausible ? plPageviews : gaPageviews;
  const source = plausible ? "Plausible" : "Google Analytics";
  const ga = connectors.find((c) => c.kind === "google_analytics" && c.status === "connected");
  const long = period > 90;
  const per = long ? "semaine" : "jour";
  const t = { visitors: total(visitors), visits: total(visits), pageviews: total(pageviews) };

  if (!visitors) {
    return (
      <Card>
        <EmptyState
          icon={<PlugZap />}
          title="Aucune source de visites"
          description="Connecte Google Analytics ou Plausible pour suivre la fréquentation, jour après jour."
          action={<ButtonLink href={`${base}/connecteurs`} size="sm">Connecter</ButtonLink>}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">D&apos;après {source}. Chaque visiteur n&apos;est compté qu&apos;une fois par jour.</p>
        <PeriodChips base={`${base}/visites`} current={period} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={`Visiteurs · ${periodShort(period)}`} amount={t.visitors} format={{ kind: "number" }} trend={visitors.map((p) => p.value)} empty="" href={base} />
        <KpiTile label={`Visites · ${periodShort(period)}`} amount={t.visits} format={{ kind: "number" }} trend={visits?.map((p) => p.value)} empty="Pas de donnée" href={base} />
        <KpiTile label={`Pages vues · ${periodShort(period)}`} amount={t.pageviews} format={{ kind: "number" }} trend={pageviews?.map((p) => p.value)} empty="Pas de donnée" href={base} />
        <KpiTile
          label="Pages par visite"
          amount={t.visits && t.pageviews !== null ? Math.round((t.pageviews / t.visits) * 10) / 10 : null}
          format={{ kind: "number" }}
          hint="sur la période"
          empty="Pas de donnée"
          href={base}
        />
      </div>

      <Card>
        <CardHeader title="Visiteurs" description={`Visiteurs uniques par ${per}.`} />
        <div className="p-5 pt-6 sm:p-6">
          <AreaChart points={long ? weekly(visitors) : visitors} format={{ kind: "number" }} label={`Visiteurs par ${per}`} />
        </div>
      </Card>

      {pageviews ? (
        <Card>
          <CardHeader title="Pages vues" description={`Pages affichées par ${per}.`} />
          <div className="p-5 pt-6 sm:p-6">
            <AreaChart points={long ? weekly(pageviews) : pageviews} format={{ kind: "number" }} label={`Pages vues par ${per}`} height={160} />
          </div>
        </Card>
      ) : null}

      {ga && ((ga.snapshot.channels ?? []).length || (ga.snapshot.pages ?? []).length) ? (
        <Card>
          <CardHeader title="Provenance et contenus" description="30 derniers jours, d'après Google Analytics." />
          <div className="grid gap-8 p-5 pt-6 sm:p-6 lg:grid-cols-2">
            <Bars title="Canaux d'acquisition" unit="sessions" rows={(ga.snapshot.channels ?? []).map((c) => ({ key: channelLabel(c.key), value: c.sessions }))} />
            <Ranking title="Pages les plus vues" columns={["Vues"]} rows={(ga.snapshot.pages ?? []).map((p) => ({ id: p.key, label: p.key, values: [p.views ?? 0] }))} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
