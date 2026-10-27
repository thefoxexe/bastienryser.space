"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Check, ChevronDown, Flag, Loader2, Plus, Trash2 } from "lucide-react";
import { formatDay } from "@/components/charts/format";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { ProjectTask, TaskStatus } from "@/lib/projects";
import { addTask, deleteTask, updateTask } from "../actions";

const NEXT: Record<TaskStatus, TaskStatus> = { todo: "doing", doing: "done", done: "todo" };
const STATUS: Record<TaskStatus, string> = { todo: "À faire", doing: "En cours", done: "Fait" };

/** Tâches d'un chantier : cocher, passer en cours, échéance, priorité, notes ; les terminées peuvent être masquées. */
export function TaskList({ projectId, slug, tasks, today }: { projectId: string; slug: string; tasks: ProjectTask[]; today: string }) {
  const [hideDone, setHideDone] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [, start] = useTransition();
  const [optimistic, apply] = useOptimistic(tasks, (list, patch: Partial<ProjectTask> & { id: string; remove?: boolean }) =>
    patch.remove ? list.filter((t) => t.id !== patch.id) : list.map((t) => (t.id === patch.id ? { ...t, ...patch } : t)),
  );
  const [state, action, pending] = useActionState(addTask, {});

  const change = (id: string, patch: Omit<Parameters<typeof updateTask>[0], "id" | "slug">) =>
    start(async () => {
      apply({ id, ...(patch.status ? { status: patch.status } : {}), ...(patch.priority ? { priority: patch.priority } : {}) });
      await updateTask({ ...patch, id, slug });
    });
  const remove = (id: string) =>
    start(async () => {
      apply({ id, remove: true });
      await deleteTask(id, slug);
    });

  const done = optimistic.filter((t) => t.status === "done").length;
  const visible = hideDone ? optimistic.filter((t) => t.status !== "done") : optimistic;
  // Ordre : en cours, à faire, puis faites.
  const order = { doing: 0, todo: 1, done: 2 } as const;
  const sorted = [...visible].sort((a, b) => order[a.status] - order[b.status] || a.position - b.position);

  return (
    <div className="flex flex-col">
      <form key={state.nonce ?? 0} action={action} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 px-5 pb-4 sm:grid-cols-[minmax(0,1fr)_150px_120px_auto] sm:px-6">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="slug" value={slug} />
        <Input name="title" placeholder="Nouvelle tâche…" required className="col-span-2 min-w-0 sm:col-span-1" aria-label="Nouvelle tâche" />
        <Input name="dueDate" type="date" className="min-w-0" aria-label="Échéance" />
        <Select name="priority" defaultValue="normal" className="min-w-0" aria-label="Priorité">
          <option value="low">Basse</option>
          <option value="normal">Normale</option>
          <option value="high">Haute</option>
        </Select>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Ajouter
        </Button>
        {state.error ? <p className="col-span-full text-[13px] text-danger">{state.error}</p> : null}
      </form>

      {sorted.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {sorted.map((t) => {
            const late = t.status !== "done" && t.due_date && t.due_date < today;
            const open = openId === t.id;
            return (
              <li key={t.id} className="group">
                <div className="flex items-center gap-3 px-5 py-2.5 sm:px-6">
                  <button
                    type="button"
                    onClick={() => change(t.id, { status: t.status === "done" ? "todo" : "done" })}
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border transition",
                      t.status === "done" ? "border-transparent bg-green text-black shadow-[0_0_8px_var(--green-glow)]" : "border-border-strong hover:border-text",
                    )}
                    aria-label={t.status === "done" ? `Rouvrir ${t.title}` : `Marquer ${t.title} comme faite`}
                  >
                    {t.status === "done" ? <Check className="size-3" strokeWidth={3} /> : null}
                  </button>
                  <button type="button" onClick={() => setOpenId(open ? null : t.id)} className="min-w-0 flex-1 text-left">
                    <span className={cn("block truncate text-[14px]", t.status === "done" && "text-muted line-through")}>{t.title}</span>
                    {t.notes && !open ? <span className="block truncate text-[12px] text-faint">{t.notes}</span> : null}
                  </button>
                  {t.priority === "high" ? <Flag className="size-3.5 shrink-0 text-danger" aria-label="Priorité haute" /> : null}
                  {t.due_date ? (
                    <span className={cn("hidden shrink-0 text-[12px] tabular sm:inline", late ? "font-medium text-danger" : "text-muted")}>{formatDay(t.due_date)}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => change(t.id, { status: NEXT[t.status] })}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-[12px] transition",
                      t.status === "doing" ? "bg-ink text-ink-text" : "bg-fill text-muted hover:text-text",
                    )}
                    title="Changer le statut"
                  >
                    {STATUS[t.status]}
                  </button>
                  <ChevronDown className={cn("size-4 shrink-0 text-faint transition", open && "rotate-180")} onClick={() => setOpenId(open ? null : t.id)} />
                </div>
                {open ? <TaskDetails task={t} slug={slug} onDelete={() => remove(t.id)} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-t border-border px-6 py-8 text-center text-[13px] text-muted">{optimistic.length ? "Toutes les tâches sont faites." : "Aucune tâche : ajoutes-en une ou importe un document."}</p>
      )}

      {done ? (
        <button type="button" onClick={() => setHideDone((h) => !h)} className="self-start px-5 py-3 text-[13px] text-muted hover:text-text sm:px-6">
          {hideDone ? `Afficher les ${done} tâche${done > 1 ? "s" : ""} faite${done > 1 ? "s" : ""}` : "Masquer les tâches faites"}
        </button>
      ) : null}
    </div>
  );
}

function TaskDetails({ task, slug, onDelete }: { task: ProjectTask; slug: string; onDelete: () => void }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="mx-5 mb-3 flex flex-col gap-2.5 rounded-[14px] bg-fill p-3.5 sm:mx-6"
      action={(data) =>
        start(async () => {
          await updateTask({
            id: task.id,
            slug,
            title: String(data.get("title")),
            notes: String(data.get("notes") ?? ""),
            dueDate: String(data.get("dueDate") ?? ""),
            priority: data.get("priority") as ProjectTask["priority"],
          });
          setSaved(true);
        })
      }
    >
      <Input name="title" defaultValue={task.title} aria-label="Titre" />
      <Textarea name="notes" rows={3} defaultValue={task.notes ?? ""} placeholder="Notes, détails, liens…" aria-label="Notes" />
      <div className="flex flex-wrap items-center gap-2">
        <Input name="dueDate" type="date" defaultValue={task.due_date ?? ""} className="w-[150px]" aria-label="Échéance" />
        <Select name="priority" defaultValue={task.priority} className="w-[120px]" aria-label="Priorité">
          <option value="low">Basse</option>
          <option value="normal">Normale</option>
          <option value="high">Haute</option>
        </Select>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Enregistrer
        </Button>
        {saved && !pending ? <span className="text-[12px] text-success">Enregistré</span> : null}
        <Button type="button" size="sm" variant="ghost" onClick={onDelete} className="ml-auto text-danger">
          <Trash2 /> Supprimer
        </Button>
      </div>
    </form>
  );
}
