"use client";

import { useActionState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { addPayment, type PaymentState } from "./actions";

const METHODS = ["Virement", "TWINT", "Espèces", "Carte", "PayPal", "Stripe (lien de paiement)"];

/** « J'ai été payé » : montant, date, client, prestation. Rien à facturer ici, juste relever l'argent reçu. */
export function PaymentForm({ businessId, slug, today, clients }: { businessId: string; slug: string; today: string; clients: string[] }) {
  const [state, action, pending] = useActionState<PaymentState, FormData>(addPayment, {});
  return (
    // La clé change après chaque ajout réussi : le formulaire se vide pour le paiement suivant.
    <form key={state.nonce ?? 0} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <Input name="amount" inputMode="decimal" placeholder="Montant reçu" required aria-label="Montant reçu" autoFocus />
        <Select name="currency" defaultValue="chf" aria-label="Devise">
          <option value="chf">CHF</option>
          <option value="eur">EUR</option>
          <option value="usd">USD</option>
          <option value="gbp">GBP</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input name="day" type="date" defaultValue={today} max={today} required aria-label="Date du paiement" />
        <Input name="method" list="payment-methods" placeholder="Moyen (virement…)" aria-label="Moyen de paiement" />
      </div>
      <Input name="client" list="payment-clients" placeholder="Client" aria-label="Client" />
      <Input name="label" placeholder="Prestation (ex. site vitrine, tournage drone)" required aria-label="Prestation" />
      <Input name="reference" placeholder="N° de devis ou de facture (facultatif)" aria-label="Numéro de devis ou de facture" />
      <datalist id="payment-methods">
        {METHODS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="payment-clients">
        {clients.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Enregistrer le paiement
        </Button>
        {state.error ? (
          <span className="text-[13px] text-danger">{state.error}</span>
        ) : state.ok ? (
          <span className="flex items-center gap-1 text-[13px] text-success">
            <Check className="size-4" /> Enregistré
          </span>
        ) : null}
      </div>
    </form>
  );
}
