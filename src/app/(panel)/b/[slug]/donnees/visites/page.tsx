import type { Metadata } from "next";
import { PlugZap } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { Bars, channelLabel, Ranking } from "@/components/data-blocks";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodChips } from "@/components/period-chips";
import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { periodFrom, periodShort, weekly } from "@/lib/finance";
import Link from "next/link";
import { MultiLineChart } from "@/components/charts/multi-line-chart";
import { cn } from "@/components/ui/cn";
import { listConnectors, type SeriesPoint } from "@/lib/metrics";
import { overlap, trafficSources, type TrafficSource, type TrafficSourceId } from "@/lib/traffic";
import { chartMarkers, listMilestones } from "@/lib/milestones";

export const metadata: Metadata = { title: "Visites" };

const total = (s: SeriesPoint[] | null) => (s ? s.reduce((a, p) => a + p.value, 0) : null);

export default async function VisitsPage({ params, searchParams }: PageProps<"/b/[slug]/donnees/visites">) {
  const { slug } = await params;
  const period = periodFrom((await searchParams).periode, 30);
  const business = await getBusiness(slug);
  const marks = chartMarkers(await listMilestones(business.id));
  const base = `/b/${business.slug}/donnees`;
  const id = business.id;

  const query = await searchParams;
  const [connectors, sources] = await Promise.all([listConnectors(id), trafficSources(id, period)]);
  // Une seule source pour les chiffres, jamais additionnée : celle choisie, sinon Cloudflare, puis Google Analytics.
  const chosen = sources.find((s) => s.id === query.source) ?? sources[0];
  const visitors = chosen?.visitors ?? null;
  const visits = chosen?.visits ?? null;
  const pageviews = chosen?.pageviews ?? null;
  const source = chosen?.label ?? "";
  const ga = connectors.find((c) => c.kind === "google_analytics" && c.status === "connected");
  const cf = connectors.find((c) => c.kind === "cloudflare" && c.status === "connected");
  const long = period > 90;
  const per = long ? "semaine" : "jour";
  const t = { visitors: total(visitors), visits: total(visits), pageviews: total(pageviews) };

  if (!visits) {
    return (
      <Card>
        <EmptyState
          icon={<PlugZap />}
          title="Aucune source de visites"
          description="Connecte Cloudflare Web Analytics (sans cookies) ou Google Analytics pour suivre la fréquentation, jour après jour."
          action={<ButtonLink href={`${base}/connecteurs`} size="sm">Connecter</ButtonLink>}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sources.length > 1 ? (
          <div className="scrollbar-none flex max-w-full gap-1 overflow-x-auto rounded-full bg-fill p-1" aria-label="Source des chiffres">
            {sources.map((s) => (
              <Link
                key={s.id}
                href={{ pathname: `${base}/visites`, query: { periode: String(period), source: s.id } }}
                scroll={false}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] transition",
                  s.id === chosen.id ? "bg-surface font-medium text-text shadow-card" : "text-muted hover:text-text",
                )}
              >
                {s.label}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">D&apos;après {source}.</p>
        )}
        <PeriodChips base={`${base}/visites`} current={period} extra={query.source && typeof query.source === "string" ? { source: query.source } : {}} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={`Visites · ${periodShort(period)}`} amount={t.visits} format={{ kind: "number" }} trend={visits.map((p) => p.value)} empty="" href={base} />
        <KpiTile
          label={`Visiteurs · ${periodShort(period)}`}
          amount={t.visitors}
          format={{ kind: "number" }}
          trend={visitors?.map((p) => p.value)}
          empty={chosen.id === "cloudflare" ? "Non compté sans cookies" : "Pas de donnée"}
          href={base}
        />
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
        <CardHeader title="Visites" description={`Visites par ${per}, d'après ${source}.`} />
        <div className="p-5 pt-6 sm:p-6">
          <AreaChart markers={marks} points={long ? weekly(visits) : visits} format={{ kind: "number" }} label={`Visites par ${per}`} />
        </div>
      </Card>

      {sources.length > 1 ? <Comparison sources={sources} reference={chosen.id} long={long} per={per} /> : null}

      {pageviews ? (
        <Card>
          <CardHeader title="Pages vues" description={`Pages affichées par ${per}.`} />
          <div className="p-5 pt-6 sm:p-6">
            <AreaChart markers={marks} points={long ? weekly(pageviews) : pageviews} format={{ kind: "number" }} label={`Pages vues par ${per}`} height={160} />
          </div>
        </Card>
      ) : null}

      {cf && (cf.snapshot.hosts ?? []).length ? (
        <Card>
          <CardHeader title="Sous-domaines, provenance et pays" description="30 derniers jours, d'après Cloudflare." />
          <div className="grid gap-8 p-5 pt-6 sm:p-6 lg:grid-cols-2">
            <Bars title="Sous-domaines" unit="visites" rows={(cf.snapshot.hosts ?? []).map((h) => ({ key: h.key, value: h.visits }))} />
            <Bars title="Sites d'où l'on vient" unit="visites" rows={(cf.snapshot.referrers ?? []).map((r) => ({ key: r.key, value: r.value }))} />
            <Ranking title="Pages les plus vues" columns={["Vues"]} rows={(cf.snapshot.pages ?? []).map((p) => ({ id: p.key, label: p.key, values: [p.views ?? 0] }))} />
            <Bars title="Pays" unit="visites" rows={(cf.snapshot.countries ?? []).map((c) => ({ key: c.key, value: c.value }))} />
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

const nf = (v: number) => Math.round(v).toLocaleString("fr-CH");

/**
 * Croisement des sources : les mêmes visites vues par deux outils. Chaque ligne à part, jamais additionnées ;
 * l'écart est calculé sur les seuls jours où les deux ont mesuré (sinon une source plus récente fausserait tout).
 */
function Comparison({ sources, reference, long, per }: { sources: TrafficSource[]; reference: TrafficSourceId; long: boolean; per: string }) {
  const ref = sources.find((s) => s.id === reference)!;
  const ordered = [ref, ...sources.filter((s) => s.id !== reference)];
  return (
    <Card>
      <CardHeader title="Comparaison des sources" description={`Visites par ${per}, chaque outil sur sa propre ligne : les chiffres se recoupent, ils ne s'additionnent pas.`} />
      <div className="flex flex-col gap-5 p-5 pt-6 sm:p-6">
        <MultiLineChart series={ordered.map((s) => ({ label: s.label, points: long ? weekly(s.visits) : s.visits }))} format={{ kind: "number" }} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="py-2 pr-3 font-normal">Source</th>
                <th className="px-3 py-2 text-right font-normal">Visites</th>
                <th className="px-3 py-2 text-right font-normal">Pages vues</th>
                <th className="py-2 pl-3 text-right font-normal">Par rapport à {ref.label}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ordered.map((s) => {
                const o = s.id === ref.id ? null : overlap(s.visits, ref.visits);
                const ratio = o && o.b > 0 ? o.a / o.b : null;
                return (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{s.label}</span>
                      <span className="block text-[11px] text-muted">{s.note}</span>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-semibold">{nf(s.visits.reduce((a, p) => a + p.value, 0))}</td>
                    <td className="tabular px-3 py-2.5 text-right">{s.pageviews ? nf(s.pageviews.reduce((a, p) => a + p.value, 0)) : "—"}</td>
                    <td className="tabular py-2.5 pl-3 text-right text-muted">
                      {s.id === ref.id
                        ? "référence"
                        : ratio === null
                          ? "aucun jour en commun"
                          : `${ratio >= 1 ? "+" : "−"}${Math.abs(Math.round((ratio - 1) * 100))} % sur ${o!.days} j en commun`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-faint">
          Les outils ne voient pas tous les visiteurs : Google Analytics perd ceux qui refusent les cookies, Cloudflare (sans cookies) seulement ceux qui bloquent les scripts. L&apos;écart
          entre deux courbes est donc normal ; c&apos;est sa variation dans le temps qui alerte.
        </p>
      </div>
    </Card>
  );
}
