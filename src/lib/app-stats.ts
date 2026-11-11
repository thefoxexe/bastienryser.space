import "server-only";
import { listConnectors, metricSeries, type Connector, type SeriesPoint } from "@/lib/metrics";

/** Entreprise inscrite sur l'application (relevé de panel-stats : jamais d'e-mail ni de coordonnées). */
export type AppOrg = {
  id: string;
  name: string;
  trade: string | null;
  plan: string | null;
  plan_name: string | null;
  plan_monthly: number | null;
  plan_yearly: number | null;
  status: string | null;
  complimentary: boolean;
  created_at: string;
  trial_ends_at: string | null;
  trial_used: boolean;
  onboarded: boolean;
  source: string | null;
  promo: boolean;
  members: number;
  last_active: string | null;
  active_days_30: number;
};

export type AppTotals = {
  organizations?: number;
  users?: number;
  paying?: number;
  trialing?: number;
  complimentary?: number;
  canceled?: number;
  trial_expired?: number;
  no_plan?: number;
  onboarded?: number;
  active_30d?: number;
  by_status?: Record<string, number>;
  by_plan?: Record<string, number>;
  by_source?: Record<string, number>;
  newsletter?: { subscribed: number; total: number };
  cancellation_reasons?: { reason: string; n: number }[];
};

export type AppStats = {
  connector: Connector;
  totals: AppTotals;
  organizations: AppOrg[];
  generatedAt: string | null;
  series: Record<"signups" | "visitors" | "active_orgs" | "trials" | "activations" | "cancellations" | "users", SeriesPoint[] | null>;
};

export async function appConnector(businessId: string) {
  return (await listConnectors(businessId)).find((c) => c.kind === "app") ?? null;
}

/** Chiffres de l'application d'un business (Cantia…), ou null si aucun connecteur « Application ». */
export async function appStats(businessId: string, days = 90): Promise<AppStats | null> {
  const connector = await appConnector(businessId);
  if (!connector) return null;
  const s = (metric: string, trimTrailing = false) => metricSeries({ businessId, metric: `app_${metric}`, days, trimTrailing });
  const [signups, visitors, active_orgs, trials, activations, cancellations, users] = await Promise.all([
    s("signups"),
    s("visitors"),
    s("active_orgs"),
    s("sub_trial_started"),
    s("sub_activated"),
    s("sub_canceled"),
    s("users"),
  ]);
  return {
    connector,
    totals: (connector.snapshot.totals ?? {}) as AppTotals,
    organizations: (connector.snapshot.organizations ?? []) as unknown as AppOrg[],
    generatedAt: connector.snapshot.generated_at ?? null,
    series: { signups, visitors, active_orgs, trials, activations, cancellations, users },
  };
}

export const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Payant", tone: "success" },
  trialing: { label: "Essai", tone: "warning" },
  canceled: { label: "Résilié", tone: "danger" },
  trial_expired: { label: "Essai expiré", tone: "neutral" },
  past_due: { label: "Paiement en retard", tone: "danger" },
  sans_formule: { label: "Sans formule", tone: "neutral" },
};

export const statusOf = (o: Pick<AppOrg, "status" | "complimentary">) =>
  o.complimentary ? { label: "Offert", tone: "neutral" as const } : (STATUS[o.status ?? "sans_formule"] ?? { label: o.status ?? "—", tone: "neutral" as const });
