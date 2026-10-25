"use client";

import { useRef, useState } from "react";
import { monotonePath } from "./area-chart";
import { formatDay } from "./format";

type Point = { day: string; position: number | null; clicks: number; impressions: number };

const W = 640;
const H = 200;

/**
 * Position dans Google au fil du temps : axe inversé (1 en haut), ligne interrompue les jours sans impression.
 * Survol : date, position, clics et impressions du jour.
 */
export function PositionChart({ points, height = 220 }: { points: Point[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const known = points.filter((p) => p.position !== null).map((p) => p.position!);
  if (!known.length) return <p className="text-[13px] text-muted">Pas encore de position enregistrée pour ce mot-clé.</p>;

  const worst = Math.max(...known);
  const max = worst <= 10 ? 10 : worst <= 20 ? 20 : worst <= 50 ? 50 : Math.ceil(worst / 50) * 50;
  const ticks = max === 10 ? [1, 3, 10] : [1, 10, Math.round(max / 2) === 10 ? 15 : Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const last = points.length - 1;
  const x = (i: number) => (last ? (i / last) * W : W / 2);
  const y = (p: number) => 8 + ((p - 1) / (max - 1)) * (H - 16);

  // Segments continus entre les jours sans donnée.
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  points.forEach((p, i) => {
    if (p.position === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push([x(i), y(p.position)]);
  });
  if (current.length) segments.push(current);

  const lastKnown = [...points.keys()].reverse().find((i) => points[i].position !== null)!;
  const active = hover !== null && points[hover].position !== null ? hover : hover === null ? lastKnown : null;
  const pct = (i: number) => `${(x(i) / W) * 100}%`;
  const top = (p: number) => `${(y(p) / H) * 100}%`;

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex">
        <div
          ref={ref}
          className="relative flex-1 touch-none select-none"
          style={{ height }}
          onPointerMove={(e) => {
            const rect = ref.current!.getBoundingClientRect();
            setHover(Math.round(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * last));
          }}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Position dans Google : ${points[lastKnown].position} le ${formatDay(points[lastKnown].day)}`}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            <defs>
              <linearGradient id="top10-band" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--green)" stopOpacity={0.14} />
                <stop offset="1" stopColor="var(--green)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {/* Zone du top 10 (première page de Google). */}
            <rect x={0} y={y(1) - 8} width={W} height={y(Math.min(10, max)) - y(1) + 8} fill="url(#top10-band)" />
            {ticks.map((t) => (
              <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {/* Halo flou, puis trait net. */}
          {[true, false].map((glow) => (
            <svg
              key={String(glow)}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className={glow ? "pointer-events-none absolute inset-0 size-full overflow-visible opacity-60 blur-[7px]" : "pointer-events-none absolute inset-0 size-full overflow-visible"}
              aria-hidden
            >
              {segments.map((seg, i) =>
                seg.length === 1 ? (
                  <circle key={i} cx={seg[0][0]} cy={seg[0][1]} r={glow ? 4 : 2.5} fill="var(--green)" />
                ) : (
                  <path key={i} d={monotonePath(seg)} fill="none" stroke="var(--green)" strokeWidth={glow ? 6 : 2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                ),
              )}
            </svg>
          ))}
          {hover !== null ? <div className="pointer-events-none absolute inset-y-0 w-px bg-border-strong" style={{ left: pct(hover) }} /> : null}
          {active !== null ? (
            <div
              className="dot-glow pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: pct(active), top: top(points[active].position!) }}
            />
          ) : null}
          {hover !== null ? (
            <div
              className="pointer-events-none absolute -top-2 z-10 whitespace-nowrap rounded-[10px] bg-surface px-2.5 py-1.5 text-[12px] shadow-pop"
              style={{ left: pct(hover), transform: `translate(${hover > last * 0.7 ? "-100%" : hover < last * 0.3 ? "0" : "-50%"}, -100%)` }}
            >
              <span className="block text-muted">{formatDay(points[hover].day, true)}</span>
              {points[hover].position !== null ? (
                <>
                  <span className="tabular block font-semibold">Position {points[hover].position!.toLocaleString("fr-CH")}</span>
                  <span className="tabular block text-muted">
                    {points[hover].clicks} clic{points[hover].clicks > 1 ? "s" : ""} · {points[hover].impressions} impr.
                  </span>
                </>
              ) : (
                <span className="block font-medium">Aucune impression</span>
              )}
            </div>
          ) : null}
        </div>
        <div className="tabular relative ml-3 w-12 shrink-0 text-[11px] text-faint" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: top(t) }}>
              {t === 1 ? "1er" : `${t}e`}
            </span>
          ))}
        </div>
      </div>
      <div className="mr-15 flex justify-between text-[11px] text-faint">
        <span>{formatDay(points[0].day)}</span>
        <span>{formatDay(points[Math.floor(last / 2)].day)}</span>
        <span>{formatDay(points[last].day)}</span>
      </div>
    </figure>
  );
}

/** Mini-courbe de position (inversée, interrompue les jours sans donnée) : verte si le mot-clé monte, grise sinon. */
export function PositionSparkline({ values, className }: { values: (number | null)[]; className?: string }) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return <span className={className} />;
  const min = Math.min(...known);
  const maxV = Math.max(...known);
  const span = Math.max(maxV - min, 1);
  const W = 100;
  const H = 28;
  const last = values.length - 1;
  const segs: string[] = [];
  let d = "";
  values.forEach((v, i) => {
    if (v === null) {
      if (d) segs.push(d);
      d = "";
      return;
    }
    const px = (i / last) * W;
    const py = 3 + ((v - min) / span) * (H - 6);
    d += `${d ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`;
  });
  if (d) segs.push(d);
  const rising = known.at(-1)! < known[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      {segs.map((s, i) => (
        <path key={i} d={s} fill="none" stroke={rising ? "var(--green)" : "var(--faint)"} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
