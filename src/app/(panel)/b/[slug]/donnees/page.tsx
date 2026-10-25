import type { Metadata } from "next";
import { ArrowUpRight, Globe, PlugZap, Search } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatValue } from "@/components/charts/format";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodChips } from "@/components/period-chips";
import { ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { SiteDot } from "@/components/charts/site-dot";
import { getBusiness } from "@/lib/data";
import { financeSummary, periodFrom, periodShort, weekly } from "@/lib/finance";
import { listConnectors, metricSeries, searchPosition, siteStatuses, type SeriesPoint } from "@/lib/metrics";

export const metadata: Metadata = { title: "Données" };

const sum = (s: SeriesPoint[] | null) => (s ? s.reduce((a, p) => a + p.value, 0) : null);

export default async function DataOverview({ params, searchParams }: PageProps<"/b/[slug]/donnees">) {
  const { slug } = await params;
  const period = periodFrom((await searchParams).periode, 30);
  const business = await getBusiness(slug);
  const base = `/b/${business.slug}/donnees`;
  const days = period;

  const [connectors, plVisitors, plPageviews, gaUsers, gaPageviews, clicks, impressions, position, finance, sites] = await Promise.all([
    listConnectors(business.id),
    metricSeries({ businessId: business.id, metric: "visitors", days }),
    metricSeries({ businessId: business.id, metric: "pageviews", days }),
    metricSeries({ businessId: business.id, metric: "ga_users", days }),
    metricSeries({ businessId: business.id, metric: "ga_pageviews", days }),
    metricSeries({ businessId: business.id, metric: "search_clicks", trimTrailing: true, days: Math.max(days, 28) }),
    metricSeries({ businessId: business.id, metric: "search_impressions", trimTrailing: true, days: Math.max(days, 28) }),
    searchPosition(business.id, Math.max(days, 28)),
    financeSummary(business.id, period),
    siteStatuses([{ id: business.id, websites: business.websites }], business.id),
  ]);
  // Plausible en priorité pour la fréquentation, sinon Google Analytics (jamais additionnés : ce seraient les mêmes visiteurs).
  const visitors = plVisitors ?? gaUsers;
  const pageviews = plPageviews ?? gaPageviews;
  const visitorsSource = plVisitors ? "Plausible" : "Google Analytics";
  const gsc = connectors.find((c) => c.kind === "search_console" && c.status === "connected");
  const ga = connectors.find((c) => c.kind === "google_analytics" && c.status === "connected");
  const totalClicks = sum(clicks);
  const totalImpressions = sum(impressions);
  // Encaissements : Stripe (remboursements déduits) + factures saisies dans Finances.
  const hasMoney = finance.hasStripe || finance.hasEntries;
  const money = { kind: "currency", currency: finance.currency } as const;
  const long = period > 90;

  const measured = sites.filter((s) => s.uptime30d !== null);
  const uptime = measured.length ? measured.reduce((a, s) => a + (s.uptime30d ?? 0), 0) / measured.length : null;
  const down = sites.filter((s) => s.last && !s.last.ok);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <PeriodChips base={base} current={period} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label={`Visiteurs · ${periodShort(period)}`}
          value={visitors ? formatValue(sum(visitors)!, { kind: "number" }) : null}
          trend={visitors?.map((p) => p.value)}
          empty="Connecter une source"
          href={`${base}/connecteurs`}
        />
        <KpiTile
          label={`Pages vues · ${periodShort(period)}`}
          value={pageviews ? formatValue(sum(pageviews)!, { kind: "number" }) : null}
          trend={pageviews?.map((p) => p.value)}
          empty="Connecter une source"
          href={`${base}/connecteurs`}
        />
        <KpiTile
          label={`Encaissé · ${periodShort(period)}`}
          value={hasMoney ? formatValue(finance.totals.income, money) : null}
          hint={finance.totals.expenses ? `Résultat : ${formatValue(finance.totals.net, money)}` : undefined}
          trend={finance.income.map((p) => p.value)}
          empty="Stripe ou saisie"
          href={`${base}/finances`}
        />
        <KpiTile
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
          <CardHeader title="Visiteurs" description={`Visiteurs uniques par ${long ? "semaine" : "jour"}, d'après ${visitorsSource}.`} />
          <div className="p-5 pt-6 sm:p-6">
            {visitors ? (
              <AreaChart points={long ? weekly(visitors) : visitors} format={{ kind: "number" }} label={long ? "Visiteurs par semaine" : "Visiteurs par jour"} />
            ) : (
              <EmptyState icon={<PlugZap />} title="Aucune source de visites" description="Connecte Google Analytics ou Plausible pour suivre la fréquentation de ton site." action={<ButtonLink href={`${base}/connecteurs`} size="sm">Connecter</ButtonLink>} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Encaissements"
            description={`Stripe (remboursements déduits) et factures saisies, par ${long ? "semaine" : "jour"}, en ${finance.currency.toUpperCase()}.`}
            action={<ButtonLink href={`${base}/finances?periode=${period}`} variant="ghost" size="sm">Finances</ButtonLink>}
          />
          <div className="p-5 pt-6 sm:p-6">
            {hasMoney ? (
              <AreaChart points={long ? weekly(finance.income) : finance.income} format={money} label="Encaissements" />
            ) : (
              <EmptyState
                icon={<PlugZap />}
                title="Aucun revenu"
                description="Connecte Stripe ou saisis tes factures dans Finances."
                action={<ButtonLink href={`${base}/finances`} size="sm">Ouvrir Finances</ButtonLink>}
              />
            )}
          </div>
        </Card>
      </div>

      {/* Recherche Google */}
      <Card>
        <CardHeader
          title="Recherche Google"
          description={gsc ? `${gsc.label.replace("Search Console · ", "")} · ${Math.max(period, 28)} derniers jours, d'après la Search Console (2 à 3 jours de décalage).` : "Ce que Google montre de ton site, et ce qu'on y clique."}
        />
        {clicks && gsc ? (
          <div className="flex flex-col gap-8 p-5 pt-6 sm:p-6">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Figure label="Clics" value={formatValue(totalClicks ?? 0, { kind: "number" })} />
              <Figure label="Impressions" value={formatValue(totalImpressions ?? 0, { kind: "number" })} />
              <Figure label="CTR moyen" value={totalImpressions ? formatValue(((totalClicks ?? 0) / totalImpressions) * 100, { kind: "percent" }) : "—"} />
              <Figure label="Position moyenne" value={position !== null ? position.toLocaleString("fr-CH") : "—"} />
            </dl>
            {clicks.length > 1 ? (
              <AreaChart points={long ? weekly(clicks) : clicks} format={{ kind: "number" }} label={long ? "Clics depuis Google par semaine" : "Clics depuis Google par jour"} height={160} />
            ) : null}
            <div className="grid gap-8 lg:grid-cols-2">
              <Ranking
                title="Requêtes"
                columns={["Clics", "Impr.", "Pos."]}
                rows={(gsc.snapshot.queries ?? []).map((q) => ({ id: q.key, label: q.key, values: [q.clicks, q.impressions, q.position] }))}
              />
              <Ranking
                title="Pages"
                columns={["Clics", "Impr.", "Pos."]}
                rows={(gsc.snapshot.pages ?? []).map((p) => ({ id: p.key, label: pageLabel(p.key, gsc.config.site_url), values: [p.clicks ?? 0, p.impressions ?? 0, p.position ?? 0] }))}
              />
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Search />}
            title={connectors.some((c) => c.kind === "search_console") ? "En attente des premiers chiffres" : "Search Console pas connectée"}
            description="Clics, impressions, position moyenne et requêtes qui amènent les visiteurs."
            action={<ButtonLink href={`${base}/connecteurs`} size="sm">{connectors.some((c) => c.kind === "search_console") ? "Voir le connecteur" : "Connecter avec Google"}</ButtonLink>}
          />
        )}
      </Card>

      {ga && ((ga.snapshot.channels ?? []).length || (ga.snapshot.pages ?? []).length) ? (
        <Card>
          <CardHeader title="Provenance et contenus" description="30 derniers jours, d'après Google Analytics." />
          <div className="grid gap-8 p-5 pt-6 sm:p-6 lg:grid-cols-2">
            <Bars title="Canaux d'acquisition" unit="sessions" rows={(ga.snapshot.channels ?? []).map((c) => ({ key: channelLabel(c.key), value: c.sessions }))} />
            <Ranking title="Pages les plus vues" columns={["Vues"]} rows={(ga.snapshot.pages ?? []).map((p) => ({ id: p.key, label: p.key, values: [p.views ?? 0] }))} />
          </div>
        </Card>
      ) : null}

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

const CHANNELS: Record<string, string> = {
  "Organic Search": "Recherche naturelle",
  Direct: "Accès direct",
  Referral: "Sites référents",
  "Organic Social": "Réseaux sociaux",
  "Paid Search": "Recherche payante",
  "Paid Social": "Réseaux sociaux payants",
  Email: "E-mail",
  Display: "Display",
  Unassigned: "Non attribué",
};
const channelLabel = (key: string) => CHANNELS[key] ?? key;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-1 font-[family-name:var(--font-display)] text-[24px] font-semibold leading-none tracking-[-0.03em]">{value}</dd>
    </div>
  );
}

/** Classement compact : libellé à gauche, colonnes de chiffres alignées à droite. */
/** Chemin seul pour le domaine principal du site Search Console, domaine + chemin pour les autres. */
function pageLabel(url: string, siteUrl?: string) {
  const main = (siteUrl ?? "").replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
  const match = url.match(/^https?:\/\/([^/]+)(\/.*)?$/);
  if (!match) return url;
  const host = match[1].replace(/^www\./, "");
  const path = match[2] ?? "/";
  return host === main ? path : `${host}${path === "/" ? "" : path}`;
}

function Ranking({ title, columns, rows }: { title: string; columns: string[]; rows: { id: string; label: string; values: number[] }[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-end justify-between gap-3 text-[12px] text-muted">
        <span className="text-[13px] font-medium text-text">{title}</span>
        <span className="flex shrink-0 gap-4">
          {columns.map((c) => (
            <span key={c} className="w-12 text-right">
              {c}
            </span>
          ))}
        </span>
      </div>
      {rows.length ? (
        <ol className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="min-w-0 truncate" title={r.id}>
                {r.label}
              </span>
              <span className="tabular flex shrink-0 gap-4 text-muted">
                {r.values.map((v, i) => (
                  <span key={i} className="w-12 text-right">
                    {Number.isInteger(v) ? formatValue(v, { kind: "number" }, true) : v.toLocaleString("fr-CH")}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-2 text-[13px] text-muted">Pas encore de données.</p>
      )}
    </div>
  );
}

/** Barres horizontales fines, valeur au bout ; une seule série, donc une seule teinte. */
function Bars({ title, rows, unit }: { title: string; rows: { key: string; value: number }[]; unit: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="min-w-0">
      <p className="mb-3 text-[13px] font-medium">{title}</p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.key} className="text-[13px]">
            <div className="mb-1 flex justify-between gap-3">
              <span className="truncate">{r.key}</span>
              <span className="tabular shrink-0 text-muted">
                {formatValue(r.value, { kind: "number" })} {unit}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-fill">
              <div className="h-full rounded-full bg-green shadow-[0_0_10px_var(--green-glow)]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
