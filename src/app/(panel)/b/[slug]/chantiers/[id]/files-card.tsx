"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import type { ProjectFile } from "@/lib/projects";
import { createUploadClient } from "@/lib/supabase/browser";
import { deleteFile, prepareFileUpload, recordFile } from "../actions";

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

/** Pièces jointes du chantier : envoi direct vers le stockage privé, téléchargement par lien signé. */
export function FilesCard({ projectId, slug, files }: { projectId: string; slug: string; files: ProjectFile[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const upload = (list: FileList | null) =>
    start(async () => {
      setError(null);
      for (const file of Array.from(list ?? [])) {
        const prep = await prepareFileUpload({ projectId, name: file.name, size: file.size });
        if ("error" in prep) return setError(prep.error ?? "Envoi impossible.");
        const { error: upErr } = await createUploadClient().storage.from("project-files").uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) return setError(`Envoi de ${file.name} impossible.`);
        await recordFile({ projectId, slug, path: prep.path, name: file.name, size: file.size, mime: file.type });
      }
    });

  return (
    <div className="flex flex-col gap-3 p-5 pt-0 sm:p-6 sm:pt-0">
      {files.length ? (
        <ul className="flex flex-col gap-1">
          {files.map((f) => (
            <li key={f.id} className="group flex items-center gap-3 rounded-[12px] px-2 py-2 hover:bg-fill">
              <FileText className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{f.name}</span>
                <span className="block text-[12px] text-faint">{size(f.size)}</span>
              </span>
              {f.url ? (
                <a href={f.url} className="grid size-8 place-items-center rounded-full text-muted hover:bg-fill-strong hover:text-text" aria-label={`Télécharger ${f.name}`}>
                  <Download className="size-4" />
                </a>
              ) : null}
              <form action={deleteFile}>
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="slug" value={slug} />
                <button type="submit" className="grid size-8 place-items-center rounded-full text-faint hover:bg-fill-strong hover:text-danger sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Supprimer ${f.name}`}>
                  <Trash2 className="size-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">Maquettes, contrats, accès, comptes rendus : tout ce qui concerne ce chantier.</p>
      )}
      <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      <Button type="button" size="sm" variant="secondary" onClick={() => input.current?.click()} disabled={pending} className="self-start">
        {pending ? <Loader2 className="animate-spin" /> : <Paperclip />} Joindre des fichiers
      </Button>
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
