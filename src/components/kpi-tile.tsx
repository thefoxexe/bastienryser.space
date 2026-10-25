import Link from "next/link";
import { Sparkline } from "@/components/charts/sparkline";
import { Card } from "@/components/ui";
import { cn } from "@/components/ui/cn";

/** Variation réelle entre les deux moitiés de la période (ex. 15 derniers jours contre les 15 d'avant). */
export function halfDelta(values?: number[]) {
  if (!values || values.length < 4) return null;
  const half = Math.floor(values.length / 2);
  const before = values.slice(0, half).reduce((a, v) => a + v, 0);
  const after = values.slice(-half).reduce((a, v) => a + v, 0);
  if (before <= 0) return null;
  return { pct: ((after - before) / before) * 100, days: half };
}

/**
 * Chiffre clé : libellé, grand nombre, variation réelle (verte si elle monte) et mini-courbe.
 * Sans donnée, la tuile propose de brancher la source au lieu d'afficher un faux zéro.
 */
export function KpiTile({
  label,
  value,
  hint,
  trend,
  empty,
  href,
  alert,
}: {
  label: string;
  value: string | null;
  hint?: string;
  trend?: number[];
  empty: string;
  href: string;
  alert?: boolean;
}) {
  const delta = halfDelta(trend);
  return (
    <Card className="flex min-h-[132px] flex-col justify-between gap-3 p-4 sm:p-5">
      <span className="text-[13px] text-muted">{label}</span>
      {value !== null ? (
        <>
          <span className="tabular font-[family-name:var(--font-display)] text-[26px] font-semibold leading-none tracking-[-0.035em] sm:text-[30px]">{value}</span>
          <div className="flex items-end justify-between gap-2">
            {delta && !hint && !alert ? (
              <span
                className={cn("tabular whitespace-nowrap text-[12px] font-medium", delta.pct >= 0.5 ? "text-glow" : "text-muted")}
                title={`${delta.days} derniers jours, comparés aux ${delta.days} précédents`}
              >
                {delta.pct >= 0 ? "+" : "−"}
                {Math.abs(delta.pct).toLocaleString("fr-CH", { maximumFractionDigits: Math.abs(delta.pct) >= 10 ? 0 : 1 })} %
              </span>
            ) : (
              <span className={cn("min-w-0 truncate text-[12px]", alert ? "font-medium text-danger" : "text-faint")} title={hint}>
                {hint ?? ""}
              </span>
            )}
            {trend ? <Sparkline values={trend} className="h-7 w-16 shrink-0 sm:w-20" /> : null}
          </div>
        </>
      ) : (
        <Link href={href} className="text-[14px] font-medium text-muted transition hover:text-text">
          {empty} →
        </Link>
      )}
    </Card>
  );
}
