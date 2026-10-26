import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatValue } from "@/components/charts/format";
import { PositionChart } from "@/components/charts/position-chart";
import { pageLabel, Ranking } from "@/components/data-blocks";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodChips } from "@/components/period-chips";
import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { periodFrom, periodShort, weekly } from "@/lib/finance";
import { keywordRankings } from "@/lib/keywords";
import { listConnectors, metricSeries, searchPosition } from "@/lib/metrics";

export const metadata: Metadata = { title: "Recherche Google" };

export default async function SearchPage({ params, searchParams }: PageProps<"/b/[slug]/donnees/recherche">) {
  const { slug } = await params;
  const period = periodFrom((await searchParams).periode, 30);
  const business = await getBusiness(slug);
  const base = `/b/${business.slug}/donnees`;
  const id = business.id;

  const [connectors, clicks, impressions, positions, position, queries] = await Promise.all([
    listConnectors(id),
    metricSeries({ businessId: id, metric: "search_clicks", trimTrailing: true, days: period }),
    metricSeries({ businessId: id, metric: "search_impressions", trimTrailing: true, days: period }),
    metricSeries({ businessId: id, metric: "search_position", trimTrailing: true, days: period }),
    searchPosition(id, period),
    keywordRankings(id, period),
  ]);
  const gsc = connectors.find((c) => c.kind === "search_console");

  if (!gsc || !clicks || !impressions) {
    return (
      <Card>
        <EmptyState
          icon={<Search />}
          title={gsc ? "En attente des premiers chiffres" : "Search Console pas connectée"}
          description="Clics, impressions, position moyenne et mots les plus cherchés pour arriver sur ton site."
          action={<ButtonLink href={`${base}/connecteurs`} size="sm">{gsc ? "Voir le connecteur" : "Connecter avec Google"}</ButtonLink>}
        />
      </Card>
    );
  }

  const long = period > 90;
  const per = long ? "semaine" : "jour";
  const totalClicks = clicks.reduce((a, p) => a + p.value, 0);
  const totalImpressions = impressions.reduce((a, p) => a + p.value, 0);
  // Position du jour : absente (et non 0) les jours sans impression.
  const byDay = new Map((positions ?? []).map((p) => [p.day, p.value]));
  const shown = new Map(impressions.map((p) => [p.day, p.value]));
  const positionPoints = clicks.map((p) => ({
    day: p.day,
    clicks: p.value,
    impressions: shown.get(p.day) ?? 0,
    position: (shown.get(p.day) ?? 0) > 0 && (byDay.get(p.day) ?? 0) > 0 ? Math.round(byDay.get(p.day)! * 10) / 10 : null,
  }));
  const top = [...queries].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 15);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted">
          D&apos;après la Search Console, avec 2 à 3 jours de décalage. Un clic ici, c&apos;est quelqu&apos;un qui arrive depuis Google ; les Visites
          comptent toutes les sources (Google, accès direct, réseaux, liens), mesurées par un autre outil.
        </p>
        <PeriodChips base={`${base}/recherche`} current={period} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={`Clics · ${periodShort(period)}`} amount={totalClicks} format={{ kind: "number" }} trend={clicks.map((p) => p.value)} empty="" href={base} />
        <KpiTile label={`Impressions · ${periodShort(period)}`} amount={totalImpressions} format={{ kind: "number" }} trend={impressions.map((p) => p.value)} empty="" href={base} />
        <KpiTile
          label="Taux de clic"
          amount={totalImpressions ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : null}
          format={{ kind: "percent" }}
          hint="clics ÷ impressions"
          empty="Pas de donnée"
          href={base}
        />
        <KpiTile label="Position moyenne" amount={position} format={{ kind: "number" }} hint="pondérée par les impressions" empty="Pas de donnée" href={base} />
      </div>

      <Card>
        <CardHeader title="Clics depuis Google" description={`Visites venues de la recherche, par ${per}.`} />
        <div className="p-5 pt-6 sm:p-6">
          <AreaChart points={long ? weekly(clicks) : clicks} format={{ kind: "number" }} label={`Clics par ${per}`} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Impressions" description={`Fois où ton site est apparu dans Google, par ${per}.`} />
          <div className="p-5 pt-6 sm:p-6">
            <AreaChart points={long ? weekly(impressions) : impressions} format={{ kind: "number" }} label={`Impressions par ${per}`} height={160} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Position moyenne" description="Plus c'est haut, mieux c'est : 1 est la première place." />
          <div className="p-5 pt-6 sm:p-6">
            <PositionChart points={positionPoints} height={160} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Mots les plus cherchés"
          description={`Requêtes qui t'amènent du monde sur ${periodShort(period)}, classées par clics.`}
          action={<ButtonLink href={`${base}/mots-cles`} size="sm" variant="secondary">Tous les mots-clés</ButtonLink>}
        />
        <div className="p-2 pt-3">
          {top.length ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[12px] text-muted">
                  <th className="px-3 pb-2 text-left font-normal">Requête</th>
                  <th className="w-16 px-3 pb-2 text-right font-normal">Clics</th>
                  <th className="hidden w-20 px-3 pb-2 text-right font-normal sm:table-cell">Impr.</th>
                  <th className="hidden w-20 px-3 pb-2 text-right font-normal sm:table-cell">CTR</th>
                  <th className="w-14 px-3 pb-2 text-right font-normal">Pos.</th>
                </tr>
              </thead>
              <tbody className="tabular whitespace-nowrap">
                {top.map((k) => (
                  <tr key={k.query} className="border-t border-border">
                    <td className="max-w-0 px-3 py-2.5">
                      <Link href={`${base}/mots-cles/${encodeURIComponent(k.query)}`} className="block truncate font-medium hover:underline">
                        {k.query}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatValue(k.clicks, { kind: "number" }, true)}</td>
                    <td className="hidden px-3 py-2.5 text-right text-muted sm:table-cell">{formatValue(k.impressions, { kind: "number" }, true)}</td>
                    <td className="hidden px-3 py-2.5 text-right text-muted sm:table-cell">{k.ctr !== null ? `${k.ctr.toLocaleString("fr-CH")} %` : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{k.position !== null ? k.position.toLocaleString("fr-CH", { maximumFractionDigits: 1 }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-3 py-6 text-center text-[13px] text-muted">Aucune requête sur cette période.</p>
          )}
        </div>
      </Card>

      {(gsc.snapshot.pages ?? []).length ? (
        <Card>
          <CardHeader title="Pages qui reçoivent ces clics" description="28 derniers jours, d'après la Search Console." />
          <div className="p-5 pt-6 sm:p-6">
            <Ranking
              title="Pages"
              columns={["Clics", "Impr.", "Pos."]}
              rows={(gsc.snapshot.pages ?? []).map((p) => ({ id: p.key, label: pageLabel(p.key, gsc.config.site_url), values: [p.clicks ?? 0, p.impressions ?? 0, p.position ?? 0] }))}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
