import type { Metadata } from "next";
import { Flag, Trash2 } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatDay, formatValue } from "@/components/charts/format";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { getBusiness } from "@/lib/data";
import { weekly } from "@/lib/finance";
import { metricSeries } from "@/lib/metrics";
import { chartMarkers, KIND_LABEL, listMilestones, milestoneImpacts, type MilestoneImpact } from "@/lib/milestones";
import { deleteMilestone } from "../actions";
import { MilestoneForm } from "./milestone-form";

export const metadata: Metadata = { title: "Jalons" };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());

export default async function MilestonesPage({ params }: PageProps<"/b/[slug]/donnees/jalons">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const [milestones, clicks] = await Promise.all([
    listMilestones(business.id),
    metricSeries({ businessId: business.id, metric: "search_clicks", trimTrailing: true, days: 180 }),
  ]);
  const impacts = await milestoneImpacts(business.id, milestones);
  const newest = [...milestones].reverse();

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-[13px] text-muted">
        Note ici chaque changement fait sur le site ou la communication. Il apparaît en pointillé sur tous les graphiques (visites, recherche,
        mots-clés, finances), avec l&apos;avant / après mesuré sur les vrais chiffres. Google met souvent 2 à 6 semaines à réagir : juge sur la
        durée.
      </p>

      <Card>
        <CardHeader title="Nouveau jalon" description="Date du jour par défaut ; tu peux aussi noter un changement fait plus tôt." />
        <MilestoneForm businessId={business.id} slug={business.slug} today={today()} />
      </Card>

      {clicks && clicks.length > 1 && milestones.length ? (
        <Card>
          <CardHeader title="Clics depuis Google et jalons" description="6 derniers mois, par semaine." />
          <div className="p-5 pt-6 sm:p-6">
            <AreaChart points={weekly(clicks)} format={{ kind: "number" }} label="Clics depuis Google par semaine" height={180} markers={chartMarkers(milestones)} />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Historique" description={milestones.length ? `${milestones.length} jalon${milestones.length > 1 ? "s" : ""}, du plus récent au plus ancien.` : undefined} />
        {newest.length ? (
          <ul className="flex flex-col divide-y divide-border px-5 pb-2 pt-3 sm:px-6">
            {newest.map((m) => (
              <li key={m.id} className="group flex flex-col gap-3 py-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-text" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-muted">
                      <span className="tabular">{formatDay(m.day, true)}</span> · {KIND_LABEL[m.kind]}
                    </p>
                    <p className="mt-0.5 text-[15px] font-medium">{m.title}</p>
                    {m.note ? <p className="mt-1 whitespace-pre-line text-[13px] text-muted">{m.note}</p> : null}
                  </div>
                  <form action={deleteMilestone}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="slug" value={business.slug} />
                    <button
                      type="submit"
                      className="grid size-8 place-items-center rounded-full text-faint hover:bg-fill hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label={`Supprimer le jalon « ${m.title} »`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
                <Impact impact={impacts.get(m.id) ?? null} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Flag />} title="Aucun jalon" description="Ajoute le premier changement que tu fais : tu verras ensuite s'il a fait bouger les chiffres." />
        )}
      </Card>
    </div>
  );
}

/** Avant / après sur la même durée, uniquement avec les chiffres réellement mesurés. */
function Impact({ impact }: { impact: MilestoneImpact | null }) {
  if (!impact || impact.days < 1) {
    return <p className="ml-5 text-[12px] text-muted">Pas encore de chiffres après ce jalon : l&apos;avant / après apparaîtra avec les prochaines données.</p>;
  }
  const rows: { label: string; before: number | null; after: number | null; lowerIsBetter?: boolean; decimals?: boolean }[] = [
    { label: "Clics Google", before: impact.before.clicks, after: impact.after.clicks },
    { label: "Impressions", before: impact.before.impressions, after: impact.after.impressions },
    { label: "Position moyenne", before: impact.before.position, after: impact.after.position, lowerIsBetter: true, decimals: true },
  ];
  if (impact.before.visitors !== null) rows.push({ label: "Visiteurs", before: impact.before.visitors, after: impact.after.visitors });

  return (
    <div className="ml-5 rounded-[14px] bg-fill p-3">
      <p className="mb-2 text-[12px] text-muted">
        {impact.days} jour{impact.days > 1 ? "s" : ""} avant / {impact.days} jour{impact.days > 1 ? "s" : ""} après
        {impact.days < 28 ? " · encore trop tôt pour conclure" : ""}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {rows.map((r) => {
          const change = r.before && r.after !== null ? ((r.after - r.before) / r.before) * 100 : null;
          const better = change === null || Math.abs(change) < 1 ? null : r.lowerIsBetter ? change < 0 : change > 0;
          const show = (v: number | null) => (v === null ? "—" : r.decimals ? v.toLocaleString("fr-CH", { maximumFractionDigits: 1 }) : formatValue(v, { kind: "number" }, true));
          return (
            <div key={r.label} className="min-w-0">
              <dt className="truncate text-[11px] text-muted">{r.label}</dt>
              <dd className="tabular mt-0.5 text-[14px] font-semibold">
                {show(r.before)} → {show(r.after)}
                {change !== null ? (
                  <span className={cn("ml-1.5 text-[12px] font-medium", better === null ? "text-muted" : better ? "text-success" : "text-danger")}>
                    {change > 0 ? "+" : ""}
                    {Math.round(change)} %
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
