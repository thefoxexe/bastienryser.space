"use client";

import { useActionState, useState, useTransition } from "react";
import { OtpInput } from "@/components/otp-input";
import { Button, FormError } from "@/components/ui";
import { confirmEnroll, startEnroll, type EnrollState } from "./actions";

export function TwoFactorSetup() {
  const [started, setStarted] = useState<EnrollState>({ status: "idle" });
  const [starting, startTransition] = useTransition();

  if (started.status !== "pending") {
    return (
      <div className="flex flex-col items-start gap-3">
        <FormError message={started.status === "idle" ? started.error : null} />
        <Button
          variant="brand"
          disabled={starting}
          onClick={() => startTransition(async () => setStarted(await startEnroll()))}
        >
          {starting ? "Préparation…" : "Activer la double authentification"}
        </Button>
      </div>
    );
  }

  return <ConfirmStep key={started.factorId} initial={started} />;
}

function ConfirmStep({ initial }: { initial: Extract<EnrollState, { status: "pending" }> }) {
  const [state, action, pending] = useActionState(confirmEnroll, initial);

  if (state.status === "done") {
    return <p className="text-sm text-success">Double authentification activée.</p>;
  }
  if (state.status !== "pending") return null;

  return (
    <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
      {/* QR code SVG fourni par Supabase, en data URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.qrCode} alt="QR code à scanner" width={180} height={180} className="rounded-2xl bg-white p-3 shadow-card" />
      <div className="flex flex-1 flex-col gap-3">
        <p className="text-sm text-muted">
          Scanne ce QR code avec ton application (1Password, Google Authenticator, Aegis…), puis saisis le code affiché.
        </p>
        <p className="text-xs text-muted">
          Clé manuelle : <code className="font-mono break-all text-text">{state.secret}</code>
        </p>
        <div className="max-w-[320px]">
          <OtpInput invalid={Boolean(state.error)} key={state.error ?? "otp"} />
        </div>
        <FormError message={state.error} />
        <Button type="submit" variant="brand" disabled={pending} className="self-start">
          {pending ? "Vérification…" : "Confirmer"}
        </Button>
      </div>
    </form>
  );
}
