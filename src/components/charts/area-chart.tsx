"use client";

import { useRef, useState } from "react";
import { formatDay, formatValue, niceMax, type ValueFormat } from "./format";

type Point = { day: string; value: number };

/**
 * Courbe lissée monotone (Fritsch-Carlson) : elle passe par chaque point sans jamais
 * dépasser les vraies valeurs (pas de creux ou de pics inventés entre deux jours).
 */
function monotonePath(pts: [number, number][]) {
  const n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const slope = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    if (slope[i - 1] * slope[i] <= 0) return 0;
    return (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]);
  });
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)} ${(pts[i][1] + h * t[i]).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)} ${(pts[i + 1][1] - h * t[i + 1]).toFixed(1)} ${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

const W = 640;
const H = 200;
const PAD_TOP = 12;

/**
 * Courbe d'une seule série sur une période : trait 2 px, aire à 10 %, grille fine, valeur finale indiquée.
 * Survol : ligne de repère et info-bulle avec la date et la valeur exacte. Tableau caché pour les lecteurs d'écran.
 */
export function AreaChart({ points, format, label, height = 200 }: { points: Point[]; format: ValueFormat; label: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;

  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP);
  const line = monotonePath(points.map((p, i) => [x(i), y(p.value)]));
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = points.length - 1;
  const active = hover ?? last;
  const pct = (i: number) => `${(x(i) / W) * 100}%`;
  const top = (v: number) => `${(y(v) / H) * 100}%`;

  function onMove(e: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * last));
  }

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex">
        <div
          ref={ref}
          className="relative flex-1 touch-none select-none"
          style={{ height }}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`${label} : ${formatValue(points[last].value, format)} le ${formatDay(points[last].day)}`}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            {[0, 0.5, 1].map((t) => (
              <line key={t} x1={0} x2={W} y1={y(max * t)} y2={y(max * t)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill="var(--ink)" opacity={0.08} />
            <path d={line} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>

          {hover !== null ? <div className="pointer-events-none absolute inset-y-0 w-px bg-border-strong" style={{ left: pct(hover) }} /> : null}
          <div
            className="pointer-events-none absolute size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_2px_var(--surface)] transition-[left,top] duration-75"
            style={{ left: pct(active), top: top(points[active].value) }}
          />
          {hover !== null ? (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-[10px] bg-surface px-2.5 py-1.5 text-[12px] shadow-pop"
              style={{ left: pct(hover), transform: `translate(${hover > last * 0.7 ? "-100%" : hover < last * 0.3 ? "0" : "-50%"}, -100%)` }}
            >
              <span className="block text-muted">{formatDay(points[hover].day, true)}</span>
              <span className="tabular block font-semibold">{formatValue(points[hover].value, format)}</span>
            </div>
          ) : null}
        </div>
        <div className="tabular relative ml-3 w-12 shrink-0 text-[11px] text-faint" style={{ height }}>
          {[1, 0.5, 0].map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: top(max * t) }}>
              {formatValue(max * t, format, true)}
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
        <caption>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{formatDay(p.day)}</th>
              <td>{formatValue(p.value, format)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
