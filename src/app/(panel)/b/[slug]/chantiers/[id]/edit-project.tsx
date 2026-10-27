"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui";
import type { Project } from "@/lib/projects";
import { ProjectForm } from "../project-form";

export function EditProject({ businessId, slug, project }: { businessId: string; slug: string; project: Project }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil /> Modifier
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="animate-rise max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[22px] bg-surface p-6 shadow-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Modifier le chantier">
            <h2 className="mb-4 text-[19px] font-semibold tracking-tight">Modifier le chantier</h2>
            <ProjectForm businessId={businessId} slug={slug} project={project} onDone={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
