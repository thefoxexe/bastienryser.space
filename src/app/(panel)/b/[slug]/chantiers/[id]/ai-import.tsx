"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { AiAvatar } from "@/components/ai/avatar";
import { Button, Textarea } from "@/components/ui";
import { useCloseDialog } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { formatDay } from "@/components/charts/format";
import { createUploadClient } from "@/lib/supabase/browser";
import { addTasks, extractTasks, prepareFileUpload, recordFile, type ExtractedTasks } from "../actions";

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.srt,.vtt";

/**
 * Import d'un compte rendu (PDF, Word, texte, ou texte collé) : Claude propose des tâches,
 * Bastien coche celles à garder avant l'ajout. Le fichier est aussi gardé en pièce jointe.
 */
export function AiImport({ projectId, slug }: { projectId: string; slug: string }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractedTasks | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const close = useCloseDialog();

  const analyse = () =>
    start(async () => {
      setError(null);
      setResult(null);
      let path: string | undefined;
      if (file) {
        setStep("Envoi du fichier…");
        const prep = await prepareFileUpload({ projectId, name: file.name, size: file.size });
        if ("error" in prep) {
          setStep(null);
          return setError(prep.error ?? "Envoi impossible.");
        }
        const { error: upErr } = await createUploadClient().storage.from("project-files").uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) {
          setStep(null);
          return setError("Envoi du fichier impossible.");
        }
        await recordFile({ projectId, slug, path: prep.path, name: file.name, size: file.size, mime: file.type });
        path = prep.path;
      }
      setStep("Lecture par l'IA…");
      const res = await extractTasks({ projectId, path, name: file?.name, text: file ? undefined : text });
      setStep(null);
      if (!res.ok) return setError(res.error);
      setResult(res.data);
      setKeep(res.data.tasks.map(() => true));
    });

  const save = () =>
    start(async () => {
      if (!result) return;
      const tasks = result.tasks.filter((_, i) => keep[i]).map((t) => ({ ...t, due_date: t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null }));
      if (!tasks.length) return;
      const res = await addTasks({ projectId, slug, tasks });
      if (res.error) return setError(res.error);
      setResult(null);
      setText("");
      setFile(null);
      close();
    });

  const count = keep.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      {result ? (
        <>
          <div className="flex gap-3 rounded-[14px] bg-fill p-3.5">
            <AiAvatar className="size-8" />
            <p className="text-[13px] leading-relaxed">{result.summary}</p>
          </div>
          <ul className="flex flex-col gap-1">
            {result.tasks.map((t, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-start gap-3 rounded-[12px] px-2 py-2 hover:bg-fill">
                  <input type="checkbox" checked={keep[i]} onChange={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))} className="mt-1 accent-[var(--text)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{t.title}</span>
                    {t.notes ? <span className="block text-[12px] text-muted">{t.notes}</span> : null}
                  </span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {t.priority === "high" ? <span className="text-danger">Haute · </span> : null}
                    {t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? formatDay(t.due_date) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={save} disabled={pending || !count}>
              {pending ? <Loader2 className="animate-spin" /> : null} Ajouter {count} tâche{count > 1 ? "s" : ""}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setResult(null)} disabled={pending}>
              Annuler
            </Button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
            className={cn("flex items-center gap-3 rounded-[14px] border border-dashed border-border-strong px-4 py-4 text-left transition hover:bg-fill", file && "border-solid bg-fill")}
          >
            {file ? <FileText className="size-5 shrink-0" /> : <Upload className="size-5 shrink-0 text-muted" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{file ? file.name : "Déposer un compte rendu"}</span>
              <span className="block text-[12px] text-muted">{file ? `${Math.round(file.size / 1024)} Ko · gardé en pièce jointe` : "PDF, Word (.docx) ou texte (.txt, .md)"}</span>
            </span>
            {file ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="text-[12px] text-muted hover:text-text"
              >
                Retirer
              </span>
            ) : null}
          </button>
          <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {!file ? <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="…ou colle ici le résumé de ta séance, un e-mail du client, des notes vocales transcrites." /> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={analyse} disabled={pending || (!file && !text.trim())}>
              {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Créer les tâches avec l&apos;IA
            </Button>
            {step ? <span className="text-[13px] text-muted">{step}</span> : null}
          </div>
        </>
      )}
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
