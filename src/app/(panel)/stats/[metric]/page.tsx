import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatValue, type ValueFormat } from "@/components/charts/format";
import { BusinessMark } from "@/components/business-mark";
import { visitorSeries } from "@/components/kpi-strip";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodChips } from "@/components/period-chips";
import { Page } from "@/components/shell/page";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { listBusinesses, metricsLast30Days } from "@/lib/data";
import { financeSummary, periodFrom, periodShort, weekly } from "@/lib/finance";
import { metricSeries, searchPosition, type SeriesPoint } from "@/lib/metrics";
import { NETWORKS } from "@/lib/social/networks";

const METRICS = {
  finances: { title: "Finances", description: "Encaissements, charges et résultat de tous les business réunis." },
  visites: { title: "Visites", description: "Visiteurs de tous les sites, jour après jour." },
  recherche: { title: "Recherche Google", description: "Clics venus de Google sur tous les sites." },
  reseaux: { title: "Réseaux sociaux", description: "Posts publiés, portée et abonnés sur 30 jours." },
} as const;
type Metric = keyof typeof METRICS;

export async function generateMetadata({ params }: PageProps<"/stats/[metric]">): Promise<Metadata> {
  const { metric } = await params;
  return { title: METRICS[metric as Metric]?.title ?? "Statistiques" };
}

const sum = (s: SeriesPoint[] | null) => (s ? s.reduce((a, p) => a + p.value, 0) : null);
const number = { kind: "number" } as const;

/** Une ligne par business : ses chiffres et le lien vers son propre détail. */
type Row = { id: string; name: string; logo: string | null; href: string; values: (string | null)[]; tone?: "up" | "down" };

