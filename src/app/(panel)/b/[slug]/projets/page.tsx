import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import { Card, EmptyState } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { listProjects } from "@/lib/projects";
import { NewProject } from "./new-project";

export const metadata: Metadata = { title: "Projets" };
// Lecture d'une longue séance par l'IA (Server Actions de la page).
export const maxDuration = 300;


export default async function ProjectsPage({ params, searchParams }: PageProps<"/b/[slug]/projets">) {
  const { slug } = await params;
  const all = (await searchParams).tous === "1";
  const business = await getBusiness(slug);
  const projects = await listProjects(business.id);
  const open = projects.filter((p) => p.status !== "done");
  const done = projects.filter((p) => p.status === "done");
  const shown = all ? projects : open;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted">
          Un projet regroupe ce qu&apos;il reste à faire, les fichiers et les factures d&apos;un projet. Importe un compte rendu (PDF, Word, texte) : l&apos;IA
          en tire les tâches.
        </p>
        <NewProject businessId={business.id} slug={business.slug} />
      </div>

      {shown.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} href={`/b/${business.slug}/projets/${p.id}`} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title={projects.length ? "Tous les projets sont terminés" : "Aucun projet pour l'instant"}
            description="Crée un projet pour un site, une campagne ou n'importe quel projet, puis ajoute ses tâches."
          />
        </Card>
      )}

      {done.length ? (
        <Link href={`/b/${business.slug}/projets${all ? "" : "?tous=1"}`} className="self-start text-[13px] text-muted hover:text-text">
          {all ? "Masquer les projets terminés" : `Voir les ${done.length} projet${done.length > 1 ? "s" : ""} terminé${done.length > 1 ? "s" : ""}`}
        </Link>
      ) : null}
    </>
  );
}
