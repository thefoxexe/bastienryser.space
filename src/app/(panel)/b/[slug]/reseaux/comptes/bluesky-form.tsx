"use client";

import { useActionState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { connectBluesky, type BlueskyState } from "../actions";

/** Connexion Bluesky : identifiant + mot de passe d'application (créé dans Bluesky, révocable à tout moment). */
export function BlueskyForm({ businessId, connected }: { businessId: string; connected: boolean }) {
  const [state, action, pending] = useActionState<BlueskyState, FormData>(connectBluesky, {});
  return (
    <form action={action} className="mx-5 mb-5 flex flex-col gap-2.5">
      <input type="hidden" name="businessId" value={businessId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="identifier" placeholder="pseudo.bsky.social" autoComplete="off" required aria-label="Identifiant Bluesky" />
        <Input name="password" type="password" placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" required aria-label="Mot de passe d'application" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={connected ? "secondary" : "primary"} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {connected ? "Reconnecter" : "Connecter"}
        </Button>
        {state.ok ? (
          <span className="flex items-center gap-1 text-[13px] text-success">
            <Check className="size-4" /> Compte connecté
          </span>
        ) : state.error ? (
          <span className="text-[13px] text-danger">{state.error}</span>
        ) : (
          <span className="text-[12px] text-faint">Bluesky › Réglages › Confidentialité et sécurité › Mots de passe d&apos;application.</span>
        )}
      </div>
    </form>
  );
}
