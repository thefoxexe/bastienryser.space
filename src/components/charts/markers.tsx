"use client";

export type ChartMarker = { day: string; title: string };

const dayNumber = (day: string) => Date.parse(`${day}T12:00:00Z`) / 86_400_000;

/**
 * Place chaque jalon sur le point du graphique qui le contient (jour, ou semaine en vue longue).
 * Un jalon postérieur aux dernières données (Search Console : 2 à 3 jours de décalage) se pose
 * sur le dernier point s'il date de moins de 14 jours ; plus ancien que le graphique, il est ignoré.
 */
export function placeMarkers(days: string[], markers: ChartMarker[] | undefined) {
  const at = new Map<number, ChartMarker[]>();
  if (!markers?.length || !days.length) return at;
  const first = dayNumber(days[0]);
  const last = days.length - 1;
  for (const m of markers) {
    const d = dayNumber(m.day);
    if (d < first) continue;
    let index = -1;
    for (let i = last; i >= 0; i--) {
      if (dayNumber(days[i]) <= d) {
        index = i;
        break;
      }
    }
    if (index === last && d - dayNumber(days[last]) > 14) continue;
    if (!at.has(index)) at.set(index, []);
    at.get(index)!.push(m);
  }
  return at;
}

/** Traits verticaux discrets avec une pastille en haut, sous l'info-bulle du graphique. */
export function MarkerLines({ placed, left }: { placed: Map<number, ChartMarker[]>; left: (i: number) => string }) {
  return (
    <>
      {[...placed.entries()].map(([i, list]) => (
        <div key={i} className="pointer-events-none absolute inset-y-0 -translate-x-1/2" style={{ left: left(i) }} aria-hidden>
          <div className="absolute inset-y-0 left-1/2 w-0 -translate-x-1/2 border-l border-dashed border-[color-mix(in_oklab,var(--text)_38%,transparent)]" />
          <div className="absolute -top-1 left-1/2 size-[9px] -translate-x-1/2 rounded-full bg-text shadow-[0_0_0_2px_var(--surface)]" title={list.map((m) => m.title).join(" · ")} />
        </div>
      ))}
    </>
  );
}

/** Lignes de jalons dans l'info-bulle, quand le point survolé en porte. */
export function MarkerTooltip({ list }: { list: ChartMarker[] | undefined }) {
  if (!list?.length) return null;
  return (
    <span className="mt-1 block w-max min-w-full max-w-[200px] whitespace-normal border-t border-border pt-1">
      {list.map((m, i) => (
        <span key={i} className="flex items-start gap-1.5 font-medium">
          <span className="mt-[5px] size-[6px] shrink-0 rounded-full bg-text" />
          {m.title}
        </span>
      ))}
    </span>
  );
}

/** Rappel sous le graphique : les jalons visibles sur la période, avec leur date. */
export function MarkerLegend({ placed, format }: { placed: Map<number, ChartMarker[]>; format: (day: string) => string }) {
  const all = [...placed.values()].flat();
  if (!all.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      {all.map((m, i) => (
        <li key={i} className="flex min-w-0 items-center gap-1.5">
          <span className="size-[6px] shrink-0 rounded-full bg-text" />
          <span className="tabular shrink-0">{format(m.day)}</span>
          <span className="truncate">{m.title}</span>
        </li>
      ))}
    </ul>
  );
}
