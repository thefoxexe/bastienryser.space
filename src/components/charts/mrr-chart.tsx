"use client";

import { useRef, useState } from "react";
import { monotonePath, tooltipPlacement, useCloseOnOutsideTap } from "./area-chart";
import { formatDay, formatMonth, formatValue, niceMax } from "./format";

/** Parcourt à l'envers un chemin « M x y C … » ou « M x y L … » (mêmes courbes, sens inverse), sans le point de départ. */
function reversePath(d: string) {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const curves = d.includes("C");
  const step = curves ? 6 : 2;
  const pts: number[][] = [];
  for (let i = 2; i < n.length; i += step) pts.push(n.slice(i, i + step));
  let out = "";
  let prev = [n[0], n[1]];
  const segs = pts.map((p) => {
    const seg = { from: prev, p };
    prev = curves ? [p[4], p[5]] : [p[0], p[1]];
    return seg;
  });
  for (const { from, p } of segs.reverse()) out += curves ? ` C${p[2]} ${p[3]} ${p[0]} ${p[1]} ${from[0]} ${from[1]}` : ` L${from[0]} ${from[1]}`;
  return out.trim();
}

export type MrrPoint = { day: string; monthly: number; split: number };

const W = 640;
const H = 200;
const PAD_TOP = 12;
const CHF = { kind: "currency", currency: "chf" } as const;

/**
 * Deux courbes du MRR : le MRR total (annuels répartis compris, la plus haute) et la part vraiment encaissée
 * chaque mois (verte). L'écart entre les deux, grisé, est l'annuel payé d'avance et réparti sur 12 mois.
 */
export function MrrChart({ points, height = 220 }: { points: MrrPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  useCloseOnOutsideTap(ref, hover !== null, () => setHover(null));
  if (!points.length) return null;

  const max = niceMax(Math.max(...points.map((p) => p.monthly + p.split), 0));
  const last = points.length - 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / last) * W);
  const y = (v: number) => PAD_TOP + ((max - v) / max) * (H - PAD_TOP);
  const monthly = monotonePath(points.map((p, i) => [x(i), y(p.monthly)]));
  const totalPts: [number, number][] = points.map((p, i) => [x(i), y(p.monthly + p.split)]);
  const total = monotonePath(totalPts);
  // Bande entre les deux courbes : l'annuel réparti.
  const band = `${total} L${x(last).toFixed(1)} ${y(points[last].monthly).toFixed(1)} ${reversePath(monthly)} Z`;
  const ticks = [max, max / 2, 0];
  const pct = (i: number) => `${(x(i) / W) * 100}%`;
  const top = (v: number) => `${(y(v) / H) * 100}%`;
  const active = hover ?? last;
  // Sur plus de 3 mois, l'axe montre le mois et l'année.
  const date = (d: string) => (last > 90 ? formatMonth(d) : formatDay(d));

  function onMove(e: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    setHover(Math.round(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * last));
  }

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 rounded-full bg-text" /> MRR total
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[2px] w-4 rounded-full bg-green" /> Encaissé chaque mois
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-[3px] bg-[color-mix(in_oklab,var(--text)_12%,transparent)]" /> Annuel réparti
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
          aria-label={`MRR : ${formatValue(points[last].monthly + points[last].split, CHF)}, dont ${formatValue(points[last].monthly, CHF)} encaissés chaque mois`}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            {ticks.map((t) => (
              <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={band} fill="var(--text)" fillOpacity={0.1} />
            <path d={total} fill="none" stroke="var(--text)" strokeOpacity={0.85} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={monthly} fill="none" stroke="var(--green)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {hover !== null ? <div className="pointer-events-none absolute inset-y-0 w-px bg-border-strong" style={{ left: pct(hover) }} /> : null}
          <div className="dot-glow pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: pct(active), top: top(points[active].monthly) }} />
          <div
            className="pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-text shadow-[0_0_0_2px_var(--surface)]"
            style={{ left: pct(active), top: top(points[active].monthly + points[active].split) }}
          />
          {hover !== null ? (
            <div
              className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[10px] bg-surface px-2.5 py-1.5 text-[12px] shadow-pop"
              style={tooltipPlacement(pct(hover), y(points[hover].monthly + points[hover].split) / H, hover, last)}
            >
              <span className="block text-muted">{formatDay(points[hover].day, true)}</span>
              <span className="tabular block font-semibold">MRR {formatValue(points[hover].monthly + points[hover].split, CHF)}</span>
              <span className="tabular block">
                Encaissé chaque mois <span className="font-semibold">{formatValue(points[hover].monthly, CHF)}</span>
              </span>
              <span className="tabular block">
                Annuel réparti <span className="font-semibold">{formatValue(points[hover].split, CHF)}</span>
              </span>
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
        <span>{date(points[0].day)}</span>
        <span>{date(points[Math.floor(last / 2)].day)}</span>
        <span>{date(points[last].day)}</span>
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
