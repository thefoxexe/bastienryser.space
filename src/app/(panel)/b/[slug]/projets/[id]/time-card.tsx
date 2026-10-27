"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Loader2, Play, Plus, Square, Trash2 } from "lucide-react";
import { formatDay, formatValue } from "@/components/charts/format";
import { Elapsed } from "@/components/elapsed";
import { Button, Input, Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { formatMinutes } from "@/lib/time";
import type { TimeEntry } from "@/lib/projects";
import { addTime, deleteTime, startTimer, stopTimer } from "../actions";

type Running = { id: string; started_at: string; project_id: string; project: string; slug: string } | null;

const zurichDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(iso));

/** Pointage des heures du projet : chrono, saisie manuelle, totaux et dernières sessions. */
export function TimeCard({
  projectId,
  slug,
  entries,
  tasks,
  running,
  hourlyRate,
  today,
  weekStart,
}: {
  projectId: string;
  slug: string;
  entries: TimeEntry[];
  tasks: { id: string; title: string }[];
  running: Running;
  hourlyRate: number | null;
  today: string;
  weekStart: string;
}) {
  const [pending, start] = useTransition();
  const [taskId, setTaskId] = useState("");
  const [note, setNote] = useState("");
  const [manual, setManual] = useState(false);
  const [all, setAll] = useState(false);
  const [state, action, saving] = useActionState(addTime, {});
  const [error, setError] = useState<string | null>(null);

  const here = running?.project_id === projectId;
  const done = entries.filter((e) => e.ended_at);
  const total = done.reduce((a, e) => a + e.minutes, 0);
  const week = done.filter((e) => zurichDay(e.started_at) >= weekStart).reduce((a, e) => a + e.minutes, 0);
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  const shown = all ? done : done.slice(0, 6);

  const go = () =>
    start(async () => {
      const res = await startTimer({ projectId, slug, taskId: taskId || null });
      setError(res.error ?? null);
    });
  const stop = () =>
    start(async () => {
      await stopTimer({ slug, note });
      setNote("");
    });

  return (
    <div className="flex flex-col gap-4 p-5 pt-3 sm:p-6 sm:pt-3">
      {here ? (
        <div className="flex flex-col gap-2.5 rounded-[16px] bg-[color-mix(in_oklab,var(--green)_10%,transparent)] p-3.5">
          <div className="flex items-center gap-3">
            <span className="dot-glow size-2 shrink-0 animate-pulse rounded-full" />
            <Elapsed since={running!.started_at} className="tabular flex-1 text-[24px] font-semibold tracking-tight" />
            <Button type="button" size="sm" onClick={stop} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Square className="fill-current" />} Arrêter
            </Button>
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce que tu as fait (facultatif)" aria-label="Note de la session" className="bg-surface" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {running ? (
            <p className="text-[12px] text-muted">
              Chrono en cours sur{" "}
              <Link href={`/b/${running.slug}/projets/${running.project_id}`} className="font-medium text-text hover:underline">
                {running.project}
              </Link>{" "}
              (<Elapsed since={running.started_at} className="tabular" />) : démarrer ici l&apos;arrête.
            </p>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Select value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label="Tâche (facultatif)" className="min-w-0">
              <option value="">Sans tâche précise</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
            <Button type="button" onClick={go} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Play className="fill-current" />} Démarrer
            </Button>
          </div>
        </div>
      )}
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Total", formatMinutes(total)],
          ["Cette semaine", formatMinutes(week)],
          [hourlyRate ? `Valeur · ${hourlyRate} CHF/h` : "Sessions", hourlyRate ? formatValue(Math.round((total / 60) * hourlyRate), { kind: "currency", currency: "chf" }, true) : String(done.length)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-[12px] bg-fill px-2 py-2.5">
            <dt className="truncate text-[11px] text-muted">{label}</dt>
            <dd className="tabular mt-0.5 truncate text-[15px] font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {manual ? (
        <form key={state.nonce ?? 0} action={action} className="grid grid-cols-2 gap-2 rounded-[14px] bg-fill p-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="slug" value={slug} />
          <Input name="day" type="date" defaultValue={today} max={today} required aria-label="Date" className="min-w-0 bg-surface" />
          <Input name="duration" required placeholder="Durée : 1:30" aria-label="Durée" className="min-w-0 bg-surface" />
          <Input name="note" placeholder="Ce que tu as fait" aria-label="Note" className="col-span-2 bg-surface" />
          {tasks.length ? (
            <Select name="taskId" defaultValue="" aria-label="Tâche" className="col-span-2 bg-surface">
              <option value="">Sans tâche précise</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="col-span-2 flex items-center gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null} Ajouter
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setManual(false)}>
              Fermer
            </Button>
            {state.error ? <span className="text-[12px] text-danger">{state.error}</span> : state.ok ? <span className="text-[12px] text-success">Ajouté</span> : null}
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setManual(true)} className="flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-text">
          <Plus className="size-4" /> Ajouter du temps à la main
        </button>
      )}

      {shown.length ? (
        <ul className="flex flex-col">
          {shown.map((e) => (
            <li key={e.id} className="group flex items-center gap-3 border-t border-border py-2 first:border-t-0">
              <span className="tabular w-12 shrink-0 text-[12px] text-muted">{formatDay(zurichDay(e.started_at))}</span>
              <span className={cn("min-w-0 flex-1 truncate text-[13px]", !e.note && !e.task_id && "text-faint")}>
                {e.note || (e.task_id ? taskTitle.get(e.task_id) : null) || "Session"}
              </span>
              <span className="tabular shrink-0 text-[13px] font-medium">{formatMinutes(e.minutes)}</span>
              <form action={deleteTime}>
                <input type="hidden" name="id" value={e.id} />
                <input type="hidden" name="slug" value={slug} />
                <button type="submit" className="grid size-7 place-items-center rounded-full text-faint hover:bg-fill hover:text-danger sm:opacity-0 sm:group-hover:opacity-100" aria-label="Supprimer la session">
                  <Trash2 className="size-3.5" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      {done.length > 6 ? (
        <button type="button" onClick={() => setAll((a) => !a)} className="self-start text-[13px] text-muted hover:text-text">
          {all ? "Réduire" : `Voir les ${done.length} sessions`}
        </button>
      ) : null}
    </div>
  );
}
