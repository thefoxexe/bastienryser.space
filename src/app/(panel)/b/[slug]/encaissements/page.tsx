import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HandCoins, Trash2 } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatMonth, formatValue } from "@/components/charts/format";
import { KpiTile } from "@/components/kpi-tile";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { cashOverview } from "@/lib/cash";
import { getBusiness } from "@/lib/data";
import { formatDate, zurichDayKey } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { deletePayment } from "./actions";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Encaissements" };

const CHF = { kind: "currency", currency: "chf" } as const;

type Payment = { id: string; day: string; amount: number; currency: string; client: string | null; label: string; category: string | null; reference: string | null };

export default async function PaymentsPage({ params }: PageProps<"/b/[slug]/encaissements">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  if (business.revenue_model === "subscriptions") notFound();

  const supabase = await createClient();
  const [cash, { data }] = await Promise.all([
    cashOverview([business], { businessId: business.id, manualOnly: true }),
    supabase
      .from("ledger_entries")
      .select("id, day, amount, currency, client, label, category, reference")
      .eq("business_id", business.id)
      .eq("kind", "income")
      .order("day", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const payments = ((data ?? []) as Payment[]).map((p) => ({ ...p, amount: Number(p.amount) }));
  const clients = [...new Set(payments.map((p) => p.client).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "fr"));
  const w = cash.windows;
  const year = new Date().getFullYear();

  // Regroupés par mois, avec le total du mois en CHF (taux BCE du jour de chaque paiement).
  const monthTotals = new Map(cash.monthly.map((m) => [m.day.slice(0, 7), m.income]));
  const groups: { month: string; items: Payment[] }[] = [];
  for (const p of payments) {
    const month = p.day.slice(0, 7);
    if (groups[groups.length - 1]?.month !== month) groups.push({ month, items: [] });
    groups[groups.length - 1].items.push(p);
  }

  return (
    <>
      <p className="max-w-2xl text-[13px] text-muted">
        Relève ici chaque paiement reçu pour un devis ou une prestation. Pas de facture à créer : juste l&apos;argent encaissé, compté dans les totaux de
        l&apos;accueil (converti en CHF au taux BCE du jour).
      </p>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile label="Encaissé depuis toujours" amount={cash.hasData ? w.allTime.income : null} format={CHF} hint={`${payments.length} paiement${payments.length > 1 ? "s" : ""}`} empty="Aucun paiement relevé" href="#relever" />
        <KpiTile label={`En ${year}`} amount={cash.hasData ? w.year.income : null} format={CHF} hint={w.lastYearToDate.income > 0 ? `${year - 1} à date : ${formatValue(w.lastYearToDate.income, CHF, true)}` : undefined} empty="Aucun paiement relevé" href="#relever" />
        <KpiTile label="Ce mois-ci" amount={cash.hasData ? w.month.income : null} format={CHF} hint={`mois dernier ${formatValue(w.lastMonth.income, CHF, true)}`} empty="Aucun paiement relevé" href="#relever" />
        <KpiTile
          label="Paiement moyen"
          amount={payments.length && cash.hasData ? Math.round((w.allTime.income / payments.length) * 100) / 100 : null}
          format={CHF}
          hint={clients.length ? `${clients.length} client${clients.length > 1 ? "s" : ""}` : undefined}
          empty="Aucun paiement relevé"
          href="#relever"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {cash.monthly.length > 1 ? (
            <Card>
              <CardHeader title="Encaissé par mois" description="En CHF." />
              <div className="p-5 pt-4 sm:p-6 sm:pt-4">
                <AreaChart points={cash.monthly.map((m) => ({ day: m.day, value: m.income }))} format={CHF} label="Encaissé du mois" height={180} monthly />
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Paiements reçus" />
            {groups.length ? (
              <div className="flex flex-col pb-2">
                {groups.map((g) => (
                  <section key={g.month}>
                    <div className="flex items-baseline justify-between px-5 pb-1 pt-4 sm:px-6">
                      <h3 className="text-[13px] font-medium capitalize">{formatMonth(`${g.month}-01`)}</h3>
                      <span className="tabular text-[13px] font-semibold">{formatValue(monthTotals.get(g.month) ?? 0, CHF)}</span>
                    </div>
                    <ul className="divide-y divide-border px-5 sm:px-6">
                      {g.items.map((p) => (
                        <li key={p.id} className="group flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-medium">{p.client ? `${p.client} · ${p.label}` : p.label}</p>
                            <p className="truncate text-[12px] text-muted">
                              {formatDate(`${p.day}T12:00:00Z`)}
                              {p.category ? ` · ${p.category}` : ""}
                              {p.reference ? ` · ${p.reference}` : ""}
                            </p>
                          </div>
                          <span className="tabular shrink-0 text-[14px] font-semibold">{formatValue(p.amount, { kind: "currency", currency: p.currency })}</span>
                          <form action={deletePayment}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="slug" value={business.slug} />
                            <button
                              type="submit"
                              className="grid size-8 place-items-center rounded-full text-faint hover:bg-fill hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                              aria-label="Supprimer ce paiement"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState icon={<HandCoins />} title="Aucun paiement relevé" description="Dès qu'un client te paie, note-le à droite : date, montant, client." />
            )}
          </Card>
        </div>

        <Card id="relever" className="h-fit scroll-mt-6 lg:sticky lg:top-6">
          <CardHeader title="J'ai été payé" description="Enregistre l'argent reçu." />
          <div className="p-5 pt-4 sm:p-6 sm:pt-4">
            <PaymentForm businessId={business.id} slug={business.slug} today={zurichDayKey(new Date())} clients={clients} />
          </div>
        </Card>
      </div>
    </>
  );
}
