"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { World, WorldQuery } from "@/lib/web-world";
import { TierPack } from "./pack";
import { pageName, TIER_STYLE, TIERS, tierOf, type TierId } from "./tiers";

const nf = (v: number) => new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 1 }).format(v);
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Carte des recherches Google d'un site : trois groupes de bulles (forces, opportunités, hors de portée), filtres et plan d'action. */
export function SearchMap({ world }: { world: World }) {
  const [section, setSection] = useState<string>("all");
  const [text, setText] = useState("");
  const [hover, setHover] = useState<{ q: WorldQuery; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<WorldQuery | null>(null);

  const sections = useMemo(() => world.sections.filter((s) => world.queries.some((q) => q.section === s.name)).slice(0, 7), [world]);
  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    return world.queries.filter((q) => (section === "all" || q.section === section) && (!t || q.q.toLowerCase().includes(t)));
  }, [world, section, text]);
  const byTier = useMemo(() => {
    const m: Record<TierId, WorldQuery[]> = { forces: [], opportunites: [], loin: [] };
    for (const q of filtered) m[tierOf(q)].push(q);
    return m;
  }, [filtered]);
  const plan = byTier.opportunites.slice(0, 8);
  const site = world.domain ? `https://${world.domain}` : "";

  const hoverAt = (q: WorldQuery | null, e?: React.PointerEvent) => setHover(q && e ? { q, x: e.clientX, y: e.clientY } : null);

  return (
    <div className="flex flex-col gap-4">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="scrollbar-none flex max-w-full gap-1 overflow-x-auto rounded-full bg-fill p-1">
          {[{ name: "all", label: "Tout le site" }, ...sections.map((s) => ({ name: s.name, label: label(s.name) }))].map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setSection(s.name)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] transition",
                section === s.name ? "bg-surface font-medium text-text shadow-card" : "text-muted hover:text-text",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex h-9 w-full items-center gap-2 rounded-full bg-fill px-3 text-[13px] sm:w-64">
          <Search className="size-4 text-muted" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Chercher une recherche…" className="w-full bg-transparent outline-none placeholder:text-faint" />
          {text ? (
            <button type="button" onClick={() => setText("")} aria-label="Effacer">
              <X className="size-4 text-muted" />
            </button>
          ) : null}
        </label>
      </div>

      {/* Les trois groupes */}
      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => {
          const list = byTier[t.id];
          const impressions = list.reduce((a, q) => a + q.impressions, 0);
          const clicks = list.reduce((a, q) => a + q.clicks, 0);
          return (
            <Card key={t.id} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-[17px] font-semibold">
                    <span className={cn("size-2.5 rounded-full", TIER_STYLE[t.id].dot)} />
                    {t.title}
                  </h3>
                  <p className="text-[12px] text-muted">{t.range}</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-[22px] font-semibold leading-none">{list.length}</p>
                  <p className="text-[11px] text-muted">recherche{list.length > 1 ? "s" : ""}</p>
                </div>
              </div>
              <TierPack tier={t.id} queries={list} selected={selected} onHover={hoverAt} onSelect={setSelected} />
              <div className="mt-auto flex flex-col gap-1 border-t border-border pt-3">
                <p className="tabular text-[13px]">
                  <span className="font-semibold">{nf(impressions)}</span> <span className="text-muted">affichages ·</span> <span className="font-semibold">{nf(clicks)}</span>{" "}
                  <span className="text-muted">clics</span>
                </p>
                <p className="text-[12px] leading-snug text-muted">{t.hint}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Fiche de la recherche choisie */}
      {selected ? (
        <Card className="relative flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-6 sm:p-6">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[12px] text-muted">
              <span className={cn("size-2 rounded-full", TIER_STYLE[tierOf(selected)].dot)} />
              {TIERS.find((t) => t.id === tierOf(selected))!.title}
            </p>
            <h3 className="mt-0.5 text-[20px] font-semibold tracking-[-0.02em]">« {selected.q} »</h3>
            <p className="mt-2 text-[14px] leading-relaxed">{TIERS.find((t) => t.id === tierOf(selected))!.advice(selected)}</p>
            {site ? (
              <a href={`${site}${selected.page.startsWith("/") ? selected.page : ""}`} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-text">
                {selected.page === "/" ? "Page d'accueil" : selected.page} <ArrowUpRight className="size-3.5" />
              </a>
            ) : null}
          </div>
          <dl className="grid shrink-0 grid-cols-4 gap-5 sm:grid-cols-2">
            {[
              ["Position", nf(selected.position)],
              ["Affichages", nf(selected.impressions)],
              ["Clics", nf(selected.clicks)],
              ["Taux de clic", selected.impressions ? `${nf((selected.clicks / selected.impressions) * 100)} %` : "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className="tabular text-[18px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={() => setSelected(null)} className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-muted hover:bg-fill sm:static" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </Card>
      ) : null}

      {/* Plan d'action */}
      {plan.length ? (
        <Card className="p-5 sm:p-6">
          <h3 className="text-[17px] font-semibold">Par où commencer</h3>
          <p className="text-[13px] text-muted">Les opportunités les plus affichées : c&apos;est là qu&apos;un petit effort rapporte le plus vite.</p>
          <ol className="mt-3 divide-y divide-border">
            {plan.map((q, i) => (
              <li key={q.q}>
                <button type="button" onClick={() => setSelected(q)} className="flex w-full items-center gap-3 py-2.5 text-left hover:opacity-80">
                  <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-fill text-[12px] font-semibold">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{q.q}</span>
                    <span className="block truncate text-[12px] text-muted first-letter:uppercase">{pageName(q.page)}</span>
                  </span>
                  <span className="tabular shrink-0 text-right text-[12px] text-muted">
                    <span className="block font-semibold text-text">#{nf(q.position)}</span>
                    {nf(q.impressions)} aff.
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {/* Infobulle */}
      {hover ? (
        <div className="pointer-events-none fixed z-50 max-w-[260px] rounded-[12px] bg-surface px-3 py-2 text-[12px] shadow-pop" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <p className="font-semibold">« {hover.q.q} »</p>
          <p className="tabular mt-0.5 text-muted">
            position {nf(hover.q.position)} · {nf(hover.q.impressions)} affichages · {nf(hover.q.clicks)} clics
          </p>
          <p className="mt-0.5 truncate text-faint first-letter:uppercase">{pageName(hover.q.page)}</p>
        </div>
      ) : null}
    </div>
  );
}
