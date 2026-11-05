"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { Button, FormError, FormSuccess, Input, Textarea } from "@/components/ui";
import type { VeilleSettings } from "@/lib/veille";
import { addSource, generateRunnerSecret, queueLink, saveSettings } from "./actions";

export function AddSourceForm({ businessId, slug }: { businessId: string; slug: string }) {
  const [state, action, pending] = useActionState(addSource, {});
  return (
    <form key={state.nonce ?? 0} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex gap-2">
        <Input name="handle" required placeholder="@compte ou lien du profil TikTok" aria-label="Compte TikTok" className="min-w-0" />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Ajouter
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

export function QueueLinkForm({ businessId, slug }: { businessId: string; slug: string }) {
  const [state, action, pending] = useActionState(queueLink, {});
  return (
    <form key={state.nonce ?? 0} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex gap-2">
        <Input name="url" type="url" required placeholder="https://vm.tiktok.com/…" aria-label="Lien TikTok" className="min-w-0" />
        <Button type="submit" variant="secondary" disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="animate-spin" /> : null} Traiter
        </Button>
      </div>
      <FormError message={state.error} />
      {state.ok ? <FormSuccess message="Ajouté : traité au prochain passage (dans l'heure)." /> : null}
    </form>
  );
}

export function SettingsForm({ businessId, slug, settings }: { businessId: string; slug: string; settings: VeilleSettings }) {
  const [state, action, pending] = useActionState(saveSettings, {});
  return (
    <form action={action} className="flex flex-col gap-3 p-5 pt-4 sm:p-6 sm:pt-4">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="slug" value={slug} />
      <label htmlFor="v-filter" className="text-[13px] font-medium">
        Filtre
      </label>
      <Textarea
        id="v-filter"
        name="filter"
        defaultValue={settings.filter}
        maxLength={1000}
        className="min-h-20"
        placeholder="Seulement les vidéos Géopolitique et Info / actualité. Ignorer Trading, Technique et Formation."
      />
      <p className="-mt-1 text-[12px] text-muted">
        La catégorie est lue dans le bandeau en haut de chaque vidéo. Une vidéo écartée n&apos;est ni retranscrite ni envoyée. Vide = tout est envoyé.
      </p>
      <label htmlFor="v-instructions" className="mt-1 text-[13px] font-medium">
        Consignes de rédaction
      </label>
      <Textarea
        id="v-instructions"
        name="instructions"
        defaultValue={settings.instructions}
        maxLength={2000}
        className="min-h-24"
        aria-label="Consignes de rédaction"
        placeholder="Ex. : tutoie le groupe, termine par une question, insiste sur ce que ça change pour le bitcoin…"
      />
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="disclaimer" defaultChecked={settings.disclaimer} className="accent-[var(--accent)]" /> Ajouter « Information, pas un conseil en investissement. »
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="accent-[var(--accent)]" /> Veille active (décocher pour la mettre en pause)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Enregistrer
        </Button>
        <FormError message={state.error} />
        {state.ok ? <FormSuccess message="Enregistré." /> : null}
      </div>
    </form>
  );
}

/** Clé que la tâche GitHub présente à l'Edge Function : affichée une seule fois, à coller dans les secrets du dépôt. */
export function RunnerSecret({ slug, configured }: { slug: string; configured: boolean }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const generate = () =>
    start(async () => {
      if (configured && !confirm("Une clé existe déjà : la remplacer ? Il faudra aussi la changer dans GitHub.")) return;
      const res = await generateRunnerSecret(slug);
      setError(res.error ?? null);
      setSecret(res.secret ?? null);
      setCopied(false);
    });
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={generate} disabled={pending} className="self-start">
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} {configured ? "Générer une nouvelle clé" : "Générer la clé"}
      </Button>
      {secret ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-fill p-3">
          <p className="text-[12px] text-muted">Copie-la maintenant, elle ne sera plus affichée :</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[10px] bg-surface px-3 py-2 text-[12px]">{secret}</code>
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              }}
            >
              <Copy /> {copied ? "Copiée" : "Copier"}
            </Button>
          </div>
        </div>
      ) : null}
      <FormError message={error} />
    </div>
  );
}
