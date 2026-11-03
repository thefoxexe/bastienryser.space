"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/components/ui/cn";

const FORMATS = [
  ["md", "Rapport complet (Markdown)", "Pour un agent SEO : synthèse, pages, requêtes, opportunités, cannibalisation"],
  ["requetes", "Requêtes (CSV)", "Toutes les requêtes, 90 j et 28 j comparés"],
  ["pages", "Pages (CSV)", "Toutes les pages, 90 j et 28 j comparés"],
  ["requete-page", "Requête × page (CSV)", "Quelle page sort sur quelle requête"],
  ["jours", "Par jour (CSV)", "16 mois de clics, impressions et position"],
] as const;

/** Export Search Console en direct depuis Google (route /api/export/search-console). */
export function ExportMenu({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: string) {
    setBusy(format);
    setError(null);
    try {
      const res = await fetch(`/api/export/search-console?slug=${encodeURIComponent(slug)}&format=${format}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Export impossible.");
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `search-console-${slug}.${format === "md" ? "md" : "csv"}`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-medium hover:bg-fill-strong"
        aria-expanded={open}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Exporter
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 w-[300px] max-w-[calc(100vw-32px)] rounded-[16px] bg-surface p-1.5 shadow-pop">
          {FORMATS.map(([format, label, hint]) => (
            <button
              key={format}
              type="button"
              disabled={!!busy}
              onClick={() => download(format)}
              className={cn("flex w-full flex-col items-start rounded-[12px] px-3 py-2 text-left hover:bg-fill disabled:opacity-60", busy === format && "bg-fill")}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                {busy === format ? <Loader2 className="size-3 animate-spin" /> : null}
                {label}
              </span>
              <span className="text-[12px] text-muted">{hint}</span>
            </button>
          ))}
          <p className="px-3 pb-1.5 pt-1 text-[11px] text-faint">Chiffres lus en direct chez Google, jusqu&apos;à une minute de préparation.</p>
          {error ? <p className="px-3 pb-2 text-[12px] text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
