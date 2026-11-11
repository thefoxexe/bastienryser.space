import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { Card } from "@/components/ui";
import { appStats } from "@/lib/app-stats";

/** Résumé des inscriptions (base Supabase de l'application) sur l'aperçu du business ; un clic ouvre le détail. */
export async function AppSummary({ businessId, slug }: { businessId: string; slug: string }) {
  const stats = await appStats(businessId, 30);
  if (!stats) return null;
  const t = stats.totals;
  const signups30 = (stats.series.signups ?? []).reduce((a, p) => a + p.value, 0);
  const items = [
    { label: "Entreprises inscrites", value: t.organizations ?? stats.organizations.length, hint: `+${signups30} sur 30 j`, trend: stats.series.signups?.map((p) => p.value) },
    { label: "Payantes", value: t.paying ?? 0, hint: t.organizations ? `${Math.round(((t.paying ?? 0) / t.organizations) * 100)} % des inscrites` : "" },
    { label: "En essai", value: t.trialing ?? 0, hint: t.trial_expired ? `${t.trial_expired} essais expirés` : "" },
    { label: "Actives 30 j", value: t.active_30d ?? 0, hint: "ont utilisé l'app", trend: stats.series.active_orgs?.map((p) => p.value) },
  ];
  return (
    <Link href={`/b/${slug}/app`} className="group block rounded-2xl outline-offset-4">
      <Card className="p-5 transition-[box-shadow,transform] duration-300 ease-[var(--ease-apple)] group-hover:shadow-pop group-active:scale-[0.99] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">Inscriptions</h2>
          <span className="flex items-center gap-0.5 text-[13px] text-muted transition group-hover:text-text">
            Voir le détail <ChevronRight className="size-4" />
          </span>
        </div>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          {items.map((i) => (
            <div key={i.label} className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[13px] text-muted">{i.label}</span>
              <span className="tabular font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tracking-[-0.035em]">{i.value}</span>
              <div className="flex items-end justify-between gap-2">
                <span className="truncate text-[12px] text-faint">{i.hint}</span>
                {i.trend ? <Sparkline values={i.trend} className="h-6 w-14 shrink-0" /> : null}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Link>
  );
}
