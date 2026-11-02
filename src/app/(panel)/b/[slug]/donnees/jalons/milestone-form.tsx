"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button, Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui";
import { addMilestone } from "../actions";

const KINDS = [
  ["seo", "SEO (titres, balises, structure)"],
  ["contenu", "Contenu (pages, articles)"],
  ["technique", "Technique (vitesse, redirections, site)"],
  ["campagne", "Campagne (pub, réseaux, newsletter)"],
  ["autre", "Autre"],
] as const;

/** Ajout d'un jalon : la date du jour par défaut, modifiable pour noter un changement passé. */
export function MilestoneForm({ businessId, slug, today }: { businessId: string; slug: string; today: string }) {
  const [state, action, pending] = useActionState(addMilestone, {});
  return (
    <form key={state.nonce ?? 0} action={action} className="grid gap-4 p-5 pt-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:p-6 sm:pt-4">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="slug" value={slug} />
      <Field label="Date" htmlFor="m-day">
        <Input id="m-day" name="day" type="date" defaultValue={today} max={today} required />
      </Field>
      <Field label="Ce que tu as changé" htmlFor="m-title">
        <Input id="m-title" name="title" required maxLength={120} placeholder="Nouveaux titres et descriptions sur l'accueil" />
      </Field>
      <Field label="Type" htmlFor="m-kind">
        <Select id="m-kind" name="kind" defaultValue="seo">
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Détails (facultatif)" htmlFor="m-note" hint="Pages touchées, ce que tu espères voir bouger : utile pour relire dans un mois.">
        <Textarea id="m-note" name="note" maxLength={2000} className="min-h-20" placeholder="Pages /tarifs et /fonctionnalités, mot-clé visé : logiciel gestion chantier suisse" />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-start-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Ajouter le jalon
        </Button>
        <FormError message={state.error} />
        {state.ok ? <FormSuccess message="Jalon ajouté : il apparaît sur tous les graphiques." /> : null}
      </div>
    </form>
  );
}
