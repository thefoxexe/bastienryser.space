import { cn } from "@/components/ui/cn";
import { formatDay, formatValue } from "./format";

type Day = { day: string; checks: number; okChecks: number; avgMs: number | null };

function tone(d: Day) {
  if (!d.checks) return "bg-fill";
  const pct = (d.okChecks / d.checks) * 100;
  if (pct >= 99.5) return "bg-green/80";
  if (pct >= 95) return "bg-green/40";
  return "bg-danger";
}

function describe(d: Day) {
  if (!d.checks) return "Pas de mesure";
  const pct = (d.okChecks / d.checks) * 100;
  const incidents = d.checks - d.okChecks;
  return `${formatValue(pct, { kind: "percent" })} disponible${incidents ? ` · ${incidents} échec${incidents > 1 ? "s" : ""}` : ""}${d.avgMs ? ` · ${d.avgMs} ms` : ""}`;
}

/** Une barre par jour, façon page de statut. Chaque barre a son info-bulle ; la légende donne le sens des couleurs. */
export function UptimeBars({ days, className }: { days: Day[]; className?: string }) {
  return (
    <div className={className}>
      <ol className="flex h-8 items-stretch gap-[3px]" aria-label="Disponibilité par jour">
        {days.map((d) => (
          <li key={d.day} className="group relative flex-1">
            <span className={cn("block h-full rounded-[3px] transition-opacity group-hover:opacity-70", tone(d))} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[10px] bg-surface px-2.5 py-1.5 text-[12px] shadow-pop group-hover:block">
              <span className="block text-muted">{formatDay(d.day, true)}</span>
              <span className="block font-medium">{describe(d)}</span>
            </span>
            <span className="sr-only">
              {formatDay(d.day)} : {describe(d)}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{formatDay(days[0]?.day ?? "")}</span>
        <span className="hidden items-center gap-3 sm:flex">
          <Legend className="bg-green/80" label="≥ 99,5 %" />
          <Legend className="bg-green/40" label="≥ 95 %" />
          <Legend className="bg-danger" label="Incident" />
          <Legend className="bg-fill-strong" label="Pas de mesure" />
        </span>
        <span>Aujourd&apos;hui</span>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("size-2 rounded-[2px]", className)} />
      {label}
    </span>
  );
}
