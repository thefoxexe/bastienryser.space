"use client";

import { useState } from "react";
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

/**
 * Une barre par jour, façon page de statut. Survol (ordinateur) ou toucher (mobile) : le détail du jour
 * s'affiche sous les barres, sans info-bulle qui déborde de l'écran. La légende donne le sens des couleurs.
 */
export function UptimeBars({ days, className }: { days: Day[]; className?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? days.length - 1;
  const day = days[shown];

  return (
    <div className={className}>
      <ol className="flex h-9 items-stretch gap-[2px] sm:h-8 sm:gap-[3px]" aria-label="Disponibilité par jour" onPointerLeave={() => setActive(null)}>
        {days.map((d, i) => (
          <li key={d.day} className="flex-1">
            <button
              type="button"
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={cn(
                "block h-full w-full rounded-[2px] transition-[opacity,transform] sm:rounded-[3px]",
                tone(d),
                active === i ? "scale-y-110 opacity-100" : active !== null ? "opacity-60" : "",
              )}
              aria-label={`${formatDay(d.day)} : ${describe(d)}`}
            />
          </li>
        ))}
      </ol>
      <div className="mt-1.5 flex justify-between text-[11px] text-faint">
        <span>{formatDay(days[0]?.day ?? "")}</span>
        <span>Aujourd&apos;hui</span>
      </div>
      {day ? (
        <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-[10px] bg-fill px-3 py-2 text-[12px]" aria-live="polite">
          <span className="text-muted">{active === null ? "Aujourd'hui" : formatDay(day.day, true)}</span>
          <span className={cn("tabular font-medium", day.checks && day.okChecks / day.checks < 0.95 ? "text-danger" : "text-text")}>{describe(day)}</span>
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-faint">
        <Legend className="bg-green/80" label="≥ 99,5 %" />
        <Legend className="bg-green/40" label="≥ 95 %" />
        <Legend className="bg-danger" label="Incident" />
        <Legend className="bg-fill-strong" label="Pas de mesure" />
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
