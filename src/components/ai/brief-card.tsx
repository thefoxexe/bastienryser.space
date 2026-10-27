"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronRight, RotateCw } from "lucide-react";
import { getBrief, type Brief } from "@/app/(panel)/ai-actions";
import { AiAvatar } from "@/components/ai/avatar";
import { cn } from "@/components/ui/cn";

export const TONE: Record<Brief["points"][number]["tone"], string> = {
  good: "dot-glow",
  warning: "bg-warning",
  bad: "bg-danger",
  info: "bg-faint",
};

/** Ouvre l'assistant sur le brief : il le détaille à voix haute et on peut lui poser des questions. */
export const BRIEF_EVENT = "br:assistant-brief";

const time = (iso: string) => new Intl.DateTimeFormat("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Brief du jour en une phrase ; un clic ouvre le détail dans l'assistant. Préparé une fois par jour, régénérable. */
export function BriefCard({ slug }: { slug: string | null }) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = (force: boolean) =>
    start(async () => {
      const res = await getBrief(slug, force);
      if (res.ok) {
        setBrief(res.brief);
        setError(null);
      } else setError(res.error);
    });

  useEffect(() => {
    load(false);
    // Une fois à l'ouverture de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const open = () => brief && window.dispatchEvent(new CustomEvent(BRIEF_EVENT, { detail: brief }));

  return (
    <section aria-label="Brief du jour" className="group relative flex items-center gap-3.5 rounded-[22px] bg-surface p-4 shadow-card transition hover:shadow-pop sm:px-5">
      <AiAvatar state={pending ? "thinking" : "idle"} className="size-10" />
      <button type="button" onClick={open} disabled={!brief} className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-[22px] disabled:cursor-default">
        <span className="flex items-center gap-2 text-[12px] font-medium text-muted">
          Brief du jour{brief && !pending ? ` · ${time(brief.created_at)}` : ""}
          {brief ? (
            <span className="flex gap-1" aria-hidden>
              {brief.points.map((p, i) => (
                <span key={i} className={cn("size-1.5 rounded-full", TONE[p.tone])} />
              ))}
            </span>
          ) : null}
        </span>
        {pending && !brief ? (
          <span className="mt-1.5 block h-4 w-3/4 animate-pulse rounded-full bg-fill" aria-busy />
        ) : error && !brief ? (
          <span className="mt-0.5 block text-[14px] text-muted">{error}</span>
        ) : brief ? (
          <span className={cn("mt-0.5 block text-[15px] font-semibold leading-snug tracking-tight transition-opacity sm:text-[16px]", pending && "opacity-50")}>{brief.headline}</span>
        ) : null}
      </button>
      {brief ? (
        <span className="hidden shrink-0 items-center gap-0.5 text-[13px] text-muted transition group-hover:text-text sm:flex" aria-hidden>
          Détails <ChevronRight className="size-4" />
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => load(true)}
        disabled={pending}
        className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-faint transition hover:bg-fill hover:text-text disabled:opacity-40"
        title="Refaire le brief avec les derniers chiffres"
        aria-label="Refaire le brief"
      >
        <RotateCw className={cn("size-3.5", pending && "animate-spin")} />
      </button>
    </section>
  );
}
