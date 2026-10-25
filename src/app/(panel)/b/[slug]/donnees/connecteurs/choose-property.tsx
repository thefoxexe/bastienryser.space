"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button, FormError, Select } from "@/components/ui";
import { configureConnector, type ConnectState } from "../actions";

export function ChooseProperty({
  connectorId,
  slug,
  options,
  label,
}: {
  connectorId: string;
  slug: string;
  options: { value: string; label: string }[];
  label: string;
}) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(configureConnector, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="connectorId" value={connectorId} />
      <input type="hidden" name="slug" value={slug} />
      <label htmlFor={`choice-${connectorId}`} className="px-0.5 text-[13px] font-medium">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select id={`choice-${connectorId}`} name="choice" required defaultValue="">
          <option value="" disabled>
            Choisir…
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? <Loader2 className="animate-spin" /> : null}
          Valider
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
