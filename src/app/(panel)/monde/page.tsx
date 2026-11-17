import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui";
import { Universe } from "@/components/world/lazy";
import { listBusinesses } from "@/lib/data";
import { allWorlds } from "@/lib/web-world";

export const metadata: Metadata = { title: "Univers" };

export default async function UniversePage() {
  const worlds = await allWorlds(await listBusinesses());
  return (
    <Page>
      <PageHeader eyebrow="Google" title="Ton univers" description="Chaque site est un nuage de ses recherches Google, à sa taille réelle (affichages des 90 derniers jours). Touche un nuage pour y plonger." />
      <div className="h-[calc(100dvh-260px)] min-h-[480px] overflow-hidden rounded-[22px] bg-[#050607]">
        <Universe worlds={worlds} full />
      </div>
      <div className="flex flex-wrap gap-2">
        {worlds.map((w) => (
          <Link key={w.slug} href={`/b/${w.slug}/monde`} className="rounded-full bg-fill px-3.5 py-1.5 text-[13px] font-medium hover:bg-fill-strong">
            {w.name}
          </Link>
        ))}
      </div>
    </Page>
  );
}
