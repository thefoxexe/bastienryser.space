import Link from "next/link";
import { Wallet } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatMonth, formatValue } from "@/components/charts/format";
import { Sparkline } from "@/components/charts/sparkline";
import { BusinessMark } from "@/components/business-mark";
import { CountUp } from "@/components/count-up";
import { KpiTile } from "@/components/kpi-tile";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { CashOverview } from "@/lib/cash";
import type { BusinessWithLogo } from "@/lib/types";

const CHF = { kind: "currency", currency: "chf" } as const;
const chf = (v: number, compact = false) => formatValue(v, CHF, compact);

/** Variation réelle entre deux périodes, en texte : « +12 % vs 2025 à date ». null si la base est nulle. */
function versus(now: number, before: number, label: string) {
  if (before <= 0) return null;
  const pct = ((now - before) / before) * 100;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("fr-CH", { maximumFractionDigits: Math.abs(pct) >= 10 ? 0 : 1 })} % vs ${label}`;
}

/** L'argent, tous business confondus, en CHF : en tête de l'accueil. */
export function CashSection({ cash, businesses }: { cash: CashOverview; businesses: BusinessWithLogo[] }) {
  if (!cash.hasData) {
    return (
      <Card>
        <EmptyState icon={<Wallet />} title="Pas encore d'encaissements" description="Connecte Stripe ou Whop dans un business, ou saisis tes revenus dans Finances." />
      </Card>
    );
  }
  const w = cash.windows;
  const year = new Date().getFullYear();
  const logos = new Map(businesses.map((b) => [b.id, b]));
  const total = cash.businesses.reduce((a, b) => a + Math.max(b.allTime, 0), 0);

  return (
    <section className="flex flex-col gap-4">
      {/* Le chiffre : gagné depuis toujours, et sa courbe */}
      <Card className="grid gap-6 overflow-hidden p-5 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-center">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-[13px] text-muted">Gagné depuis toujours</span>
          <span className="tabular font-[family-name:var(--font-display)] text-[clamp(34px,8vw,54px)] font-semibold leading-none tracking-[-0.04em]">
            <CountUp value={w.allTime.net} format={CHF} />
          </span>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
            <div>
              <dt className="text-muted">Encaissé</dt>
              <dd className="tabular font-semibold">{chf(w.allTime.income)}</dd>
            </div>
            <div>
              <dt className="text-muted">Frais et charges</dt>
              <dd className="tabular font-semibold">{chf(w.allTime.costs)}</dd>
            </div>
            {cash.firstDay ? (
              <div>
                <dt className="text-muted">Depuis</dt>
                <dd className="font-semibold">{formatMonth(cash.firstDay)}</dd>
              </div>
            ) : null}
            {cash.bestMonth ? (
              <div>
                <dt className="text-muted">Meilleur mois</dt>
                <dd className="tabular truncate font-semibold">
                  {formatMonth(cash.bestMonth.day)} · {chf(cash.bestMonth.value, true)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="min-w-0">
          <AreaChart points={cash.cumulative} format={CHF} label="Gagné, cumulé" height={200} monthly />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile label={`Cette année`} amount={w.year.net} format={CHF} hint={versus(w.year.net, w.lastYearToDate.net, `${year - 1} à date`) ?? `encaissé ${chf(w.year.income, true)}`} empty="" href="/" />
        <KpiTile label="Ce mois-ci" amount={w.month.net} format={CHF} hint={`mois dernier ${chf(w.lastMonth.net, true)}`} empty="" href="/" />
        <KpiTile
          label="30 derniers jours"
          amount={w.last30.net}
          format={CHF}
          hint={versus(w.last30.net, w.prev30.net, "30 j d'avant") ?? `encaissé ${chf(w.last30.income, true)}`}
          trend={cash.daily90.slice(-30).map((p) => p.value)}
          empty=""
          href="/"
        />
        <KpiTile label="Moyenne par mois" amount={cash.avgMonth12} format={CHF} hint="12 derniers mois complets" empty="Pas encore de mois complet" href="/" />
        <KpiTile
          label="MRR"
          amount={cash.mrr}
          format={CHF}
          hint={cash.subscribers !== null ? `${cash.subscribers} abonné${cash.subscribers > 1 ? "s" : ""} en cours` : undefined}
          empty="Aucun abonnement suivi"
          href="/"
        />
        <KpiTile label="ARR" amount={cash.arr} format={CHF} hint="MRR × 12" empty="Aucun abonnement suivi" href="/" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Gagné par mois" description="Tous business, net des frais et charges." />
          <div className="p-5 pt-4 sm:p-6 sm:pt-4">
            <AreaChart points={cash.monthly.map((p) => ({ day: p.day, value: p.net }))} format={CHF} label="Gagné du mois" height={180} monthly />
          </div>
        </Card>
        <Card>
          <CardHeader title="90 derniers jours" description="Gagné par jour, remboursements compris." />
          <div className="p-5 pt-4 sm:p-6 sm:pt-4">
            <AreaChart points={cash.daily90} format={CHF} label="Gagné du jour" height={180} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Par business" description="Gagné, en CHF." />
        <div className="overflow-x-auto px-2 pb-2 pt-2 sm:px-3">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="px-3 py-2 font-normal">Business</th>
                <th className="px-3 py-2 text-right font-normal">Depuis toujours</th>
                <th className="px-3 py-2 text-right font-normal">{year}</th>
                <th className="px-3 py-2 text-right font-normal">30 j</th>
                <th className="px-3 py-2 text-right font-normal">MRR</th>
                <th className="px-3 py-2 font-normal">12 mois</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cash.businesses.map((b) => {
                const share = total > 0 ? Math.max(b.allTime, 0) / total : 0;
                const biz = logos.get(b.id);
                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2.5">
                      <Link href={`/b/${b.slug}`} className="flex items-center gap-2.5 hover:underline">
                        <BusinessMark name={b.name} color={b.color} logoUrl={biz?.logo_url ?? null} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{b.name}</span>
                          <span className="flex items-center gap-1.5 text-[11px] text-muted">
                            <span className="h-1 w-14 overflow-hidden rounded-full bg-fill">
                              <span className="block h-full rounded-full bg-text" style={{ width: `${Math.round(share * 100)}%` }} />
                            </span>
                            {Math.round(share * 100)} %
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-semibold">{chf(b.allTime)}</td>
                    <td className="tabular px-3 py-2.5 text-right">{chf(b.year)}</td>
                    <td className={cn("tabular px-3 py-2.5 text-right", b.last30 < 0 && "text-danger")}>{chf(b.last30)}</td>
                    <td className="tabular px-3 py-2.5 text-right text-muted">{b.mrr !== null ? chf(b.mrr) : "—"}</td>
                    <td className="px-3 py-2.5">
                      <Sparkline values={b.trend} className="h-6 w-20" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-4 text-[11px] text-faint sm:px-6">
          Chaque montant est converti en CHF au taux officiel de la BCE du jour du paiement
          {cash.ratesAsOf ? ` (derniers taux : ${new Date(`${cash.ratesAsOf}T12:00:00Z`).toLocaleDateString("fr-CH")})` : ""}.
          {cash.unconverted.length ? ` Montants en ${cash.unconverted.map((c) => c.toUpperCase()).join(", ")} non comptés : aucun taux disponible.` : ""}
        </p>
      </Card>
    </section>
  );
}
