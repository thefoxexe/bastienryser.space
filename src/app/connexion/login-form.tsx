"use client";

import { useActionState } from "react";
import { Button, Field, FormError, Input } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ initialStep }: { initialStep: LoginState["step"] }) {
  const [state, action, pending] = useActionState(login, { step: initialStep });

  if (state.step === "totp") {
    return (
      <form action={action} className="flex flex-col gap-4">
        <p className="text-sm text-muted">Saisis le code à 6 chiffres de ton application d&apos;authentification.</p>
        <Field label="Code" htmlFor="code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            required
            autoFocus
          />
        </Field>
        <FormError message={state.error} />
        <Button type="submit" name="intent" value="totp" disabled={pending}>
          {pending ? "Vérification…" : "Valider"}
        </Button>
        <Button type="submit" name="intent" value="cancel" variant="secondary" formNoValidate disabled={pending}>
          Annuler
        </Button>
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
      <Button type="submit" name="intent" value="password" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
