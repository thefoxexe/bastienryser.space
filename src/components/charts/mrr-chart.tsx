"use client";

import { useRef, useState } from "react";
import { monotonePath, tooltipPlacement, useCloseOnOutsideTap } from "./area-chart";
import { formatDay, formatValue, niceMax } from "./format";

export type MrrPoint = { day: string; monthly: number; split: number };

const W = 640;
const H = 200;
const PAD_TOP = 12;
const CHF = { kind: "currency", currency: "chf" } as const;

/**
 * Deux courbes du MRR : la part vraiment facturée chaque mois (trait plein) et la part payée d'avance
 * pour l'année, répartie sur 12 mois (pointillés). Survol : les deux valeurs et leur total.
 */
export function MrrChart({ points, height = 220 }: { points: MrrPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  useCloseOnOutsideTap(ref, hover !== null, () => setHover(null));
  if (!points.length) return null;

  const max = niceMax(Math.max(...points.map((p) => Math.max(p.monthly, p.split)), 0));
  const last = points.length - 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / last) * W);
  const y = (v: number) => PAD_TOP + ((max - v) / max) * (H - PAD_TOP);
  const monthly = monotonePath(points.map((p, i) => [x(i), y(p.monthly)]));
  const split = monotonePath(points.map((p, i) => [x(i), y(p.split)]));
  const ticks = [max, max / 2, 0];
  const pct = (i: number) => `${(x(i) / W) * 100}%`;
  const top = (v: number) => `${(y(v) / H) * 100}%`;
  const active = hover ?? last;

  function onMove(e: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    setHover(Math.round(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * last));
  }

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 rounded-full bg-green" /> Payé chaque mois
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-text" /> Payé à l&apos;année, réparti sur 12 mois
        </span>
      </div>
      <div className="flex">
        <div
          ref={ref}
          className="relative flex-1 touch-pan-y select-none"
          style={{ height }}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
          role="img"
          aria-label={`MRR : ${formatValue(points[last].monthly, CHF)} payés chaque mois, ${formatValue(points[last].split, CHF)} répartis de l'annuel`}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            {ticks.map((t) => (
              <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={split} fill="none" stroke="var(--text)" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={monthly} fill="none" stroke="var(--green)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {hover !== null ? <div className="pointer-events-none absolute inset-y-0 w-px bg-border-strong" style={{ left: pct(hover) }} /> : null}
          <div className="dot-glow pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: pct(active), top: top(points[active].monthly) }} />
          <div
            className="pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow-[0_0_0_2px_var(--surface)]"
            style={{ left: pct(active), top: top(points[active].split) }}
          />
          {hover !== null ? (
            <div
              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[10px] bg-surface px-2.5 py-1.5 text-[12px] shadow-pop"
              style={tooltipPlacement(pct(hover), y(Math.max(points[hover].monthly, points[hover].split)) / H, hover, last)}
            >
              <span className="block text-muted">{formatDay(points[hover].day, true)}</span>
              <span className="tabular block">
                Chaque mois <span className="font-semibold">{formatValue(points[hover].monthly, CHF)}</span>
              </span>
              <span className="tabular block">
                Annuel réparti <span className="font-semibold">{formatValue(points[hover].split, CHF)}</span>
              </span>
              <span className="tabular mt-0.5 block border-t border-border pt-0.5 font-semibold">{formatValue(points[hover].monthly + points[hover].split, CHF)}</span>
            </div>
          ) : null}
        </div>
        <div className="tabular relative ml-3 w-12 shrink-0 text-[11px] text-faint" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: top(t) }}>
              {formatValue(t, CHF, true)}
            </span>
          ))}
        </div>
      </div>
      <div className="mr-15 flex justify-between text-[11px] text-faint">
        <span>{formatDay(points[0].day)}</span>
        <span>{formatDay(points[Math.floor(last / 2)].day)}</span>
        <span>{formatDay(points[last].day)}</span>
      </div>
      <table className="sr-only">
        <caption>MRR par jour</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{formatDay(p.day)}</th>
              <td>{formatValue(p.monthly, CHF)} chaque mois</td>
              <td>{formatValue(p.split, CHF)} annuel réparti</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
