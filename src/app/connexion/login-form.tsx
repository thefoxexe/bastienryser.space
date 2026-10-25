"use client";

import { useActionState, useRef } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { OtpInput } from "@/components/otp-input";
import { cn } from "@/components/ui/cn";
import { login, type LoginState } from "./actions";

export function LoginForm({ initialStep }: { initialStep: LoginState["step"] }) {
  const [state, action, pending] = useActionState(login, { step: initialStep });
  const totpForm = useRef<HTMLFormElement>(null);

  if (state.step === "totp") {
    return (
      <form ref={totpForm} action={action} className="flex flex-col gap-6">
        <input type="hidden" name="intent" value="totp" />
        <p className="text-center text-[15px] leading-relaxed text-muted">
          Saisis le code à 6 chiffres
          <br />
          de ton application d&apos;authentification.
        </p>
        <OtpInput key={state.error ?? "otp"} autoFocus disabled={pending} invalid={Boolean(state.error)} onComplete={() => totpForm.current?.requestSubmit()} />
        <div className="flex h-5 items-center justify-center">
          {pending ? (
            <Loader2 className="size-4 animate-spin text-muted" />
          ) : state.error ? (
            <p role="alert" className="text-[13px] text-danger">
              {state.error}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          formNoValidate
          onClick={(e) => {
            // « Annuler » : on remplace l'intention avant l'envoi.
            const form = e.currentTarget.form!;
            (form.elements.namedItem("intent") as HTMLInputElement).value = "cancel";
          }}
          className="mx-auto text-[13px] text-muted transition hover:text-text"
        >
          Utiliser un autre compte
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="password" />
      <div className="overflow-hidden rounded-2xl bg-surface shadow-[0_0_0_0.5px_var(--border-strong),0_1px_2px_rgb(0_0_0/0.04)] transition-shadow focus-within:shadow-[0_0_0_1px_color-mix(in_oklab,var(--text)_40%,transparent),0_0_0_5px_color-mix(in_oklab,var(--text)_7%,transparent)]">
        <FloatingField id="email" name="email" type="email" label="E-mail" autoComplete="username" defaultValue={state.email} autoFocus />
        <div className="mx-4 h-px bg-border" />
        <div className="relative">
          <FloatingField id="password" name="password" type="password" label="Mot de passe" autoComplete="current-password" className="pr-14" />
          <button
            type="submit"
            disabled={pending}
            aria-label="Se connecter"
            className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-ink text-ink-text transition hover:opacity-85 active:scale-95 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          </button>
        </div>
      </div>
      <div className="flex h-5 items-center justify-center">
        {state.error ? (
          <p role="alert" className="text-[13px] text-danger">
            {state.error}
          </p>
        ) : (
          <p className="text-[12px] text-faint">Ensuite, le code à 6 chiffres de ton application.</p>
        )}
      </div>
    </form>
  );
}

function FloatingField({
  id,
  label,
  className,
  defaultValue,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        required
        defaultValue={defaultValue}
        placeholder=" "
        className={cn("peer h-[60px] w-full bg-transparent px-4 pb-2 pt-6 text-[16px] text-text outline-none", className)}
        {...props}
      />
      <label
        htmlFor={id}
        className={cn(
          "pointer-events-none absolute left-4 text-muted transition-all duration-200 ease-[var(--ease-apple)]",
          // Petite étiquette en haut dès que le champ est rempli (y compris par le remplissage automatique) ou actif.
          "top-2.5 text-[12px]",
          "peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-[16px]",
          "peer-focus:top-2.5 peer-focus:translate-y-0 peer-focus:text-[12px]",
        )}
      >
        {label}
      </label>
    </div>
  );
}
