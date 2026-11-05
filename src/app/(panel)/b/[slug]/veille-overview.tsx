import Link from "next/link";
import { ArrowUpRight, Radar, RefreshCw, Wallet } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatMonth, formatValue } from "@/components/charts/format";
import { KpiTile } from "@/components/kpi-tile";
import { Button, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { Business } from "@/lib/types";
import { formatDateTime, formatRelative } from "@/lib/format";
import { veilleStats } from "@/lib/veille";
import { whopOverview } from "@/lib/whop";
import { syncConnectorNow } from "./donnees/actions";
import { ConnectorForm } from "./donnees/connecteurs/connector-form";

/** Vue d'ensemble d'un business sans réseaux ni données (Golden Bulls) : revenus Whop et veille Telegram, rien d'autre. */
export async function VeilleOverview({ business }: { business: Business }) {
  const [whop, veille] = await Promise.all([whopOverview(business.id), veilleStats(business.id)]);
  const money = { kind: "currency", currency: whop.currency } as const;
  const hasRevenue = whop.monthly.length > 0;
  const veilleHref = `/b/${business.slug}/veille`;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile
          label="Revenus depuis toujours"
          amount={hasRevenue ? whop.totals.revenue : null}
          format={money}
          hint={whop.firstDay ? `depuis ${formatMonth(whop.firstDay)}` : undefined}
          trend={hasRevenue ? whop.cumulative.map((p) => p.value) : undefined}
          empty="Connecter Whop"
          href="#whop"
        />
        <KpiTile
          label="Revenus 30 j"
          amount={whop.connector && hasRevenue ? whop.totals.revenue30 : null}
          format={money}
          hint={whop.connector && hasRevenue ? `${whop.totals.payments30} paiement${whop.totals.payments30 > 1 ? "s" : ""}` : undefined}
          empty="Connecter Whop"
          href="#whop"
        />
        <KpiTile label="Messages envoyés" value={String(veille.sent)} hint={`${veille.sent30} sur 30 jours`} empty="Configurer la veille" href={veilleHref} link={veilleHref} />
        <KpiTile
          label="Vidéos écartées"
          value={String(veille.skipped)}
          hint={veille.failed ? `${veille.failed} en échec` : "hors info et géopolitique"}
          alert={veille.failed > 0}
          empty="Configurer la veille"
          href={veilleHref}
          link={veilleHref}
        />
      </div>

      <Card id="whop">
        <CardHeader
          title="Revenus Whop"
          description={
            whop.connector
              ? hasRevenue
                ? `${formatValue(whop.totals.revenue, money)} encaissés en ${whop.totals.payments} paiement${whop.totals.payments > 1 ? "s" : ""}, remboursements déduits.`
                : "Connecté. Les paiements apparaîtront après la première synchronisation."
              : "Paiements encaissés sur Whop, depuis le premier jour."
          }
          action={
            whop.connector ? (
              <form action={syncConnectorNow}>
                <input type="hidden" name="connectorId" value={whop.connector.id} />
                <input type="hidden" name="slug" value={business.slug} />
                <Button type="submit" size="sm" variant="ghost">
                  <RefreshCw /> Synchroniser
                </Button>
              </form>
            ) : null
          }
        />
        <div className="flex flex-col gap-5 p-5 pt-4 sm:p-6 sm:pt-4">
          {!whop.connector ? (
            <div className="flex max-w-xl flex-col gap-4">
              <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
                <li>Whop → Dashboard de l&apos;entreprise → Developer → API keys → Créer une clé.</li>
                <li>Lui donner au minimum la lecture des paiements (payment:basic:read).</li>
                <li>Coller la clé ci-dessous : elle est testée puis chiffrée, l&apos;historique complet est importé.</li>
              </ol>
              <ConnectorForm kind="whop" businessId={business.id} slug={business.slug} />
            </div>
          ) : whop.connector.status === "error" ? (
            <div className="flex max-w-xl flex-col gap-3">
              <p className="text-[13px] text-danger">{whop.connector.last_error ?? "La dernière synchronisation a échoué."}</p>
              <ConnectorForm kind="whop" businessId={business.id} slug={business.slug} reconnect />
            </div>
          ) : null}

          {hasRevenue ? (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-2 text-[13px] font-medium">Cumul depuis le premier paiement</p>
                  <AreaChart points={whop.cumulative} format={money} label="Revenus cumulés" height={190} monthly />
                </div>
                <div className="min-w-0">
                  <p className="mb-2 text-[13px] font-medium">Par mois</p>
                  <AreaChart points={whop.monthly} format={money} label="Revenus du mois" height={190} monthly />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-[13px] sm:grid-cols-4">
                <Figure label="Paiements" value={String(whop.totals.payments)} />
                <Figure label="Remboursé" value={formatValue(whop.totals.refunds, money)} />
                <Figure label="Panier moyen" value={whop.totals.payments ? formatValue((whop.totals.revenue + whop.totals.refunds) / whop.totals.payments, money) : "—"} />
                <Figure label="Meilleur mois" value={whop.totals.bestMonth ? `${formatMonth(whop.totals.bestMonth.day)} · ${formatValue(whop.totals.bestMonth.value, money, true)}` : "—"} />
              </dl>
              {whop.otherCurrencies.length ? (
                <p className="text-[12px] text-faint">
                  Montants en {whop.otherCurrencies.map((c) => c.toUpperCase()).join(", ")} non additionnés (aucune conversion n&apos;est inventée).
                </p>
              ) : null}
              {whop.connector?.last_sync_at ? <p className="text-[12px] text-faint">Synchronisé {formatRelative(whop.connector.last_sync_at)}, puis chaque heure.</p> : null}
            </>
          ) : whop.connector && whop.connector.status !== "error" ? (
            <EmptyState icon={<Wallet />} title="Aucun paiement pour l'instant" description="Lance une synchronisation si la clé vient d'être ajoutée." />
          ) : null}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Messages envoyés" description="Par jour, sur 30 jours, dans le groupe Telegram." />
          <div className="p-5 pt-4 sm:p-6 sm:pt-4">
            <AreaChart points={veille.perDay} format={{ kind: "number" }} label="Messages envoyés" height={170} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Derniers messages" action={<ButtonLink href={veilleHref} variant="ghost" size="sm">Veille</ButtonLink>} />
          <div className="p-2 pt-3">
            {veille.latest.length ? (
              <ul>
                {veille.latest.map((item) => (
                  <li key={item.id}>
                    <Link href={item.url} target="_blank" rel="noreferrer noopener" className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-fill">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[14px] font-medium">{item.title || item.url}</p>
                        <p className={cn("text-[12px] text-muted")}>
                          {formatDateTime(item.sent_at)}
                          {item.category ? ` · ${item.category}` : ""}
                        </p>
                      </div>
                      <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Radar />} title="Rien d'envoyé pour l'instant" description="Les messages publiés dans le groupe apparaîtront ici." />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="tabular truncate font-semibold">{value}</dd>
    </div>
  );
}
