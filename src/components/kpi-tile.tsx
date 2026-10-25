import Link from "next/link";
import type { ValueFormat } from "@/components/charts/format";
import { Sparkline } from "@/components/charts/sparkline";
import { CountUp } from "@/components/count-up";
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
  amount,
  format,
  hint,
  trend,
  empty,
  href,
  alert,
}: {
  label: string;
  /** Texte déjà formaté, ou bien `amount` + `format` pour un chiffre animé. */
  value?: string | null;
  amount?: number | null;
  format?: ValueFormat;
  hint?: string;
  trend?: number[];
  empty: string;
  href: string;
  alert?: boolean;
}) {
  const delta = halfDelta(trend);
  const numeric = amount !== undefined && amount !== null && format;
  const present = numeric || (value !== undefined && value !== null);
  return (
    <Card className="@container flex min-h-[132px] min-w-0 flex-col justify-between gap-3 p-4 sm:p-5">
      <span className="truncate text-[13px] text-muted" title={label}>
        {label}
      </span>
      {present ? (
        <>
          {/* Taille relative à la tuile : le chiffre tient toujours, du téléphone au grand écran. */}
          <span className="tabular whitespace-nowrap font-[family-name:var(--font-display)] text-[clamp(18px,14cqw,30px)] font-semibold leading-none tracking-[-0.035em]">
            {numeric ? <CountUp value={amount} format={format} /> : value}
          </span>
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
              <span className={cn("line-clamp-2 min-w-0 text-[12px] leading-snug", alert ? "font-medium text-danger" : "text-faint")} title={hint}>
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
