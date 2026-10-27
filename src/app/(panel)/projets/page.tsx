import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { BusinessMark } from "@/components/business-mark";
import { ProjectCard } from "@/components/project-card";
import { Page } from "@/components/shell/page";
import { TodoList } from "@/components/todo-list";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { listBusinesses } from "@/lib/data";
import { lastDays } from "@/lib/metrics";
import { listOpenTasks, listProjects } from "@/lib/projects";
import { NewProject } from "../b/[slug]/projets/new-project";

export const metadata: Metadata = { title: "Projets" };
// Lecture d'une longue séance par l'IA (Server Actions de la page).
export const maxDuration = 300;

/** Tous les projets et tout ce qu'il reste à faire, tous business confondus. */
export default async function AllProjectsPage() {
  const businesses = (await listBusinesses()).filter((b) => b.modules.includes("projects"));
  const [tasks, perBusiness] = await Promise.all([listOpenTasks({ limit: 60 }), Promise.all(businesses.map((b) => listProjects(b.id)))]);
  const today = lastDays(1)[0];
  const late = tasks.filter((t) => t.due_date && t.due_date < today).length;
  const groups = businesses.map((b, i) => ({ business: b, projects: perBusiness[i].filter((p) => p.status !== "done") })).filter((g) => g.projects.length);
  const choices = businesses.map((b) => ({ id: b.id, slug: b.slug, name: b.name }));

  return (
    <Page>
      <PageHeader
        title="Projets"
        description={
          tasks.length
            ? `${tasks.length} tâche${tasks.length > 1 ? "s" : ""} à faire${late ? `, dont ${late} en retard` : ""}.`
            : "Tes projets en cours et ce qu'il reste à faire."
        }
        actions={choices.length ? <NewProject businesses={choices} /> : null}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex min-w-0 flex-col gap-8">
          {groups.length ? (
            groups.map(({ business, projects }) => (
              <section key={business.id} className="flex flex-col gap-3">
                <Link href={`/b/${business.slug}/projets`} className="flex w-fit items-center gap-2 text-[15px] font-semibold tracking-tight hover:opacity-70">
                  <BusinessMark name={business.name} color={business.color} logoUrl={business.logo_url} size="sm" />
                  {business.name}
                </Link>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} href={`/b/${business.slug}/projets/${p.id}`} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <Card>
              <EmptyState icon={<FolderKanban />} title="Aucun projet en cours" description="Crée un projet pour un site, une campagne ou n'importe quel projet." />
            </Card>
          )}
        </div>

        <Card className="lg:sticky lg:top-6">
          <CardHeader title="À faire" description="Coche directement ici ; touche une tâche pour ouvrir son projet." />
          <div className="pt-2">
            <TodoList tasks={tasks} today={today} empty="Tout est fait. Belle journée." />
          </div>
        </Card>
      </div>
    </Page>
  );
}
