import type { Metadata } from "next";
import { ArrowUpRight, Globe } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatValue } from "@/components/charts/format";
import { SiteDot } from "@/components/charts/site-dot";
import { UptimeBars } from "@/components/charts/uptime-bars";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { formatRelative } from "@/lib/format";
import { siteStatuses } from "@/lib/metrics";

export const metadata: Metadata = { title: "Sites web" };

export default async function SitesPage({ params }: PageProps<"/b/[slug]/donnees/sites">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const sites = await siteStatuses([{ id: business.id, websites: business.websites }], business.id);

  if (!sites.length) {
    return (
      <Card>
        <EmptyState icon={<Globe />} title="Aucun site web" description="Ajoute les adresses dans les réglages du business : elles seront vérifiées toutes les 5 minutes." action={<ButtonLink href={`/reglages/business/${business.slug}`} size="sm">Ajouter</ButtonLink>} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-muted">Chaque site est vérifié toutes les 5 minutes. Une alerte arrive dans le journal après 2 échecs consécutifs.</p>
      {sites.map((s) => {
        const ms = s.days.filter((d) => d.avgMs !== null);
        return (
          <Card key={s.url} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <SiteDot ok={s.last ? s.last.ok : null} />
                <div className="min-w-0">
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="group inline-flex items-center gap-1 text-[17px] font-semibold tracking-[-0.02em]">
                    {s.host}
                    <ArrowUpRight className="size-3.5 text-faint transition group-hover:text-text" />
                  </a>
                  <p className="text-[13px] text-muted">
                    {s.last
                      ? s.last.ok
                        ? `En ligne · vérifié ${formatRelative(s.last.checked_at)}`
                        : `Injoignable · ${s.last.error ?? "erreur"} · ${formatRelative(s.last.checked_at)}`
                      : "Pas encore mesuré : première vérification sous 5 minutes."}
                  </p>
                </div>
              </div>
              <dl className="flex gap-8">
                <Metric label="24 h" value={s.uptime24h !== null ? formatValue(s.uptime24h, { kind: "percent" }) : "—"} />
                <Metric label="30 jours" value={s.uptime30d !== null ? formatValue(s.uptime30d, { kind: "percent" }) : "—"} />
                <Metric label="Réponse moy." value={s.avgMs30d !== null ? `${s.avgMs30d} ms` : "—"} />
              </dl>
            </div>
            <UptimeBars days={s.days} className="mt-6" />
            {ms.length > 1 ? (
              <div className="mt-8">
                <p className="mb-3 text-[13px] font-medium">Temps de réponse moyen</p>
                <AreaChart points={ms.map((d) => ({ day: d.day, value: d.avgMs! }))} format={{ kind: "ms" }} label={`Temps de réponse de ${s.host}`} height={140} />
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-[17px] font-semibold tracking-[-0.02em]">{value}</dd>
    </div>
  );
}
