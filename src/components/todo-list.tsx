"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Check, Flag } from "lucide-react";
import { updateTask } from "@/app/(panel)/b/[slug]/projets/actions";
import { formatDay } from "@/components/charts/format";
import { cn } from "@/components/ui/cn";
import type { OpenTask } from "@/lib/projects";

/** Libellé d'échéance lisible : « En retard · 25 oct. », « Aujourd'hui », « Demain », « 2 nov. ». */
function due(day: string | null, today: string) {
  if (!day) return null;
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (day < today) return { label: `En retard · ${formatDay(day)}`, late: true };
  if (day === today) return { label: "Aujourd'hui", late: false, soon: true };
  if (day === tomorrow.toISOString().slice(0, 10)) return { label: "Demain", late: false, soon: true };
  return { label: formatDay(day), late: false };
}

/** Tâches à faire de plusieurs projets : on coche directement ici, sans ouvrir le projet. */
export function TodoList({ tasks, today, showBusiness = true, empty = "Rien à faire pour l'instant." }: { tasks: OpenTask[]; today: string; showBusiness?: boolean; empty?: string }) {
  const [, start] = useTransition();
  const [list, remove] = useOptimistic(tasks, (all, id: string) => all.filter((t) => t.id !== id));

  if (!list.length) return <p className="px-5 py-6 text-center text-[13px] text-muted sm:px-6">{empty}</p>;

  return (
    <ul className="divide-y divide-border">
      {list.map((t) => {
        const d = due(t.due_date, today);
        return (
          <li key={t.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  remove(t.id);
                  await updateTask({ id: t.id, slug: t.business.slug, status: "done" });
                })
              }
              className="group grid size-[22px] shrink-0 place-items-center rounded-full border border-border-strong transition hover:border-green hover:bg-[color-mix(in_oklab,var(--green)_15%,transparent)]"
              aria-label={`Marquer « ${t.title} » comme faite`}
            >
              <Check className="size-3 text-green opacity-0 transition group-hover:opacity-100" strokeWidth={3} />
            </button>
            <Link href={`/b/${t.business.slug}/projets/${t.project.id}`} className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-medium">{t.title}</span>
                {t.priority === "high" ? <Flag className="size-3 shrink-0 text-danger" aria-label="Priorité haute" /> : null}
                {t.status === "doing" ? <span className="shrink-0 rounded-full bg-ink px-1.5 text-[10px] font-medium leading-4 text-ink-text">En cours</span> : null}
              </span>
              <span className="block truncate text-[12px] text-muted">
                {t.project.name}
                {showBusiness ? ` · ${t.business.name}` : ""}
              </span>
            </Link>
            {d ? (
              <span className={cn("shrink-0 text-[12px] tabular", d.late ? "font-medium text-danger" : d.soon ? "font-medium text-text" : "text-muted")}>{d.label}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
