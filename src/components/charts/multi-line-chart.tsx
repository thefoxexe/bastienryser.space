"use client";

import { useRef, useState } from "react";
import { monotonePath, tooltipPlacement, useCloseOnOutsideTap } from "./area-chart";
import { formatDay, formatValue, niceMax, type ValueFormat } from "./format";

export type LineSeries = { label: string; points: { day: string; value: number }[] };

const W = 640;
const H = 200;
const PAD_TOP = 12;
// Monochrome : la source de référence en vert, les autres en encre pleine puis pointillée.
const STYLES = [
  { stroke: "var(--green)", dash: undefined, opacity: 1, swatch: "bg-green" },
  { stroke: "var(--text)", dash: undefined, opacity: 0.8, swatch: "bg-text" },
  { stroke: "var(--text)", dash: "5 5", opacity: 0.5, swatch: "bg-faint" },
];

/** Plusieurs sources de la même mesure, chacune sa ligne (jamais empilées) ; survol : toutes les valeurs du jour. */
export function MultiLineChart({ series, format, height = 220 }: { series: LineSeries[]; format: ValueFormat; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  useCloseOnOutsideTap(ref, hover !== null, () => setHover(null));
  const days = series[0]?.points.map((p) => p.day) ?? [];
  if (!days.length) return null;
  const last = days.length - 1;
  const max = niceMax(Math.max(...series.flatMap((s) => s.points.map((p) => p.value)), 0));
  const x = (i: number) => (days.length === 1 ? W / 2 : (i / last) * W);
  const y = (v: number) => PAD_TOP + ((max - v) / max) * (H - PAD_TOP);
  const pct = (i: number) => `${(x(i) / W) * 100}%`;
  const ticks = [max, max / 2, 0];

  function onMove(e: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    setHover(Math.round(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * last));
  }

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
        {series.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`h-[2px] w-4 rounded-full ${STYLES[i % STYLES.length].swatch}`} /> {s.label}
          </span>
        ))}
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
          aria-label={series.map((s) => `${s.label} : ${formatValue(s.points.reduce((a, p) => a + p.value, 0), format)}`).join(", ")}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            {ticks.map((t) => (
              <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {[...series].reverse().map((s, ri) => {
              const st = STYLES[(series.length - 1 - ri) % STYLES.length];
              return (
                <path
                  key={s.label}
                  d={monotonePath(s.points.map((p, i) => [x(i), y(p.value)]))}
                  fill="none"
                  stroke={st.stroke}
                  strokeOpacity={st.opacity}
                  strokeDasharray={st.dash}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
          {hover !== null ? (
            <>
              <div className="pointer-events-none absolute inset-y-0 w-px bg-border-strong" style={{ left: pct(hover) }} />
              <div
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded-[10px] bg-surface px-2.5 py-1.5 text-[12px] shadow-pop"
                style={tooltipPlacement(pct(hover), y(Math.max(...series.map((s) => s.points[hover]?.value ?? 0))) / H, hover, last)}
              >
                <span className="block text-muted">{formatDay(days[hover], true)}</span>
                {series.map((s) => (
                  <span key={s.label} className="tabular block">
                    {s.label} <span className="font-semibold">{formatValue(s.points[hover]?.value ?? 0, format)}</span>
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <div className="tabular relative ml-3 w-12 shrink-0 text-[11px] text-faint" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(y(t) / H) * 100}%` }}>
              {formatValue(t, format, true)}
            </span>
          ))}
        </div>
      </div>
      <div className="mr-15 flex justify-between text-[11px] text-faint">
        <span>{formatDay(days[0])}</span>
        <span>{formatDay(days[Math.floor(last / 2)])}</span>
        <span>{formatDay(days[last])}</span>
      </div>
      <table className="sr-only">
        <caption>Comparaison des sources</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={d}>
              <th scope="row">{formatDay(d)}</th>
              {series.map((s) => (
                <td key={s.label}>
                  {s.label} : {formatValue(s.points[i]?.value ?? 0, format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