export default async function StatsPage({ params, searchParams }: PageProps<"/stats/[metric]">) {
  const { metric } = await params;
  if (!(metric in METRICS)) notFound();
  const m = metric as Metric;
  const period = periodFrom((await searchParams).periode, 30);
  const businesses = await listBusinesses();
  const q = `?periode=${period}`;

  let chart: { points: SeriesPoint[]; format: ValueFormat; label: string; title: string } | null = null;
  let tiles: { label: string; amount: number | null; format: ValueFormat; hint?: string }[] = [];
  let columns: string[] = [];
  let rows: Row[] = [];
  const long = period > 90;
  const per = long ? "semaine" : "jour";

  if (m === "finances") {
    const [all, each] = await Promise.all([financeSummary(undefined, period), Promise.all(businesses.map((b) => financeSummary(b.id, period)))]);
    const cur = { kind: "currency", currency: all.currency } as const;
    chart = { points: long ? weekly(all.net) : all.net, format: cur, label: "Résultat", title: `Résultat par ${per}` };
    tiles = [
      { label: `Encaissé · ${periodShort(period)}`, amount: all.totals.income, format: cur },
      { label: `Charges · ${periodShort(period)}`, amount: all.totals.expenses, format: cur, hint: all.totals.fees ? `dont ${formatValue(all.totals.fees, cur)} de frais Stripe` : undefined },
      { label: `Résultat · ${periodShort(period)}`, amount: all.totals.net, format: cur },
      { label: `Remboursé · ${periodShort(period)}`, amount: all.totals.refunds, format: cur, hint: `${all.totals.payments} paiement${all.totals.payments > 1 ? "s" : ""} Stripe` },
    ];
    columns = ["Encaissé", "Charges", "Résultat"];
    rows = businesses.map((b, i) => {
      const s = each[i];
      const c = { kind: "currency", currency: s.currency } as const;
      const has = s.hasStripe || s.hasEntries;
      return {
        id: b.id,
        name: b.name,
        logo: b.logo_url,
        href: `/b/${b.slug}/donnees/finances${q}`,
        values: has ? [formatValue(s.totals.income, c), formatValue(s.totals.expenses, c), formatValue(s.totals.net, c)] : [null, null, null],
        tone: has ? (s.totals.net < 0 ? "down" : s.totals.net > 0 ? "up" : undefined) : undefined,
      };
    });
  } else if (m === "visites") {
    const [all, each] = await Promise.all([visitorSeries(businesses, period), Promise.all(businesses.map((b) => visitorSeries([b], period)))]);
    if (all) chart = { points: long ? weekly(all) : all, format: number, label: `Visiteurs par ${per}`, title: `Visiteurs par ${per}` };
    tiles = [{ label: `Visiteurs · ${periodShort(period)}`, amount: sum(all), format: number, hint: "Plausible ou Google Analytics, selon le site" }];
    columns = ["Visiteurs"];
    rows = businesses.map((b, i) => ({
      id: b.id,
      name: b.name,
      logo: b.logo_url,
      href: `/b/${b.slug}/donnees/visites${q}`,
      values: [each[i] ? formatValue(sum(each[i])!, number) : null],
    }));
  } else if (m === "recherche") {
    const [clicks, impressions, each] = await Promise.all([
      metricSeries({ metric: "search_clicks", trimTrailing: true, days: period }),
      metricSeries({ metric: "search_impressions", trimTrailing: true, days: period }),
      Promise.all(
        businesses.map((b) =>
          Promise.all([
            metricSeries({ businessId: b.id, metric: "search_clicks", trimTrailing: true, days: period }),
            metricSeries({ businessId: b.id, metric: "search_impressions", trimTrailing: true, days: period }),
            searchPosition(b.id, period),
          ]),
        ),
      ),
    ]);
    if (clicks) chart = { points: long ? weekly(clicks) : clicks, format: number, label: `Clics par ${per}`, title: `Clics depuis Google par ${per}` };
    const c = sum(clicks);
    const imp = sum(impressions);
    tiles = [
      { label: `Clics · ${periodShort(period)}`, amount: c, format: number },
      { label: `Impressions · ${periodShort(period)}`, amount: imp, format: number },
      { label: "Taux de clic", amount: c !== null && imp ? Math.round((c / imp) * 1000) / 10 : null, format: { kind: "percent" }, hint: "clics ÷ impressions" },
    ];
    columns = ["Clics", "Impr.", "Pos."];
    rows = businesses.map((b, i) => {
      const [bc, bi, pos] = each[i];
      return {
        id: b.id,
        name: b.name,
        logo: b.logo_url,
        href: `/b/${b.slug}/donnees/recherche${q}`,
        values: bc ? [formatValue(sum(bc)!, number, true), formatValue(sum(bi) ?? 0, number, true), pos !== null ? pos.toLocaleString("fr-CH") : "—"] : [null, null, null],
      };
    });
  } else {
    const metrics = await metricsLast30Days();
    const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);
    const total = (list: typeof metrics) => ({
      posts: list.reduce((a, x) => a + x.posts, 0),
      reach: list.reduce<number | null>((a, x) => add(a, x.reach), null),
      interactions: list.reduce<number | null>((a, x) => add(a, x.interactions), null),
      followers: list.reduce<number | null>((a, x) => add(a, x.followers), null),
    });
    const t = total(metrics);
    tiles = [
      { label: "Posts publiés · 30 j", amount: t.posts, format: number },
      { label: "Portée · 30 j", amount: t.reach, format: number, hint: "selon ce que chaque réseau fournit" },
      { label: "Interactions · 30 j", amount: t.interactions, format: number },
      { label: "Abonnés", amount: t.followers, format: number, hint: "dernier relevé de chaque compte" },
    ];
    columns = ["Posts", "Portée", "Abonnés"];
    const fmt = (v: number | null) => (v === null ? "—" : formatValue(v, number, true));
    rows = businesses.map((b) => {
      const own = metrics.filter((x) => x.business_id === b.id);
      const bt = total(own);
      return {
        id: b.id,
        name: b.name,
        logo: b.logo_url,
        href: `/b/${b.slug}/reseaux/historique`,
        values: own.length ? [fmt(bt.posts), fmt(bt.reach), fmt(bt.followers)] : [null, null, null],
      };
    });
    // Détail par réseau, tous business confondus.
    const networks = [...new Set(metrics.map((x) => x.network))];
    if (networks.length) {
      const byNetwork = networks.map((n) => ({ n, ...total(metrics.filter((x) => x.network === n)) }));
      return (
        <StatsLayout metric={m} period={null}>
          <Tiles tiles={tiles} />
          <BusinessTable columns={columns} rows={rows} />
          <Card>
            <CardHeader title="Par réseau" description="Tous business confondus, 30 derniers jours." />
            <div className="p-2 pt-3">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[12px] text-muted">
                    <th className="px-3 pb-2 text-left font-normal">Réseau</th>
                    {columns.map((c) => (
                      <th key={c} className="w-20 px-3 pb-2 text-right font-normal">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tabular">
                  {byNetwork.map((r) => (
                    <tr key={r.n} className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium">{NETWORKS[r.n].label}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(r.posts)}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{fmt(r.reach)}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{fmt(r.followers)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </StatsLayout>
      );
    }
    return (
      <StatsLayout metric={m} period={null}>
        <Tiles tiles={tiles} />
        <BusinessTable columns={columns} rows={rows} />
      </StatsLayout>
    );
  }

  return (
    <StatsLayout metric={m} period={period}>
      <Tiles tiles={tiles} />
      {chart ? (
        <Card>
          <CardHeader title={chart.title} description="Tous les business réunis." />
          <div className="p-5 pt-6 sm:p-6">
            <AreaChart points={chart.points} format={chart.format} label={chart.label} height={200} />
          </div>
        </Card>
      ) : null}
      <BusinessTable columns={columns} rows={rows} primary={m === "finances" ? 2 : 0} />
    </StatsLayout>
  );
}

function StatsLayout({ metric, period, children }: { metric: Metric; period: number | null; children: React.ReactNode }) {
  return (
    <Page>
      <PageHeader eyebrow="Tous les business" title={METRICS[metric].title} description={METRICS[metric].description} />
      <div className="flex flex-col gap-6">
        {period !== null ? (
          <div className="-mb-2 flex justify-end">
            <PeriodChips base={`/stats/${metric}`} current={period} />
          </div>
        ) : null}
        {children}
      </div>
    </Page>
  );
}

function Tiles({ tiles }: { tiles: { label: string; amount: number | null; format: ValueFormat; hint?: string }[] }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", tiles.length >= 4 ? "lg:grid-cols-4" : tiles.length === 3 ? "lg:grid-cols-3" : "")}>
      {tiles.map((t) => (
        <KpiTile key={t.label} label={t.label} amount={t.amount} format={t.format} hint={t.hint} empty="Aucune source" href="/" />
      ))}
    </div>
  );
}

/** Sur téléphone, seule la colonne principale reste visible. */
function BusinessTable({ columns, rows, primary = 0 }: { columns: string[]; rows: Row[]; primary?: number }) {
  return (
    <Card>
      <CardHeader title="Par business" description="Touche une ligne pour voir le détail de ce business." />
      <ul className="divide-y divide-border p-2 pt-1">
        <li className="flex items-center gap-3 px-3 pb-2 pt-2 text-[12px] text-muted">
          <span className="flex-1">Business</span>
          {columns.map((c, i) => (
            <span key={c} className={cn("w-24 text-right", i !== primary && "hidden sm:block")}>
              {c}
            </span>
          ))}
          <span className="w-4" />
        </li>
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={r.href} className="flex items-center gap-3 rounded-[12px] px-3 py-3 transition hover:bg-fill">
              <BusinessMark name={r.name} logoUrl={r.logo} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.name}</span>
              {r.values.every((v) => v === null) ? (
                <span className="text-[12px] text-faint">Aucune source</span>
              ) : (
                r.values.map((v, i) => (
                  <span
                    key={i}
                    className={cn(
                      "tabular w-24 text-right text-[13px]",
                      i !== primary && "hidden sm:block",
                      i === r.values.length - 1 && r.tone === "up" ? "text-green-text" : i === r.values.length - 1 && r.tone === "down" ? "text-danger" : "text-muted",
                    )}
                  >
                    {v ?? "—"}
                  </span>
                ))
              )}
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
