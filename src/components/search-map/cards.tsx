import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { World } from "@/lib/web-world";
import { TierPack } from "./pack";
import { TIER_STYLE, TIERS, tierOf } from "./tiers";

const nf = (v: number) => new Intl.NumberFormat("fr-CH", { notation: v >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(v);

function Packs({ world, size }: { world: World; size: "sm" | "md" }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-5">
      {TIERS.map((t) => {
        const list = world.queries.filter((q) => tierOf(q) === t.id);
        return (
          <div key={t.id} className="flex min-w-0 flex-col items-center gap-1.5">
            <div className={cn("w-full", size === "sm" ? "max-w-[110px]" : "max-w-[170px]")}>
              <TierPack tier={t.id} queries={list} labels={size === "md"} max={size === "sm" ? 40 : 60} />
            </div>
            <p className="flex items-center gap-1.5 text-[12px]">
              <span className={cn("size-2 rounded-full", TIER_STYLE[t.id].dot)} />
              <span className="font-medium">{t.title}</span>
              <span className="tabular text-muted">{list.length}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Aperçu d'un business : ses recherches Google en trois groupes ; un clic ouvre la carte complète. */
export function SearchMapCard({ world }: { world: World }) {
  return (
    <Link href={`/b/${world.slug}/monde`} className="group block rounded-2xl outline-offset-4">
      <Card className="p-5 transition-[box-shadow,transform] duration-300 ease-[var(--ease-apple)] group-hover:shadow-pop group-active:scale-[0.99] sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold">Recherches Google</h2>
            <p className="text-[13px] text-muted">
              {nf(world.totals.queries)} recherches · {nf(world.totals.impressions)} affichages · {world.period}
            </p>
          </div>
          <span className="flex items-center gap-0.5 text-[13px] text-muted transition group-hover:text-text">
            Voir la carte <ChevronRight className="size-4" />
          </span>
        </div>
        <Packs world={world} size="md" />
      </Card>
    </Link>
  );
}

/** Accueil : chaque site et ses trois groupes de recherches, côte à côte. */
export function SitesSearchCard({ worlds }: { worlds: World[] }) {
  if (!worlds.length) return null;
  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-2 sm:p-6 sm:pb-2">
        <div>
          <h2 className="text-[17px] font-semibold">Tes sites sur Google</h2>
          <p className="text-[13px] text-muted">Forces (top 5), opportunités (6e à 20e place) et recherches hors de portée, sur 90 jours.</p>
        </div>
        <Link href="/monde" className="flex items-center gap-0.5 text-[13px] font-medium text-muted hover:text-text">
          Tout voir <ChevronRight className="size-4" />
        </Link>
      </div>
      <ul className="divide-y divide-border px-5 pb-2 sm:px-6">
        {worlds.map((w) => (
          <li key={w.slug}>
            <Link href={`/b/${w.slug}/monde`} className="grid items-center gap-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{w.name}</p>
                <p className="tabular text-[12px] text-muted">
                  {nf(w.totals.impressions)} affichages · {nf(w.totals.clicks)} clics
                </p>
              </div>
              <Packs world={w} size="sm" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
