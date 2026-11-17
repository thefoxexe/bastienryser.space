import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import { PlanetMini, Universe } from "@/components/world/lazy";
import type { World } from "@/lib/web-world";

const nf = (v: number) => new Intl.NumberFormat("fr-CH", { notation: v >= 100000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(v);

/** Aperçu d'un business : son petit nuage de recherches qui tourne et ses chiffres Google ; un clic l'ouvre en grand. */
export function PlanetCard({ world }: { world: World }) {
  const href = `/b/${world.slug}/monde`;
  const t = world.totals;
  return (
    <Card className="grid overflow-hidden sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative h-[240px] bg-[#050607] sm:h-auto sm:min-h-[260px]">
        <PlanetMini world={world} href={href} />
      </div>
      <Link href={href} className="group flex flex-col justify-between gap-5 p-5 sm:p-6">
        <div>
          <p className="text-[13px] text-muted">Tes recherches Google · {world.period}</p>
          <h2 className="mt-0.5 text-[20px] font-semibold tracking-[-0.02em]">{world.domain}</h2>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          {[
            ["Affichages", nf(t.impressions)],
            ["Clics", nf(t.clicks)],
            ["Recherches", nf(t.queries)],
            ["Dans le top 10", nf(t.top10)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] text-muted">{k}</dt>
              <dd className="tabular font-[family-name:var(--font-display)] text-[24px] font-semibold leading-tight tracking-[-0.03em]">{v}</dd>
            </div>
          ))}
        </dl>
        <span className="flex items-center gap-0.5 text-[13px] font-medium text-muted transition group-hover:text-text">
          Explorer en 3D <ChevronRight className="size-4" />
        </span>
      </Link>
    </Card>
  );
}

/** Accueil : tous les sites en orbite, chacun son nuage ; un clic plonge dedans. */
export function UniverseCard({ worlds }: { worlds: World[] }) {
  if (!worlds.length) return null;
  const total = worlds.reduce((a, w) => a + w.totals.impressions, 0);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-3 sm:p-6 sm:pb-3">
        <div>
          <h2 className="text-[17px] font-semibold">Ton univers sur Google</h2>
          <p className="text-[13px] text-muted">
            {nf(total)} affichages sur 90 jours, {worlds.length} site{worlds.length > 1 ? "s" : ""}. Touche un nuage pour y plonger.
          </p>
        </div>
        <Link href="/monde" className="flex items-center gap-0.5 text-[13px] font-medium text-muted hover:text-text">
          Plein écran <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="mx-2 mb-2 h-[340px] overflow-hidden rounded-[16px] bg-[#050607] sm:h-[400px]">
        <Universe worlds={worlds} />
      </div>
    </Card>
  );
}
