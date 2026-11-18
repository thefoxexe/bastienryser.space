import type { Metadata } from "next";
import { SearchMap } from "@/components/search-map/search-map";
import { Page } from "@/components/shell/page";
import { PageHeader } from "@/components/ui";
import { listBusinesses } from "@/lib/data";
import { allWorlds } from "@/lib/web-world";

export const metadata: Metadata = { title: "Recherches Google" };

export default async function AllSearchMapsPage() {
  const worlds = await allWorlds(await listBusinesses());
  return (
    <Page>
      <PageHeader eyebrow="Google" title="Tes sites sur Google" description="Pour chaque site : ses forces, ses opportunités et ses recherches hors de portée, sur 90 jours." />
      {worlds.map((w) => (
        <section key={w.slug} className="flex flex-col gap-3">
          <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{w.name}</h2>
          <SearchMap world={w} />
        </section>
      ))}
    </Page>
  );
}
