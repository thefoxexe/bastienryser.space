import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Globe, PlugZap } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatValue } from "@/components/charts/format";
import { Sparkline } from "@/components/charts/sparkline";
import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { SiteDot } from "@/components/charts/site-dot";
import { getBusiness } from "@/lib/data";
import { listConnectors, metricSeries, revenueCurrencies, siteStatuses, type SeriesPoint } from "@/lib/metrics";

export const metadata: Metadata = { title: "Données" };

const sum = (s: SeriesPoint[] | null) => (s ? s.reduce((a, p) => a + p.value, 0) : null);

export default async function DataOverview({ params }: PageProps<"/b/[slug]/donnees">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const base = `/b/${business.slug}/donnees`;

  const [connectors, visitors, pageviews, currencies, sites] = await Promise.all([
    listConnectors(business.id),
    metricSeries({ businessId: business.id, metric: "visitors" }),
    metricSeries({ businessId: business.id, metric: "pageviews" }),
    revenueCurrencies(business.id),
    siteStatuses([{ id: business.id, websites: business.websites }], business.id),
  ]);
  const mainCurrency = currencies[0]?.unit;
  const revenue = mainCurrency
    ? await metricSeries({ businessId: business.id, metric: "revenue", unit: mainCurrency })
    : connectors.some((c) => c.kind === "stripe")
      ? await metricSeries({ businessId: business.id, metric: "revenue" })
      : null;

  const measured = sites.filter((s) => s.uptime30d !== null);
  const uptime = measured.length ? measured.reduce((a, s) => a + (s.uptime30d ?? 0), 0) / measured.length : null;
  const down = sites.filter((s) => s.last && !s.last.ok);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Visiteurs · 30 j"
          value={visitors ? formatValue(sum(visitors)!, { kind: "number" }) : null}
          trend={visitors?.map((p) => p.value)}
          empty="Connecter Plausible"
          href={`${base}/connecteurs`}
        />
        <Tile
          label="Pages vues · 30 j"
          value={pageviews ? formatValue(sum(pageviews)!, { kind: "number" }) : null}
          trend={pageviews?.map((p) => p.value)}
          empty="Connecter Plausible"
          href={`${base}/connecteurs`}
        />
        <Tile
          label="Revenus · 30 j"
          value={revenue ? formatValue(sum(revenue)!, mainCurrency ? { kind: "currency", currency: mainCurrency } : { kind: "number" }) : null}
          hint={currencies.length > 1 ? `+ ${currencies.slice(1).map((c) => formatValue(c.total, { kind: "currency", currency: c.unit })).join(", ")}` : undefined}
          trend={revenue?.map((p) => p.value)}
          empty="Connecter Stripe"
          href={`${base}/connecteurs`}
        />
        <Tile
          label="Disponibilité · 30 j"
          value={uptime !== null ? formatValue(uptime, { kind: "percent" }) : null}
          hint={down.length ? `${down.length} site${down.length > 1 ? "s" : ""} injoignable${down.length > 1 ? "s" : ""}` : measured.length ? "Tous les sites répondent" : undefined}
          alert={down.length > 0}
          empty={business.websites.length ? "Première mesure sous 5 min" : "Ajouter un site web"}
          href={business.websites.length ? `${base}/sites` : `/reglages/business/${business.slug}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Visiteurs" description="Visiteurs uniques par jour, d'après Plausible." />
          <div className="p-5 pt-6 sm:p-6">
            {visitors ? (
              <AreaChart points={visitors} format={{ kind: "number" }} label="Visiteurs par jour" />
            ) : (
              <EmptyState icon={<PlugZap />} title="Aucune source de visites" description="Connecte Plausible pour suivre la fréquentation de ton site." action={<ButtonLink href={`${base}/connecteurs`} size="sm">Connecter</ButtonLink>} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Revenus" description={mainCurrency ? `Paiements encaissés par jour (${mainCurrency.toUpperCase()}), remboursements déduits.` : "Paiements encaissés par jour, d'après Stripe."} />
          <div className="p-5 pt-6 sm:p-6">
            {revenue ? (
              <AreaChart points={revenue} format={mainCurrency ? { kind: "currency", currency: mainCurrency } : { kind: "number" }} label="Revenus par jour" />
            ) : (
              <EmptyState icon={<PlugZap />} title="Aucune source de revenus" description="Connecte Stripe (clé en lecture seule) pour suivre les paiements." action={<ButtonLink href={`${base}/connecteurs`} size="sm">Connecter</ButtonLink>} />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Sites web" action={<ButtonLink href={`${base}/sites`} variant="ghost" size="sm">Détails</ButtonLink>} />
        <div className="p-2 pt-3">
          {sites.length ? (
            <ul className="divide-y divide-border">
              {sites.map((s) => (
                <li key={s.url} className="flex items-center gap-3 px-3 py-3">
                  <SiteDot ok={s.last ? s.last.ok : null} />
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="group flex min-w-0 flex-1 items-center gap-1 text-[14px] font-medium">
                    <span className="truncate">{s.host}</span>
                    <ArrowUpRight className="size-3 shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
                  </a>
                  <span className="tabular hidden text-[13px] text-muted sm:inline">{s.last?.response_ms ? `${s.last.response_ms} ms` : ""}</span>
                  <span className="tabular w-20 text-right text-[13px] text-muted">{s.uptime30d !== null ? formatValue(s.uptime30d, { kind: "percent" }) : "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Globe />} title="Aucun site web" description="Ajoute les adresses des sites dans les réglages du business pour les surveiller." action={<ButtonLink href={`/reglages/business/${business.slug}`} size="sm">Ajouter</ButtonLink>} />
          )}
        </div>
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  trend,
  empty,
  href,
  alert,
}: {
  label: string;
  value: string | null;
  hint?: string;
  trend?: number[];
  empty: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Card className="flex flex-col justify-between gap-3 p-4 sm:p-5">
      <span className="text-[13px] text-muted">{label}</span>
      {value !== null ? (
        <>
          <span className="font-[family-name:var(--font-display)] text-[26px] font-semibold leading-none tracking-[-0.03em] sm:text-[30px]">{value}</span>
          <div className="flex items-end justify-between gap-2">
            <span className={cn("text-[12px]", alert ? "font-medium text-danger" : "text-faint")}>{hint ?? ""}</span>
            {trend ? <Sparkline values={trend} className="h-7 w-20 shrink-0" /> : null}
          </div>
        </>
      ) : (
        <Link href={href} className="text-[14px] font-medium text-muted transition hover:text-text">
          {empty} →
        </Link>
      )}
    </Card>
  );
}
