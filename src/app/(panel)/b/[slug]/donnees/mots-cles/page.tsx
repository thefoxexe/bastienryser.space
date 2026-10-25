import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, Search, Sparkles, TrendingUp } from "lucide-react";
import { formatValue } from "@/components/charts/format";
import { PositionSparkline } from "@/components/charts/position-chart";
import { Button, ButtonLink, Card, CardHeader, EmptyState, Input } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { getBusiness } from "@/lib/data";
import { keywordRankings, opportunities, positionGain, type KeywordRow } from "@/lib/keywords";
import { listConnectors } from "@/lib/metrics";
import { trackKeyword } from "../actions";
import { KeywordStar } from "./keyword-star";

export const metadata: Metadata = { title: "Mots-clés" };

const PERIODS = [
  { value: "7", label: "7 jours" },
  { value: "28", label: "28 jours" },
  { value: "90", label: "3 mois" },
];

const FILTERS: { value: string; label: string; test: (k: KeywordRow) => boolean }[] = [
  { value: "tous", label: "Tous", test: () => true },
  { value: "suivis", label: "Suivis", test: (k) => k.tracked },
  { value: "top3", label: "Top 3", test: (k) => k.position !== null && k.position <= 3.5 },
  { value: "top10", label: "Top 10", test: (k) => k.position !== null && k.position <= 10.5 },
  { value: "page2", label: "Page 2", test: (k) => k.position !== null && k.position > 10.5 && k.position <= 20.5 },
  { value: "hausse", label: "En hausse", test: (k) => (positionGain(k) ?? 0) >= 1 },
  { value: "baisse", label: "En baisse", test: (k) => (positionGain(k) ?? 0) <= -1 },
  { value: "nouveaux", label: "Nouveaux", test: (k) => k.prev_impressions === 0 && k.impressions > 0 },
];

