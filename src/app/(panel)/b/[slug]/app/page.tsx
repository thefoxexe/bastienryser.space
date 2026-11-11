import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AreaChart } from "@/components/charts/area-chart";
import { KpiTile } from "@/components/kpi-tile";
import { Badge, Card, CardHeader } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { appStats, statusOf, type AppOrg } from "@/lib/app-stats";
import { getBusiness } from "@/lib/data";
import { formatDate, formatRelative } from "@/lib/format";
import type { SeriesPoint } from "@/lib/metrics";

export const metadata: Metadata = { title: "Application" };

const number = { kind: "number" } as const;
const sum = (s: SeriesPoint[] | null, last?: number) => (s ? (last ? s.slice(-last) : s).reduce((a, p) => a + p.value, 0) : 0);
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("fr-CH", { maximumFractionDigits: a / b < 0.1 ? 1 : 0 })} %` : "—");
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

export default async function AppPage({ params }: PageProps<"/b/[slug]/app">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const stats = await appStats(business.id);
  if (!stats) notFound();
  const { totals: t, organizations: orgs, series } = stats;

  const real = orgs.length;
  const signups30 = sum(series.signups, 30);
  const funnel = [
    { label: "Visiteurs", value: sum(series.visitors, 30) },
    { label: "Inscriptions", value: signups30 },
    { label: "Essais démarrés", value: sum(series.trials, 30) },
    { label: "Abonnements activés", value: sum(series.activations, 30) },
  ];
  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <>
      <p className="text-[12px] text-faint">
        Chiffres lus sur l&apos;application{stats.generatedAt ? `, relevé ${formatRelative(stats.generatedAt)}` : ""} · synchronisé chaque heure · comptes internes exclus.
        {stats.connector.last_error ? <span className="ml-1 text-danger">{stats.connector.last_error}</span> : null}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Entreprises inscrites" value={String(t.organizations ?? real)} hint={`+${signups30} sur 30 jours`} trend={series.signups?.map((p) => p.value)} empty="" href="#" />
        <KpiTile label="Payantes" value={String(t.paying ?? 0)} hint={`${pct(t.paying ?? 0, t.organizations ?? real)} des inscrites`} empty="" href="#" />
        <KpiTile label="En essai" value={String(t.trialing ?? 0)} hint={t.trial_expired ? `${t.trial_expired} essais expirés` : undefined} empty="" href="#" />
        <KpiTile label="Offertes" value={String(t.complimentary ?? 0)} hint="comptes gratuits à vie" empty="" href="#" />
        <KpiTile label="Actives 30 j" value={String(t.active_30d ?? 0)} hint="ont utilisé l'app" trend={series.active_orgs?.map((p) => p.value)} empty="" href="#" />
        <KpiTile label="Utilisateurs" value={String(t.users ?? 0)} hint={t.newsletter ? `${t.newsletter.subscribed} à la newsletter` : undefined} empty="" href="#" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader title="Entonnoir, 30 derniers jours" description="Des visites du site jusqu'à l'abonnement payé." />
          <ol className="flex flex-col gap-3 p-5 pt-4 sm:p-6 sm:pt-4">
            {funnel.map((f, i) => (
              <li key={f.label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span>{f.label}</span>
                  <span className="tabular font-semibold">
                    {f.value.toLocaleString("fr-CH")}
                    {i > 0 ? <span className="ml-2 font-normal text-muted">{pct(f.value, funnel[i - 1].value)}</span> : null}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-fill">
                  <div className={cn("h-full rounded-full", i === funnel.length - 1 ? "bg-green" : "bg-text")} style={{ width: `${Math.max(1.5, (f.value / maxFunnel) * 100)}%` }} />
                </div>
              </li>
            ))}
            <p className="pt-1 text-[12px] text-muted">
              Visiteur → abonné : <span className="font-medium text-text">{pct(funnel[3].value, funnel[0].value)}</span> · inscription → abonné :{" "}
              <span className="font-medium text-text">{pct(funnel[3].value, funnel[1].value)}</span>
            </p>
          </ol>
        </Card>
        <Card>
          <CardHeader title="Inscriptions par jour" description="90 derniers jours." />
          <div className="p-5 pt-4 sm:p-6 sm:pt-4">{series.signups ? <AreaChart points={series.signups} format={number} label="Inscriptions" height={190} /> : null}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {(
          [
            ["Visiteurs du site", series.visitors],
            ["Entreprises actives", series.active_orgs],
            ["Abonnements activés", series.activations],
          ] as const
        ).map(([title, s]) => (
          <Card key={title}>
            <CardHeader title={title} description="Par jour, 90 jours." />
            <div className="p-5 pt-4 sm:p-6 sm:pt-4">{s ? <AreaChart points={s} format={number} label={title} height={150} /> : null}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Breakdown title="Par statut" rows={statusRows(orgs)} />
        <Breakdown title="Payantes par formule" rows={Object.entries(t.by_plan ?? {}).map(([k, v]) => [planName(orgs, k), v])} />
        <Breakdown title="Provenance des inscriptions" rows={Object.entries(t.by_source ?? {}).map(([k, v]) => [k === "inconnue" ? "Non renseignée" : k, v])} />
      </div>

      {t.cancellation_reasons?.length ? <Breakdown title="Raisons de résiliation" rows={t.cancellation_reasons.map((r) => [r.reason, r.n])} /> : null}

      <Card>
        <CardHeader title="Entreprises" description={`${plural(real, "entreprise")}, de la plus récente à la plus ancienne.`} />
        <div className="overflow-x-auto px-2 pb-2 pt-2 sm:px-3">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="px-3 py-2 font-normal">Entreprise</th>
                <th className="px-3 py-2 font-normal">Formule</th>
                <th className="px-3 py-2 font-normal">Statut</th>
                <th className="px-3 py-2 font-normal">Inscrite</th>
                <th className="px-3 py-2 text-right font-normal">Membres</th>
                <th className="px-3 py-2 font-normal">Dernière activité</th>
                <th className="px-3 py-2 text-right font-normal">Jours actifs 30 j</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orgs.map((o) => {
                const st = statusOf(o);
                return (
                  <tr key={o.id}>
                    <td className="px-3 py-2.5">
                      <span className="block max-w-[240px] truncate font-medium">{o.name || "Sans nom"}</span>
                      <span className="block truncate text-[11px] text-muted">{[o.trade, o.source].filter(Boolean).join(" · ") || "—"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {o.plan_name ?? o.plan ?? "—"}
                      {o.plan_monthly ? <span className="block text-[11px] text-muted">{o.plan_monthly.toLocaleString("fr-CH")} CHF / mois</span> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                      {o.status === "trialing" && o.trial_ends_at ? <span className="block text-[11px] text-muted">jusqu&apos;au {formatDate(o.trial_ends_at)}</span> : null}
                    </td>
                    <td className="tabular px-3 py-2.5 text-muted">{formatDate(o.created_at)}</td>
                    <td className="tabular px-3 py-2.5 text-right">{o.members}</td>
                    <td className="tabular px-3 py-2.5 text-muted">{o.last_active ? formatDate(`${o.last_active}T12:00:00Z`) : "—"}</td>
                    <td className={cn("tabular px-3 py-2.5 text-right", o.active_days_30 ? "font-semibold" : "text-faint")}>{o.active_days_30}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 text-[11px] text-faint sm:px-6">
          Aucune coordonnée n&apos;est importée (ni e-mail, ni téléphone, ni adresse). L&apos;activité est suivie par l&apos;application depuis fin octobre 2026.{" "}
          <Link href={`/b/${business.slug}/donnees/connecteurs`} className="underline">
            Connecteur
          </Link>
        </p>
      </Card>
    </>
  );
}

function statusRows(orgs: AppOrg[]): [string, number][] {
  const m = new Map<string, number>();
  for (const o of orgs) m.set(statusOf(o).label, (m.get(statusOf(o).label) ?? 0) + 1);
  return [...m.entries()];
}

function planName(orgs: AppOrg[], id: string) {
  return orgs.find((o) => o.plan === id)?.plan_name ?? id;
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  const sorted = [...rows].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((a, r) => a + r[1], 0);
  return (
    <Card>
      <CardHeader title={title} />
      <ul className="flex flex-col gap-2.5 p-5 pt-4 sm:p-6 sm:pt-4">
        {sorted.length ? (
          sorted.map(([label, n]) => (
            <li key={label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate">{label}</span>
                <span className="tabular shrink-0 font-semibold">
                  {n}
                  <span className="ml-2 font-normal text-muted">{pct(n, total)}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-fill">
                <div className="h-full rounded-full bg-text" style={{ width: `${(n / Math.max(total, 1)) * 100}%` }} />
              </div>
            </li>
          ))
        ) : (
          <li className="text-[13px] text-muted">Rien pour l&apos;instant.</li>
        )}
      </ul>
    </Card>
  );
}
