"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { ProjectForm, type BusinessChoice } from "./project-form";

/** Bouton « Nouveau chantier » qui ouvre le formulaire dans une fenêtre. */
export function NewProject({ businessId, slug, businesses, label = "Nouveau chantier" }: { businessId?: string; slug?: string; businesses?: BusinessChoice[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="animate-rise w-full max-w-lg rounded-[22px] bg-surface p-6 shadow-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nouveau chantier">
            <h2 className="mb-4 text-[19px] font-semibold tracking-tight">Nouveau chantier</h2>
            <ProjectForm businessId={businessId} slug={slug} businesses={businesses} />
          </div>
        </div>
      ) : null}
    </>
  );
}
