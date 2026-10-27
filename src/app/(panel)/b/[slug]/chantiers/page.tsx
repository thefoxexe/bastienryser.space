import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, FolderKanban } from "lucide-react";
import { formatDay, formatValue } from "@/components/charts/format";
import { Badge, Card, EmptyState } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { getBusiness } from "@/lib/data";
import { listProjects, STATUS_LABEL, type ProjectSummary } from "@/lib/projects";
import { NewProject } from "./new-project";

export const metadata: Metadata = { title: "Chantiers" };

const TONE = { active: "success", paused: "warning", done: "neutral" } as const;

export default async function ProjectsPage({ params, searchParams }: PageProps<"/b/[slug]/chantiers">) {
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
          Un chantier regroupe ce qu&apos;il reste à faire, les fichiers et les factures d&apos;un projet. Importe un compte rendu (PDF, Word, texte) : l&apos;IA
          en tire les tâches.
        </p>
        <NewProject businessId={business.id} slug={business.slug} />
      </div>

      {shown.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} href={`/b/${business.slug}/chantiers/${p.id}`} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title={projects.length ? "Tous les chantiers sont terminés" : "Aucun chantier pour l'instant"}
            description="Crée un chantier pour un site, une campagne ou n'importe quel projet, puis ajoute ses tâches."
          />
        </Card>
      )}

      {done.length ? (
        <Link href={`/b/${business.slug}/chantiers${all ? "" : "?tous=1"}`} className="self-start text-[13px] text-muted hover:text-text">
          {all ? "Masquer les chantiers terminés" : `Voir les ${done.length} chantier${done.length > 1 ? "s" : ""} terminé${done.length > 1 ? "s" : ""}`}
        </Link>
      ) : null}
    </>
  );
}

function ProjectCard({ project: p, href }: { project: ProjectSummary; href: string }) {
  const pct = p.tasks.total ? Math.round((p.tasks.done / p.tasks.total) * 100) : 0;
  const net = p.money.income - p.money.expenses;
  return (
    <Link href={href} className={cn("group flex flex-col gap-4 rounded-[22px] bg-surface p-5 shadow-card transition hover:shadow-pop", p.status === "done" && "opacity-70")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-semibold tracking-tight">{p.name}</h3>
          <p className="truncate text-[13px] text-muted">{p.client ?? (p.url ? p.url.replace(/^https?:\/\//, "") : "Sans client")}</p>
        </div>
        <Badge tone={TONE[p.status]} dot>
          {STATUS_LABEL[p.status]}
        </Badge>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-[12px] text-muted">
          <span>
            {p.tasks.done}/{p.tasks.total} tâche{p.tasks.total > 1 ? "s" : ""}
          </span>
          <span className="tabular">{pct} %</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-fill-strong">
          <span className="block h-full rounded-full bg-green shadow-[0_0_8px_var(--green-glow)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-1 text-[13px]">
        {p.tasks.next ? (
          <span className="truncate">
            <span className="text-muted">Prochaine : </span>
            {p.tasks.next.title}
          </span>
        ) : (
          <span className="text-muted">{p.tasks.total ? "Tout est fait." : "Aucune tâche."}</span>
        )}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {p.due_date ? (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5" /> {formatDay(p.due_date)}
            </span>
          ) : null}
          {p.tasks.late ? <span className="text-danger">{p.tasks.late} en retard</span> : null}
          {p.money.income || p.money.expenses ? (
            <span className={cn("tabular", net > 0 ? "text-green-text" : net < 0 ? "text-danger" : "")}>
              {net >= 0 ? "+" : "−"}
              {formatValue(Math.abs(net), { kind: "currency", currency: "chf" })}
            </span>
          ) : null}
        </span>
      </div>
    </Link>
  );
}
