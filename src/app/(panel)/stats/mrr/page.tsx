import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Repeat } from "lucide-react";
import { MrrChart } from "@/components/charts/mrr-chart";
import { formatValue } from "@/components/charts/format";
import { KpiTile } from "@/components/kpi-tile";
import { Page } from "@/components/shell/page";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { listBusinesses } from "@/lib/data";
import { formatRelative } from "@/lib/format";
import { mrrDetail } from "@/lib/mrr";

export const metadata: Metadata = { title: "MRR" };

const CHF = { kind: "currency", currency: "chf" } as const;
const chf = (v: number) => formatValue(v, CHF);
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export default async function MrrPage() {
  const businesses = await listBusinesses();
  const mrr = await mrrDetail(businesses);
  const total = mrr.monthly + mrr.split;
  const share = total > 0 ? Math.round((mrr.monthly / total) * 100) : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Argent"
        title="Revenu récurrent"
        description="Abonnements en cours chez Stripe et Whop, en CHF. Un abonnement annuel compte dans l'ARR et, divisé par 12, dans le MRR, mais à part : cet argent est déjà encaissé d'avance."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="MRR" amount={mrr.sources.length ? total : null} format={CHF} hint={share !== null ? `${share} % payé chaque mois` : undefined} empty="Aucun abonnement suivi" href="/" />
        <KpiTile label="Payé chaque mois" amount={mrr.sources.length ? mrr.monthly : null} format={CHF} hint="tombe vraiment chaque mois" empty="Aucun abonnement suivi" href="/" />
        <KpiTile label="Annuel réparti" amount={mrr.sources.length ? mrr.split : null} format={CHF} hint="encaissé d'avance, ÷ 12" empty="Aucun abonnement suivi" href="/" />
        <KpiTile label="ARR" amount={mrr.sources.length ? total * 12 : null} format={CHF} hint="MRR × 12" empty="Aucun abonnement suivi" href="/" />
      </div>

      <Card>
        <CardHeader title="MRR jour après jour" description="Relevé chaque heure depuis la connexion ; Stripe et Whop ne fournissent pas l'historique avant." />
        <div className="p-5 pt-4 sm:p-6 sm:pt-4">
          {mrr.history.length > 1 ? (
            <MrrChart points={mrr.history} />
          ) : (
            <p className="text-[13px] text-muted">
              Premier relevé aujourd&apos;hui{mrr.history[0] ? ` : ${chf(mrr.history[0].monthly)} payés chaque mois, ${chf(mrr.history[0].split)} d'annuel réparti` : ""}. Les deux courbes se
              dessinent à partir de demain.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Par source" />
        {mrr.sources.length ? (
          <ul className="divide-y divide-border px-5 pb-2 sm:px-6">
            {mrr.sources.map((s) => (
              <li key={s.connectorId} className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/b/${s.businessSlug}`} className="text-[14px] font-medium hover:underline">
                    {s.businessName}
                  </Link>
                  <span className="text-[12px] text-muted"> · {s.kind === "stripe" ? "Stripe" : "Whop"}</span>
                  {s.error ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-danger">
                      <AlertTriangle className="size-3.5 shrink-0" /> {s.error}
                    </p>
                  ) : (
                    <p className="text-[12px] text-muted">
                      {[
                        s.subscribersMonthly !== null ? plural(s.subscribersMonthly, "abonnement mensuel") : null,
                        s.subscribersSplit !== null ? plural(s.subscribersSplit, "abonnement annuel") : null,
                        s.canceling ? `${plural(s.canceling, "résiliation")} en fin de période` : null,
                        s.at ? `relevé ${formatRelative(s.at)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {s.native.some((n) => n.currency !== "chf")
                        ? ` · ${s.native.map((n) => `${formatValue(n.monthly + n.split, { kind: "currency", currency: n.currency })}`).join(", ")} d'origine`
                        : ""}
                    </p>
                  )}
                </div>
                {s.error ? null : (
                  <dl className="tabular grid shrink-0 grid-cols-3 gap-4 text-right text-[13px]">
                    <div>
                      <dt className="text-[11px] text-muted">Chaque mois</dt>
                      <dd className="font-semibold">{chf(s.monthly)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted">Annuel ÷ 12</dt>
                      <dd className="font-semibold">{chf(s.split)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted">ARR</dt>
                      <dd className="font-semibold">{chf((s.monthly + s.split) * 12)}</dd>
                    </div>
                  </dl>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Repeat />} title="Aucun abonnement suivi" description="Connecte Stripe ou Whop dans un business d'abonnements." />
        )}
      </Card>
    </Page>
  );
}
