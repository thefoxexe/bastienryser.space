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
import { chartMarkers, listMilestones } from "@/lib/milestones";

export const metadata: Metadata = { title: "Sites web" };

export default async function SitesPage({ params }: PageProps<"/b/[slug]/donnees/sites">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const marks = chartMarkers(await listMilestones(business.id));
  const sites = await siteStatuses([{ id: business.id, websites: business.websites }], business.id);

  if (!sites.length) {
    return (
      <Card>
        <EmptyState icon={<Globe />} title="Aucun site web" description="Ajoute les adresses dans les réglages du business : elles seront vérifiées toutes les 5 minutes." action={<ButtonLink href={`/reglages/business/${business.slug}`} size="sm">Ajouter</ButtonLink>} />
      </Card>
    );
  }

  const online = sites.filter((s) => s.last?.ok).length;
  const down = sites.filter((s) => s.last && !s.last.ok).length;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">Chaque site est vérifié toutes les 5 minutes. Une alerte arrive dans le journal après 2 échecs consécutifs.</p>
        <p className="flex shrink-0 items-center gap-3 text-[13px]">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-green" /> {online} en ligne
          </span>
          {down ? (
            <span className="flex items-center gap-1.5 font-medium text-danger">
              <span className="size-2 rounded-full bg-danger" /> {down} injoignable{down > 1 ? "s" : ""}
            </span>
          ) : null}
        </p>
      </div>
      {sites.map((s) => {
        const ms = s.days.filter((d) => d.avgMs !== null);
        const ok = s.last ? s.last.ok : null;
        return (
          <Card key={s.url} className="p-4 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-[7px]">
                  <SiteDot ok={ok} />
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group inline-flex max-w-full items-center gap-1 text-[17px] font-semibold tracking-[-0.02em]"
                  >
                    <span className="truncate">{s.host}</span>
                    <ArrowUpRight className="size-3.5 shrink-0 text-faint transition group-hover:text-text" />
                  </a>
                  <p className={ok === false ? "text-[13px] font-medium text-danger" : "text-[13px] text-muted"}>
                    {s.last
                      ? s.last.ok
                        ? `En ligne · vérifié ${formatRelative(s.last.checked_at)}`
                        : `Injoignable · ${s.last.error ?? "erreur"} · ${formatRelative(s.last.checked_at)}`
                      : "Pas encore mesuré : première vérification sous 5 minutes."}
                  </p>
                </div>
              </div>
              <dl className="grid shrink-0 grid-cols-3 gap-2 md:flex md:gap-8">
                <Metric label="24 h" value={s.uptime24h !== null ? formatValue(s.uptime24h, { kind: "percent" }) : "—"} />
                <Metric label="30 jours" value={s.uptime30d !== null ? formatValue(s.uptime30d, { kind: "percent" }) : "—"} />
                <Metric label="Réponse" value={s.avgMs30d !== null ? `${s.avgMs30d} ms` : "—"} />
              </dl>
            </div>
            <UptimeBars days={s.days} className="mt-5 sm:mt-6" />
            {ms.length > 1 ? (
              <div className="mt-6 sm:mt-8">
                <p className="mb-3 text-[13px] font-medium">Temps de réponse moyen</p>
                <AreaChart markers={marks} points={ms.map((d) => ({ day: d.day, value: d.avgMs! }))} format={{ kind: "ms" }} label={`Temps de réponse de ${s.host}`} height={140} />
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
    <div className="min-w-0 rounded-[12px] bg-fill px-3 py-2 md:bg-transparent md:p-0">
      <dt className="truncate text-[11px] text-muted md:text-[12px]">{label}</dt>
      <dd className="tabular mt-0.5 truncate text-[15px] font-semibold tracking-[-0.02em] md:text-[17px]">{value}</dd>
    </div>
  );
}
