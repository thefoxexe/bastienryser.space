// Notification sur l'app à chaque nouveau paiement (Stripe, Whop) : montant, nature, total du mois du business.
// Repère : connectors.config.notified_until (secondes Unix). Au tout premier passage, on le pose sans rien envoyer
// (sinon tout l'historique partirait d'un coup). Un paiement de plus de 3 jours n'est jamais notifié.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import type { PaymentEvent } from "./connectors.ts";
import { sendAll } from "./push.ts";
import { logActivity } from "./supabase.ts";

const money = (v: number, currency: string) =>
  new Intl.NumberFormat("fr-CH", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(v);

export async function notifyPayments(
  db: SupabaseClient,
  c: { id: string; business_id: string; kind: string; config: Record<string, unknown> },
  events: PaymentEvent[],
) {
  const now = Math.floor(Date.now() / 1000);
  const until = typeof c.config.notified_until === "number" ? c.config.notified_until : null;
  const save = (v: number) => db.from("connectors").update({ config: { ...c.config, notified_until: v } }).eq("id", c.id);
  if (until === null) {
    await save(now);
    return 0;
  }
  const fresh = events.filter((e) => e.at > until && e.at > now - 3 * 86400).sort((a, b) => a.at - b.at);
  if (!fresh.length) return 0;

  const { data: biz } = await db.from("businesses").select("name, slug").eq("id", c.business_id).maybeSingle();
  const name = biz?.name ?? "Business";
  const source = c.kind === "whop" ? "Whop" : "Stripe";

  // Total du mois en cours (heure de Zurich), dans la devise du dernier paiement, remboursements déduits.
  const currency = fresh[fresh.length - 1].currency;
  const monthStart = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date()).slice(0, 7)}-01`;
  const { data: month } = await db.from("metric_points").select("metric, value, unit").eq("connector_id", c.id).gte("day", monthStart).in("metric", ["revenue", "payments"]);
  const monthRevenue = (month ?? []).filter((p) => p.metric === "revenue" && p.unit === currency).reduce((a, p) => a + Number(p.value), 0);
  const monthPayments = (month ?? []).filter((p) => p.metric === "payments").reduce((a, p) => a + Number(p.value), 0);
  const monthLine = `Ce mois : ${money(monthRevenue, currency)} · ${monthPayments} paiement${monthPayments > 1 ? "s" : ""}`;

  const payments = fresh.filter((e) => e.kind === "payment");
  const refunds = fresh.filter((e) => e.kind === "refund");
  let title: string;
  let body: string;
  if (fresh.length === 1) {
    const e = fresh[0];
    title = `${name} · ${e.kind === "refund" ? "−" : "+"}${money(e.amount, e.currency)}`;
    body = `${e.label} · ${source}\n${monthLine}`;
  } else {
    const net = payments.reduce((a, e) => a + (e.currency === currency ? e.amount : 0), 0) - refunds.reduce((a, e) => a + (e.currency === currency ? e.amount : 0), 0);
    title = `${name} · ${payments.length} paiement${payments.length > 1 ? "s" : ""}${refunds.length ? `, ${refunds.length} remboursement${refunds.length > 1 ? "s" : ""}` : ""} · ${net >= 0 ? "+" : "−"}${money(Math.abs(net), currency)}`;
    const kinds = [...new Set(fresh.map((e) => e.label))].join(", ");
    body = `${kinds} · ${source}\n${monthLine}`;
  }

  const last = fresh[fresh.length - 1];
  try {
    await sendAll(db, { title, body, url: biz?.slug ? `/b/${biz.slug}` : "/", tag: `pay-${c.id}-${last.id}` });
  } catch (e) {
    console.error("payment push", e);
  }
  for (const e of fresh) {
    await logActivity(db, {
      business_id: c.business_id,
      kind: e.kind === "refund" ? "payment.refunded" : "payment.received",
      message: `${e.label} ${source} : ${e.kind === "refund" ? "−" : "+"}${money(e.amount, e.currency)}`,
    });
  }
  await save(Math.max(...fresh.map((e) => e.at)));
  return fresh.length;
}
