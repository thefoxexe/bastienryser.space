"use client";

import { useMemo } from "react";
import { hierarchy, pack } from "d3-hierarchy";
import type { WorldQuery } from "@/lib/web-world";
import { TIER_STYLE, type TierId } from "./tiers";

const SIZE = 360;

/** Bulles rangées d'un groupe : taille = affichages Google ; le mot s'écrit dans la bulle quand elle est assez grande. */
export function TierPack({
  tier,
  queries,
  labels = true,
  selected,
  onHover,
  onSelect,
  max = 90,
}: {
  tier: TierId;
  queries: WorldQuery[];
  labels?: boolean;
  selected?: WorldQuery | null;
  onHover?: (q: WorldQuery | null, e?: React.PointerEvent) => void;
  onSelect?: (q: WorldQuery) => void;
  max?: number;
}) {
  const nodes = useMemo(() => {
    const list = queries.slice(0, max);
    if (!list.length) return [];
    const root = hierarchy<{ children?: WorldQuery[] } | WorldQuery>({ children: list }, (d) => ("children" in d ? d.children : undefined)).sum((d) =>
      "impressions" in d ? Math.max(d.impressions, 1) : 0,
    );
    return pack<{ children?: WorldQuery[] } | WorldQuery>().size([SIZE, SIZE]).padding(3)(root).leaves();
  }, [queries, max]);
  const style = TIER_STYLE[tier];

  if (!nodes.length) {
    return (
      <div className="grid aspect-square place-items-center rounded-full border border-dashed border-border text-[13px] text-faint">Aucune recherche</div>
    );
  }
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full overflow-visible" role="img" aria-label={`${nodes.length} recherches`}>
      {nodes.map((n, i) => {
        const q = n.data as WorldQuery;
        const r = n.r;
        // Le texte rétrécit pour tenir dans la bulle ; coupé seulement s'il deviendrait illisible.
        const fs = Math.max(7.5, Math.min(14, r / 2.4, (r * 1.8) / (q.q.length * 0.56)));
        const fits = labels && r > 14;
        const maxChars = Math.floor((r * 1.8) / (fs * 0.56));
        const text = q.q.length > maxChars ? `${q.q.slice(0, Math.max(1, maxChars - 1))}…` : q.q;
        const isSel = selected === q;
        return (
          <g
            key={`${q.q}-${i}`}
            transform={`translate(${n.x},${n.y})`}
            className="cursor-pointer"
            onPointerEnter={(e) => onHover?.(q, e)}
            onPointerMove={(e) => onHover?.(q, e)}
            onPointerLeave={() => onHover?.(null)}
            onClick={() => onSelect?.(q)}
          >
            <circle
              r={r}
              fill={style.fill}
              fillOpacity={q.clicks > 0 || tier !== "forces" ? 1 : 0.75}
              stroke={isSel ? "var(--text)" : "transparent"}
              strokeWidth={isSel ? 3 : 0}
              className="pop-in transition-opacity hover:opacity-80"
              style={{ animationDelay: `${Math.min(i * 12, 600)}ms` }}
            />
            {fits ? (
              <text textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={600} fill={style.label} className="pointer-events-none select-none">
                {text}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
