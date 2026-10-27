"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { BusinessMark } from "@/components/business-mark";
import { Button, ButtonLink, Card, Field, FormError, Input, Textarea } from "@/components/ui";
import type { BusinessWithLogo } from "@/lib/types";
import { findLogo, saveBusiness, type BusinessFormState } from "./actions";


function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function BusinessForm({ business }: { business?: BusinessWithLogo }) {
  const [state, action, pending] = useActionState<BusinessFormState, FormData>(saveBusiness, {});
  const [name, setName] = useState(business?.name ?? "");
  const [slug, setSlug] = useState(business?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(business));
  const [logoPreview, setLogoPreview] = useState<string | null>(business?.logo_url ?? null);
  const [foundUrl, setFoundUrl] = useState("");
  const [logoNote, setLogoNote] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const websitesRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fe = state.fieldErrors ?? {};

  function searchLogo() {
    setLogoNote(null);
    startSearch(async () => {
      const res = await findLogo(websitesRef.current?.value ?? "");
      if (res.url) {
        setFoundUrl(res.url);
        setLogoPreview(res.url);
        if (fileRef.current) fileRef.current.value = "";
        setLogoNote(`Logo trouvé sur ${res.site}. Il sera enregistré avec le business.`);
      } else setLogoNote(res.error ?? "Aucun logo trouvé.");
    });
  }

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card className="p-5 sm:p-6">
        <input type="hidden" name="id" value={business?.id ?? ""} />
        <div className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nom" htmlFor="name" hint={fe.name}>
              <Input
                id="name"
                name="name"
                value={name}
                required
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </Field>
            <Field label="Adresse dans le panel" htmlFor="slug" hint={fe.slug ?? `/b/${slug || "…"}`}>
              <Input
                id="slug"
                name="slug"
                value={slug}
                required
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="description" hint={fe.description}>
            <Input id="description" name="description" defaultValue={business?.description ?? ""} placeholder="Une ligne pour s'y retrouver" />
          </Field>
          <Field label="Sites web" htmlFor="websites" hint={fe.websites ?? "Un par ligne."}>
            <Textarea ref={websitesRef} id="websites" name="websites" defaultValue={business?.websites.join("\n") ?? ""} className="min-h-24 font-mono text-[13px]" />
          </Field>

          <input type="hidden" name="color" value={business?.color ?? "#1d1d1f"} />

          <Field
            label="Logo"
            htmlFor="logo"
            hint={
              fe.logo ??
              logoNote ??
              (business ? "Trouvé sur le site, ou ton fichier (PNG, JPEG, WebP, SVG, 3 Mo max)." : "Sans fichier, il est cherché tout seul sur le premier site à la création.")
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                ref={fileRef}
                id="logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="min-w-0 flex-1 py-1.5 file:mr-3 file:h-7 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:text-[13px] file:text-text"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setLogoPreview(URL.createObjectURL(f));
                    setFoundUrl("");
                    setLogoNote(null);
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={searchLogo} disabled={searching} className="h-10">
                <Sparkles className="size-4" /> {searching ? "Recherche…" : "Trouver depuis le site"}
              </Button>
            </div>
            <input type="hidden" name="logoUrl" value={foundUrl} />
          </Field>
          {business?.logo_url ? (
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" name="removeLogo" className="accent-[var(--accent)]" /> Retirer le logo actuel
            </label>
          ) : null}

          <div className="rounded-[14px] bg-fill p-4">
            <span className="text-[13px] font-medium">Modules</span>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input type="checkbox" name="social" defaultChecked={business ? business.modules.includes("social") : true} className="mt-0.5 accent-[var(--accent)]" />
              <span>
                Réseaux sociaux
                <span className="block text-[13px] text-muted">Publication multi-réseaux, calendrier et statistiques.</span>
              </span>
            </label>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input type="checkbox" name="data" defaultChecked={business ? business.modules.includes("data") : true} className="mt-0.5 accent-[var(--accent)]" />
              <span>
                Données
                <span className="block text-[13px] text-muted">Surveillance des sites, visiteurs (Plausible) et revenus (Stripe).</span>
              </span>
            </label>
            <label className="mt-3 flex items-start gap-3 text-sm">
              <input type="checkbox" name="projects" defaultChecked={business ? business.modules.includes("projects") : true} className="mt-0.5 accent-[var(--accent)]" />
              <span>
                Chantiers
                <span className="block text-[13px] text-muted">Projets internes, tâches, pièces jointes et factures liées.</span>
              </span>
            </label>
          </div>

          <FormError message={state.error} />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : business ? "Enregistrer" : "Créer le business"}
            </Button>
            <ButtonLink href={business ? `/b/${business.slug}` : "/reglages"} variant="ghost">
              Annuler
            </ButtonLink>
          </div>
        </div>
      </Card>

      <div className="hidden lg:block">
        <div className="sticky top-10">
          <p className="mb-2 text-[13px] font-medium text-muted">Aperçu</p>
          <Card className="overflow-hidden">
            <div className="h-16 bg-[linear-gradient(135deg,#2c2c2e,#000)]" />
            <div className="-mt-6 px-5 pb-5">
              <BusinessMark name={name || "?"} logoUrl={logoPreview} size="lg" className="ring-4 ring-surface" />
              <p className="mt-3 font-semibold tracking-tight">{name || "Nom du business"}</p>
              <p className="text-[13px] text-muted">/b/{slug || "…"}</p>
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}
