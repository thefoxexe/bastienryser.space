import type { Metadata } from "next";
import { Trash2, Wallet } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatDay, formatValue } from "@/components/charts/format";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodChips } from "@/components/period-chips";
import { Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { getBusiness } from "@/lib/data";
import { financeSummary, listEntries, periodFrom, periodShort, weekly } from "@/lib/finance";
import { lastDays } from "@/lib/metrics";
import { deleteEntry } from "../actions";
import { EntryForm } from "./entry-form";

export const metadata: Metadata = { title: "Finances" };

export default async function FinancesPage({ params, searchParams }: PageProps<"/b/[slug]/donnees/finances">) {
  const { slug } = await params;
  const period = periodFrom((await searchParams).periode, 30);
  const business = await getBusiness(slug);
  const base = `/b/${business.slug}/donnees`;
  const [summary, entries] = await Promise.all([financeSummary(business.id, period), listEntries(business.id, period)]);
  const cur = { kind: "currency", currency: summary.currency } as const;
  const money = (v: number) => formatValue(v, cur);
  const t = summary.totals;
  const today = lastDays(1)[0];
  // 12 mois : une valeur par semaine, sinon une par jour.
  const chart = period > 90 ? weekly(summary.net) : summary.net;
  const empty = !summary.hasStripe && !summary.hasEntries;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted">
          Encaissements Stripe et écritures saisies, en {summary.currency.toUpperCase()}. Un remboursement compte en négatif le jour où il a lieu ; les frais Stripe
          sont des charges.
        </p>
        <PeriodChips base={`${base}/finances`} current={period} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={`Encaissé · ${periodShort(period)}`} amount={empty ? null : t.income} format={cur} trend={summary.income.map((p) => p.value)} empty="Connecter Stripe" href={`${base}/connecteurs`} />
        <KpiTile label={`Charges · ${periodShort(period)}`} amount={empty ? null : t.expenses} format={cur} hint={t.fees ? `dont ${money(t.fees)} de frais Stripe` : undefined} empty="Saisir une charge" href="#saisie" />
        <KpiTile label={`Résultat · ${periodShort(period)}`} amount={empty ? null : t.net} format={cur} trend={summary.net.map((p) => p.value)} empty="Saisir un revenu" href="#saisie" />
        <KpiTile
          label={`Remboursé · ${periodShort(period)}`}
          amount={summary.hasStripe ? t.refunds : null}
          format={cur}
          hint={`${t.payments} paiement${t.payments > 1 ? "s" : ""} Stripe`}
          empty="Stripe non connecté"
          href={`${base}/connecteurs`}
        />
      </div>

      <Card>
        <CardHeader title="Résultat" description={`Encaissements moins charges, par ${period > 90 ? "semaine" : "jour"}.`} />
        <div className="p-5 pt-6 sm:p-6">
          {empty ? (
            <EmptyState icon={<Wallet />} title="Rien à afficher pour l'instant" description="Connecte Stripe ou saisis tes factures et tes charges à droite." />
          ) : (
            <AreaChart points={chart} format={{ kind: "currency", currency: summary.currency }} label="Résultat" height={190} />
          )}
          {summary.otherCurrencies.length ? (
            <p className="mt-3 text-[12px] text-faint">
              Montants en {summary.otherCurrencies.map((c) => c.toUpperCase()).join(", ")} non additionnés (aucune conversion n&apos;est inventée).
            </p>
          ) : null}
        </div>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Écritures" description={`Saisies à la main sur ${periodShort(period)}. Stripe est compté automatiquement.`} />
          <div className="p-2 pt-3">
            {entries.length ? (
              <ul className="divide-y divide-border">
                {entries.map((e) => (
                  <li key={e.id} className="group flex items-center gap-3 px-3 py-2.5">
                    <span className="tabular w-14 shrink-0 text-[12px] text-muted">{formatDay(e.day)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{e.label}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {[e.category, e.reference ? `n° ${e.reference}` : null].filter(Boolean).join(" · ") || (e.kind === "income" ? "Revenu" : "Charge")}
                      </span>
                    </span>
                    <span className={cn("tabular shrink-0 text-[14px] font-medium", e.kind === "income" ? "text-green-text" : "text-muted")}>
                      {e.kind === "income" ? "+" : "−"}
                      {formatValue(e.amount, { kind: "currency", currency: e.currency })}
                    </span>
                    <form action={deleteEntry}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="slug" value={business.slug} />
                      <Button type="submit" variant="ghost" size="icon" title="Supprimer" aria-label={`Supprimer ${e.label}`} className="sm:opacity-0 sm:group-hover:opacity-100">
                        <Trash2 />
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-center text-[13px] text-muted">Aucune écriture sur cette période.</p>
            )}
          </div>
        </Card>
        <div id="saisie" className="scroll-mt-6">
          <Card className="p-5 sm:p-6">
            <h3 className="mb-4 text-[17px] font-semibold">Ajouter une écriture</h3>
            <EntryForm businessId={business.id} slug={business.slug} today={today} />
          </Card>
        </div>
      </div>
    </div>
  );
}
