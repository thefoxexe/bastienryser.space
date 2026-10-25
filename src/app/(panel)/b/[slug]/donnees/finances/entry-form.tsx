"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { addEntry, type EntryState } from "../actions";

const CATEGORIES = {
  income: ["Virement reçu", "Facture client", "Vente", "Abonnement", "Prestation", "Autre revenu"],
  expense: ["Virement envoyé", "Logiciels", "Publicité", "Matériel", "Sous-traitance", "Salaires", "Loyer", "Frais bancaires", "Remboursement client", "Impôts et taxes", "Autre charge"],
};

type Mode = "income" | "expense" | "transfer";
const MODES: { value: Mode; label: string }[] = [
  { value: "income", label: "Revenu" },
  { value: "expense", label: "Charge" },
  { value: "transfer", label: "Virement" },
];

/** Saisie rapide d'une facture encaissée, d'une charge ou d'un virement (reçu ou envoyé). */
export function EntryForm({ businessId, slug, today }: { businessId: string; slug: string; today: string }) {
  const [state, action, pending] = useActionState<EntryState, FormData>(addEntry, {});
  const [mode, setMode] = useState<Mode>("income");
  const [direction, setDirection] = useState<"income" | "expense">("income");
  // Un virement reste une entrée ou une sortie d'argent : seule sa catégorie le distingue.
  const kind = mode === "transfer" ? direction : mode;

  return (
    // La clé change après chaque ajout réussi : le formulaire se vide pour la saisie suivante.
    <form key={state.nonce ?? 0} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-3 gap-1 rounded-full bg-fill p-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={cn("rounded-full py-1.5 text-[13px] transition", mode === m.value ? "bg-surface font-medium shadow-card" : "text-muted hover:text-text")}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "transfer" ? (
        <div className="flex gap-4 px-1 text-[13px]">
          {(["income", "expense"] as const).map((d) => (
            <label key={d} className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name="direction" checked={direction === d} onChange={() => setDirection(d)} className="accent-[var(--text)]" />
              {d === "income" ? "Reçu (entrée)" : "Envoyé (sortie)"}
            </label>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-[1fr_140px] gap-2">
        <Input name="amount" inputMode="decimal" placeholder="Montant (CHF)" required aria-label="Montant en CHF" />
        <Input name="day" type="date" defaultValue={today} max={today} required aria-label="Date" />
      </div>
      <Input
        name="label"
        placeholder={mode === "transfer" ? (direction === "income" ? "Ex. Virement de WebAlp" : "Ex. Virement vers le compte privé") : kind === "income" ? "Ex. Site vitrine, client Dupont" : "Ex. Abonnement Figma"}
        required
        aria-label="Libellé"
      />
      {mode === "transfer" ? (
        <>
          <input type="hidden" name="category" value={direction === "income" ? "Virement reçu" : "Virement envoyé"} />
          <Input name="reference" placeholder="Référence du virement (facultatif)" aria-label="Référence du virement" />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Input name="category" list={`categories-${kind}`} placeholder="Catégorie" aria-label="Catégorie" />
          <Input name="reference" placeholder="N° de facture" aria-label="Numéro de facture" />
        </div>
      )}
      <datalist id={`categories-${kind}`}>
        {CATEGORIES[kind].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Ajouter
        </Button>
        {state.error ? (
          <span className="text-[13px] text-danger">{state.error}</span>
        ) : state.ok ? (
          <span className="flex items-center gap-1 text-[13px] text-success">
            <Check className="size-4" /> Ajouté
          </span>
        ) : null}
      </div>
    </form>
  );
}
