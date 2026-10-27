"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { AiAvatar } from "@/components/ai/avatar";
import { formatDay } from "@/components/charts/format";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { useCloseDialog } from "@/components/ui/dialog";
import { createUploadClient } from "@/lib/supabase/browser";
import { addTasks, extractTasks, prepareFileUpload, recordFile, type ExtractedTasks } from "../actions";

const ACCEPT = ".txt,.md,.markdown,.srt,.vtt,.csv,.json,.html,.pdf,.docx";
const isDate = (v: string | null) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export function AiImport({ projectId, slug }: { projectId: string; slug: string }) {
  const close = useCloseDialog();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractedTasks | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);
  const [keepReport, setKeepReport] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

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
        const { error: upErr } = await createUploadClient()
          .storage.from("project-files")
          .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || "text/plain" });
        if (upErr) {
          setStep(null);
          return setError("Envoi du fichier impossible.");
        }
        await recordFile({ projectId, slug, path: prep.path, name: file.name, size: file.size, mime: file.type });
        path = prep.path;
      }
      setStep("L'IA lit le document…");
      const res = await extractTasks({ projectId, path, name: file?.name, text: file ? undefined : text });
      setStep(null);
      if (!res.ok) return setError(res.error);
      setResult(res.data);
      setKeep(res.data.tasks.map(() => true));
    });

  const save = () =>
    start(async () => {
      if (!result) return;
      const tasks = result.tasks.filter((_, i) => keep[i]);
      const report = keepReport ? result.report : undefined;
      if (!tasks.length) return;
      const res = await addTasks({ projectId, slug, tasks, report });
      if (res.error) return setError(res.error);
      close();
    });

  const count = keep.filter(Boolean).length;

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 rounded-[14px] bg-fill p-3.5">
          <AiAvatar className="size-8" />
          <p className="text-[13px] leading-relaxed">{result.summary}</p>
        </div>

        <div>
          <p className="mb-1 px-2 text-[12px] font-medium text-muted">
            {result.tasks.length} tâche{result.tasks.length > 1 ? "s" : ""} proposée{result.tasks.length > 1 ? "s" : ""} · décoche ce que tu ne veux pas
          </p>
          <ul className="flex flex-col">
            {result.tasks.map((t, i) => (
              <li key={i}>
                <label className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] px-2 py-2 transition hover:bg-fill", !keep[i] && "opacity-45")}>
                  <input type="checkbox" checked={keep[i]} onChange={() => setKeep((k) => k.map((v, j) => (j === i ? !v : v)))} className="mt-1 accent-[var(--text)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">{t.title}</span>
                    {t.notes ? <span className="block text-[12px] leading-relaxed text-muted">{t.notes}</span> : null}
                  </span>
                  <span className="shrink-0 text-right text-[12px] text-muted">
                    {t.priority === "high" ? <span className="block text-danger">Prioritaire</span> : null}
                    {isDate(t.due_date) ? formatDay(t.due_date!) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {result.report.trim() ? (
          <details className="group rounded-[14px] bg-fill">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[13px] font-medium">
              Compte rendu de la séance
              <span className="text-[12px] font-normal text-muted group-open:hidden">Lire</span>
            </summary>
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap px-3.5 pb-3.5 text-[13px] leading-relaxed text-text/85">{result.report.replace(/^#+\s*/gm, "").replace(/\*\*/g, "")}</div>
          </details>
        ) : null}
        <label className="flex items-center gap-2 px-1 text-[13px]">
          <input type="checkbox" checked={keepReport} onChange={(e) => setKeepReport(e.target.checked)} className="accent-[var(--text)]" />
          Garder le compte rendu dans les fichiers du projet
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={pending || !count}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Ajouter {count} tâche{count > 1 ? "s" : ""}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setResult(null)} disabled={pending}>
            Recommencer
          </Button>
        </div>
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) setFile(f);
        }}
        className={cn("flex items-center gap-3 rounded-[16px] border border-dashed border-border-strong px-4 py-5 text-left transition hover:bg-fill", file && "border-solid bg-fill")}
      >
        {file ? <FileText className="size-6 shrink-0" /> : <Upload className="size-6 shrink-0 text-muted" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{file ? file.name : "Déposer la transcription"}</span>
          <span className="block text-[12px] text-muted">
            {file ? `${Math.max(1, Math.round(file.size / 1024))} Ko · gardée en pièce jointe` : "Le .txt de TurboScribe tel quel, ou un PDF, un Word, un compte rendu"}
          </span>
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
      {!file ? <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="…ou colle ici la transcription, ton résumé ChatGPT, un e-mail du client." /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={analyse} disabled={pending || (!file && !text.trim())}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Créer les tâches
        </Button>
        {step ? <span className="text-[13px] text-muted">{step}</span> : null}
      </div>
      <p className="text-[12px] text-faint">Une séance d&apos;une heure se lit en 20 à 40 secondes. Rien n&apos;est créé avant ta validation.</p>
      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
