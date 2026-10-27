import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CalendarClock, ChevronLeft, Link2Off, Plus, Sparkles, Trash2 } from "lucide-react";
import { formatDay, formatValue } from "@/components/charts/format";
import { Badge, Button, Card, CardHeader, Select } from "@/components/ui";
import { DialogButton } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { getBusiness } from "@/lib/data";
import { lastDays } from "@/lib/metrics";
import { getProject, STATUS_LABEL } from "@/lib/projects";
import { EntryForm } from "../../donnees/finances/entry-form";
import { deleteProject, linkEntry, unlinkEntry } from "../actions";
import { AiImport } from "./ai-import";
import { EditProject } from "./edit-project";
import { FilesCard } from "./files-card";
import { TaskList } from "./task-list";

export const metadata: Metadata = { title: "Chantier" };
// Lecture d'une longue séance par l'IA (Server Actions de la page).
export const maxDuration = 300;

const TONE = { active: "success", paused: "warning", done: "neutral" } as const;
const chf = { kind: "currency", currency: "chf" } as const;

export default async function ProjectPage({ params }: PageProps<"/b/[slug]/chantiers/[id]">) {
  const { slug, id } = await params;
  const business = await getBusiness(slug);
  const data = await getProject(business.id, id);
  if (!data) notFound();
  const { project, tasks, files, entries, unlinked } = data;
  const today = lastDays(1)[0];
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const late = tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today).length;
  const income = entries.filter((e) => e.kind === "income").reduce((a, e) => a + e.amount, 0);
  const expenses = entries.filter((e) => e.kind === "expense").reduce((a, e) => a + e.amount, 0);

  return (
    <>
      <Link href={`/b/${business.slug}/chantiers`} className="-mb-2 flex w-fit items-center gap-1 text-[13px] text-muted hover:text-text">
        <ChevronLeft className="size-4" /> Chantiers
      </Link>

      <section className="rounded-[22px] bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">{project.name}</h2>
              <Badge tone={TONE[project.status]} dot>
                {STATUS_LABEL[project.status]}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              {project.client ? <span>{project.client}</span> : null}
              {project.url ? (
                <a href={project.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 hover:text-text">
                  {project.url.replace(/^https?:\/\//, "")} <ArrowUpRight className="size-3" />
                </a>
              ) : null}
              {project.due_date ? (
                <span className={cn("inline-flex items-center gap-1", project.status !== "done" && project.due_date < today && "text-danger")}>
                  <CalendarClock className="size-3.5" /> {formatDay(project.due_date)}
                </span>
              ) : null}
            </div>
            {project.description ? <p className="mt-3 max-w-3xl whitespace-pre-line text-[14px] leading-relaxed text-text/85">{project.description}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <DialogButton
              size="sm"
              label={
                <>
                  <Sparkles /> Importer un compte rendu
                </>
              }
              title="Importer une séance ou un compte rendu"
              description="La transcription TurboScribe telle quelle, un PDF, un Word ou un texte collé : l'IA propose les tâches et un compte rendu."
            >
              <AiImport projectId={project.id} slug={business.slug} />
            </DialogButton>
            <EditProject businessId={business.id} slug={business.slug} project={project} />
            <form action={deleteProject}>
              <input type="hidden" name="id" value={project.id} />
              <input type="hidden" name="slug" value={business.slug} />
              <Button type="submit" size="icon" variant="ghost" title="Supprimer le chantier" aria-label="Supprimer le chantier">
                <Trash2 />
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="mb-1.5 flex justify-between text-[12px] text-muted">
              <span>Avancement</span>
              <span className="tabular">
                {done}/{tasks.length} · {pct} %
              </span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-fill-strong">
              <span className="block h-full rounded-full bg-green shadow-[0_0_8px_var(--green-glow)]" style={{ width: `${pct}%` }} />
            </div>
            {late ? <p className="mt-1.5 text-[12px] text-danger">{late} tâche{late > 1 ? "s" : ""} en retard</p> : null}
          </div>
          <div>
            <p className="text-[12px] text-muted">Encaissé</p>
            <p className="tabular text-[17px] font-semibold">{formatValue(income, chf)}</p>
          </div>
          <div>
            <p className="text-[12px] text-muted">Résultat du chantier</p>
            <p className={cn("tabular text-[17px] font-semibold", income - expenses > 0 ? "text-green-text" : income - expenses < 0 ? "text-danger" : "")}>
              {formatValue(income - expenses, chf)}
            </p>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Tâches" description="Coche ce qui est fait ; touche une tâche pour ses notes, son échéance et sa priorité." />
          <div className="pt-4">
            <TaskList projectId={project.id} slug={business.slug} tasks={tasks} today={today} />
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader
              title="Finances"
              action={
                <DialogButton size="sm" variant="secondary" label={<><Plus /> Écriture</>} title="Nouvelle écriture" description="Facture, charge ou virement, rattaché à ce chantier.">
                  <EntryForm businessId={business.id} slug={business.slug} today={today} projectId={project.id} />
                </DialogButton>
              }
            />
            <div className="flex flex-col gap-3 p-5 pt-3 sm:p-6 sm:pt-3">
              {entries.length ? (
                <ul className="flex flex-col">
                  {entries.map((e) => (
                    <li key={e.id} className="group flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{e.label}</span>
                        <span className="block text-[12px] text-muted">
                          {formatDay(e.day)}
                          {e.reference ? ` · n° ${e.reference}` : ""}
                        </span>
                      </span>
                      <span className={cn("tabular shrink-0 text-[14px] font-medium", e.kind === "income" ? "text-green-text" : "text-muted")}>
                        {e.kind === "income" ? "+" : "−"}
                        {formatValue(e.amount, { kind: "currency", currency: e.currency })}
                      </span>
                      <form action={unlinkEntry}>
                        <input type="hidden" name="entryId" value={e.id} />
                        <input type="hidden" name="slug" value={business.slug} />
                        <button type="submit" title="Détacher du chantier" aria-label={`Détacher ${e.label}`} className="grid size-7 place-items-center rounded-full text-faint hover:bg-fill hover:text-text sm:opacity-0 sm:group-hover:opacity-100">
                          <Link2Off className="size-3.5" />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">Aucune facture ni charge liée.</p>
              )}
              {unlinked.length ? (
                <form action={linkEntry} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="slug" value={business.slug} />
                  <Select name="entryId" className="w-full min-w-0" aria-label="Écriture à lier" defaultValue="">
                    <option value="" disabled>
                      Lier une écriture existante…
                    </option>
                    {unlinked.map((e) => (
                      <option key={e.id} value={e.id}>
                        {formatDay(e.day)} · {e.label} · {e.kind === "income" ? "+" : "−"}
                        {formatValue(e.amount, { kind: "currency", currency: e.currency })}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="secondary">
                    Lier
                  </Button>
                </form>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Fichiers" />
            <div className="pt-3">
              <FilesCard projectId={project.id} slug={business.slug} files={files} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
