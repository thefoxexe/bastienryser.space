"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { connectConnector, type ConnectState } from "../actions";

export function ConnectorForm({
  kind,
  businessId,
  slug,
  defaultSiteId,
  reconnect,
}: {
  kind: "stripe" | "plausible";
  businessId: string;
  slug: string;
  defaultSiteId?: string;
  reconnect?: boolean;
}) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectConnector, {});
  const [open, setOpen] = useState(!reconnect);

  if (state.ok) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-success">
        <Check className="size-4" /> Connecté{state.warning ? ` · ${state.warning}` : " · premiers chiffres importés"}
      </p>
    );
  }
  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Remplacer la clé
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="slug" value={slug} />
      {kind === "plausible" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Domaine dans Plausible" htmlFor={`${kind}-site`}>
            <Input id={`${kind}-site`} name="siteId" defaultValue={defaultSiteId} placeholder="cantia.ch" required autoComplete="off" />
          </Field>
          <Field label="Instance" htmlFor={`${kind}-base`} hint="À changer seulement si Plausible est auto-hébergé.">
            <Input id={`${kind}-base`} name="baseUrl" defaultValue="https://plausible.io" autoComplete="off" />
          </Field>
        </div>
      ) : null}
      <Field
        label={kind === "stripe" ? "Clé restreinte Stripe" : "Clé d'API Plausible"}
        htmlFor={`${kind}-key`}
        hint="Testée puis chiffrée dans le coffre de la base. Elle n'est plus jamais affichée."
      >
        <Input
          id={`${kind}-key`}
          name="apiKey"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          placeholder={kind === "stripe" ? "rk_live_…" : "Clé Stats API"}
          className="font-mono text-[13px]"
        />
      </Field>
      <FormError message={state.error} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Test de la connexion…" : reconnect ? "Mettre à jour" : "Connecter"}
        </Button>
      </div>
    </form>
  );
}
