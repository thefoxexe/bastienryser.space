"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, Field, FormError, Input, Select, Textarea } from "@/components/ui";
import type { Project } from "@/lib/projects";
import { createProject, updateProject, type FormState } from "./actions";

/** Création ou modification d'un chantier. */
export function ProjectForm({ businessId, slug, project, onDone }: { businessId: string; slug: string; project?: Project; onDone?: () => void }) {
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const res = await (project ? updateProject : createProject)(prev, data);
    if (res.ok) onDone?.();
    return res;
  }, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="slug" value={slug} />
      {project ? <input type="hidden" name="id" value={project.id} /> : null}
      <Field label="Nom du chantier" htmlFor="p-name">
        <Input id="p-name" name="name" required defaultValue={project?.name} placeholder="Ex. Site tatatitatata.ch" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" htmlFor="p-client">
          <Input id="p-client" name="client" defaultValue={project?.client ?? ""} placeholder="Facultatif" />
        </Field>
        <Field label="Échéance" htmlFor="p-due">
          <Input id="p-due" name="dueDate" type="date" defaultValue={project?.due_date ?? ""} />
        </Field>
      </div>
      <Field label="Lien" htmlFor="p-url" hint="Site, maquette, dossier partagé…">
        <Input id="p-url" name="url" type="url" defaultValue={project?.url ?? ""} placeholder="https://" />
      </Field>
      <Field label="Description" htmlFor="p-desc">
        <Textarea id="p-desc" name="description" rows={3} defaultValue={project?.description ?? ""} placeholder="Objectif, périmètre, budget…" />
      </Field>
      {project ? (
        <Field label="Statut" htmlFor="p-status">
          <Select id="p-status" name="status" defaultValue={project.status}>
            <option value="active">En cours</option>
            <option value="paused">En pause</option>
            <option value="done">Terminé</option>
          </Select>
        </Field>
      ) : null}
      <FormError message={state.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {project ? "Enregistrer" : "Créer le chantier"}
        </Button>
        {state.ok ? (
          <span className="flex items-center gap-1 text-[13px] text-success">
            <Check className="size-4" /> Enregistré
          </span>
        ) : null}
      </div>
    </form>
  );
}