export default async function KeywordsPage({ params, searchParams }: PageProps<"/b/[slug]/donnees/mots-cles">) {
  const { slug } = await params;
  const query = await searchParams;
  const business = await getBusiness(slug);
  const base = `/b/${business.slug}/donnees`;
  const period = PERIODS.find((p) => p.value === query.periode)?.value ?? "28";
  const filter = FILTERS.find((f) => f.value === query.filtre) ?? FILTERS[0];
  const search = typeof query.q === "string" ? query.q.toLowerCase().trim() : "";

  const [connectors, all] = await Promise.all([listConnectors(business.id), keywordRankings(business.id, Number(period))]);
  const gsc = connectors.find((c) => c.kind === "search_console");

  if (!gsc || gsc.status !== "connected") {
    return (
      <Card>
        <EmptyState
          icon={<Search />}
          title={gsc ? "Search Console à finaliser" : "Connecte la Search Console"}
          description="Positions de chaque mot-clé dans Google, jour après jour, avec leur évolution et les opportunités pour monter."
          action={<ButtonLink href={`${base}/connecteurs`} size="sm">{gsc ? "Finaliser" : "Connecter avec Google"}</ButtonLink>}
        />
      </Card>
    );
  }

  const ranked = all.filter((k) => k.position !== null);
  const rows = all.filter((k) => filter.test(k) && (!search || k.query.includes(search)));
  const opps = opportunities(all);
  const up = ranked.filter((k) => (positionGain(k) ?? 0) >= 1).length;
  const down = ranked.filter((k) => (positionGain(k) ?? 0) <= -1).length;
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ periode: period, filtre: filter.value, ...(search ? { q: search } : {}), ...patch });
    return `?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {period === "90" ? "3 derniers mois" : `${period} derniers jours`} livrés par Google, comparés à la période précédente. Google a 2 à 3 jours de décalage.
        </p>
        <div className="flex gap-0.5 rounded-[10px] bg-fill p-[3px]">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={href({ periode: p.value })}
              className={cn("rounded-[8px] px-3 py-1 text-[13px] font-medium transition", p.value === period ? "bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12)]" : "text-muted hover:text-text")}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Mots-clés positionnés" value={ranked.length} />
        <Tile label="Dans le top 3" value={ranked.filter((k) => k.position! <= 3.5).length} />
        <Tile label="Dans le top 10" value={ranked.filter((k) => k.position! <= 10.5).length} />
        <Card className="flex flex-col justify-between gap-3 p-4 sm:p-5">
          <span className="text-[13px] text-muted">Évolution</span>
          <span className="flex items-baseline gap-4 font-[family-name:var(--font-display)] text-[26px] font-semibold leading-none tracking-[-0.03em]">
            <span className="text-glow flex items-center gap-1">
              <ArrowUp className="size-5" />
              {up}
            </span>
            <span className="flex items-center gap-1 text-faint">
              <ArrowDown className="size-5" />
              {down}
            </span>
          </span>
          <span className="text-[12px] text-faint">mots-clés en hausse / en baisse</span>
        </Card>
      </div>

      {opps.length ? (
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="size-4" /> Opportunités</span>} description="Les mots-clés où un petit effort peut rapporter le plus de visiteurs." />
          <ul className="grid gap-px p-2 pt-3 sm:grid-cols-2">
            {opps.map((o) => (
              <li key={o.query}>
                <Link href={`${base}/mots-cles/${encodeURIComponent(o.query)}`} className="flex items-start gap-3 rounded-[12px] px-3 py-3 transition hover:bg-fill">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-fill">
                    <TrendingUp className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{o.query}</span>
                    <span className="block text-[13px] text-muted">
                      {o.kind === "page2"
                        ? `Position ${o.position.toLocaleString("fr-CH")} avec ${formatValue(o.impressions, { kind: "number" })} impressions : à pousser en première page (contenu, liens internes).`
                        : `Déjà en position ${o.position.toLocaleString("fr-CH")} mais peu cliqué (${o.ctr?.toLocaleString("fr-CH")} %) : retravailler le titre et la description.`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-col gap-4 p-5 pb-3 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-3">
          <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={href({ filtre: f.value })}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1 text-[13px] transition",
                  f.value === filter.value ? "bg-ink text-ink-text" : "bg-fill text-muted hover:text-text",
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <form className="flex shrink-0 gap-2" action="">
            <input type="hidden" name="periode" value={period} />
            <input type="hidden" name="filtre" value={filter.value} />
            <Input name="q" defaultValue={search} placeholder="Rechercher un mot-clé" className="h-9 w-full sm:w-56" />
          </form>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="w-10 py-2 pl-5 sm:pl-6" />
                  <th className="py-2 pr-3 font-normal">Mot-clé</th>
                  <th className="px-3 py-2 text-right font-normal">Position</th>
                  <th className="px-3 py-2 font-normal">28 jours</th>
                  <th className="px-3 py-2 text-right font-normal">Clics</th>
                  <th className="px-3 py-2 text-right font-normal">Impr.</th>
                  <th className="py-2 pl-3 pr-5 text-right font-normal sm:pr-6">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 200).map((k) => {
                  const gain = positionGain(k);
                  const clicksDelta = k.clicks - k.prev_clicks;
                  return (
                    <tr key={k.query} className="transition-colors hover:bg-[color-mix(in_oklab,var(--text)_2.5%,transparent)]">
                      <td className="py-1.5 pl-3 sm:pl-4">
                        <KeywordStar query={k.query} tracked={k.tracked} businessId={business.id} slug={business.slug} />
                      </td>
                      <td className="max-w-[320px] py-2.5 pr-3">
                        <Link href={`${base}/mots-cles/${encodeURIComponent(k.query)}`} className="block truncate font-medium hover:underline">
                          {k.query}
                        </Link>
                        {k.prev_impressions === 0 && k.impressions > 0 ? <span className="text-glow text-[12px]">Nouveau</span> : null}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right">
                        <span className="font-semibold">{k.position !== null ? k.position.toLocaleString("fr-CH") : "—"}</span>
                        {gain !== null && Math.abs(gain) >= 0.5 ? (
                          <span className={cn("ml-1.5 inline-flex items-center text-[12px]", gain > 0 ? "text-glow" : "text-faint")}>
                            {gain > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                            {Math.abs(gain).toLocaleString("fr-CH")}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <PositionSparkline values={k.trend ?? []} className="h-7 w-24" />
                      </td>
                      <td className="tabular px-3 py-2.5 text-right">
                        {formatValue(k.clicks, { kind: "number" })}
                        {clicksDelta !== 0 && k.prev_impressions > 0 ? (
                          <span className={cn("ml-1 text-[12px]", clicksDelta > 0 ? "text-glow" : "text-faint")}>
                            {clicksDelta > 0 ? "+" : "−"}
                            {Math.abs(clicksDelta)}
                          </span>
                        ) : null}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-muted">{formatValue(k.impressions, { kind: "number" })}</td>
                      <td className="tabular py-2.5 pl-3 pr-5 text-right text-muted sm:pr-6">{k.ctr !== null ? `${k.ctr.toLocaleString("fr-CH")} %` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 200 ? <p className="px-6 py-3 text-[12px] text-muted">200 premiers sur {rows.length} : affine avec la recherche ou les filtres.</p> : null}
          </div>
        ) : (
          <EmptyState
            icon={<Search />}
            title={all.length ? "Aucun mot-clé pour ce filtre" : "Pas encore de mots-clés"}
            description={all.length ? "Change de filtre ou de recherche." : "Les mots-clés arrivent avec la première synchronisation (90 jours d'historique)."}
          />
        )}

        <form action={trackKeyword} className="flex flex-col gap-2 border-t border-border p-5 sm:flex-row sm:items-center sm:p-6">
          <input type="hidden" name="businessId" value={business.id} />
          <input type="hidden" name="slug" value={business.slug} />
          <Input name="query" placeholder="Suivre un mot-clé précis, ex. fiduciaire lausanne" required className="sm:max-w-sm" />
          <Button type="submit" variant="secondary" className="h-10">
            <Plus /> Suivre
          </Button>
          <p className="text-[12px] text-muted sm:ml-2">Un mot-clé suivi est toujours récupéré, même hors du top, avec 90 jours d&apos;historique.</p>
        </form>
      </Card>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col justify-between gap-3 p-4 sm:p-5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="font-[family-name:var(--font-display)] text-[30px] font-semibold leading-none tracking-[-0.03em]">{formatValue(value, { kind: "number" })}</span>
    </Card>
  );
}
