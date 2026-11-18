import type { Metadata } from "next";
import { Globe2 } from "lucide-react";
import { SearchMap } from "@/components/search-map/search-map";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { businessWorld } from "@/lib/web-world";

export const metadata: Metadata = { title: "Carte des recherches" };

export default async function SearchMapPage({ params }: PageProps<"/b/[slug]/monde">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const world = await businessWorld(business);
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pb-16 pt-6 sm:px-10 sm:pt-8">
      {world ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[13px] text-muted">Recherches Google · {world.period}</p>
              <h2 className="text-[24px] font-semibold tracking-[-0.02em]">{world.domain}</h2>
            </div>
            <dl className="grid grid-cols-4 gap-x-6 text-right">
              {[
                ["Affichages", world.totals.impressions],
                ["Clics", world.totals.clicks],
                ["Recherches", world.totals.queries],
                ["Top 10", world.totals.top10],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-muted">{k}</dt>
                  <dd className="tabular text-[18px] font-semibold">{Number(v).toLocaleString("fr-CH")}</dd>
                </div>
              ))}
            </dl>
          </div>
          <SearchMap world={world} />
          <p className="text-[12px] text-faint">
            Chiffres réels de la Search Console sur 90 jours. Taille d&apos;une bulle = nombre d&apos;affichages ; touche une bulle pour sa fiche et le conseil.
          </p>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<Globe2 />}
            title="Pas encore de recherches"
            description="Connecte la Search Console de ce site : la carte se remplit au passage suivant."
            action={<ButtonLink href={`/b/${business.slug}/donnees/connecteurs`} size="sm">Connecter</ButtonLink>}
          />
        </Card>
      )}
    </div>
  );
}
