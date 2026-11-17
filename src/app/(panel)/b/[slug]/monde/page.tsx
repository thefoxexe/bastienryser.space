import type { Metadata } from "next";
import { Globe2 } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { WorldExplorer } from "@/components/world/lazy";
import { getBusiness } from "@/lib/data";
import { businessWorld } from "@/lib/web-world";

export const metadata: Metadata = { title: "Monde" };

export default async function WorldPage({ params }: PageProps<"/b/[slug]/monde">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const world = await businessWorld(business);
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 pb-16 pt-6 sm:px-10 sm:pt-8">
      {world ? (
        <>
          <WorldExplorer world={world} />
          <p className="text-[12px] text-faint">
            Chiffres réels de la Search Console sur 90 jours ; pages lues dans le sitemap du site. Fais tourner la planète, zoome, survole ou touche une bulle pour ses chiffres.
          </p>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<Globe2 />}
            title="Pas encore de monde"
            description="Connecte la Search Console de ce site : sa planète se dessine au passage suivant."
            action={<ButtonLink href={`/b/${business.slug}/donnees/connecteurs`} size="sm">Connecter</ButtonLink>}
          />
        </Card>
      )}
    </div>
  );
}
