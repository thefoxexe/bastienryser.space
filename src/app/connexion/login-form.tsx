"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ initialStep }: { initialStep: LoginState["step"] }) {
  const [state, action, pending] = useActionState(login, { step: initialStep });

  if (state.step === "totp") {
    return (
      <form action={action} className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-muted">
            <KeyRound className="size-4" />
          </span>
          <p className="text-sm text-muted">Saisis le code à 6 chiffres de ton application d&apos;authentification.</p>
        </div>
        <Field label="Code" htmlFor="code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            required
            autoFocus
            className="h-12 text-center font-mono text-lg tracking-[0.4em]"
            placeholder="000000"
          />
        </Field>
        <FormError message={state.error} />
        <div className="flex flex-col gap-2">
          <Button type="submit" name="intent" value="totp" variant="brand" disabled={pending} className="h-11">
            {pending ? "Vérification…" : "Valider"}
          </Button>
          <Button type="submit" name="intent" value="cancel" variant="ghost" formNoValidate disabled={pending}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="E-mail" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email}
          required
          autoFocus
        />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormError message={state.error} />
      <Button type="submit" name="intent" value="password" variant="brand" disabled={pending} className="mt-1 h-11">
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
