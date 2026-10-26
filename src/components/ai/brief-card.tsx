"use client";

import { useEffect, useState, useTransition } from "react";
import { RotateCw } from "lucide-react";
import { getBrief, type Brief } from "@/app/(panel)/ai-actions";
import { AiAvatar } from "@/components/ai/avatar";
import { cn } from "@/components/ui/cn";

const TONE: Record<Brief["points"][number]["tone"], string> = {
  good: "dot-glow",
  warning: "bg-warning",
  bad: "bg-danger",
  info: "bg-faint",
};

const time = (iso: string) => new Intl.DateTimeFormat("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Brief du jour écrit par l'IA à partir des vrais chiffres : préparé une fois par jour, régénérable. */
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

  return (
    <section aria-label="Brief du jour" className="rounded-[22px] bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3.5">
        <AiAvatar state={pending ? "thinking" : "idle"} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-muted">
              Brief du jour{brief && !pending ? ` · ${time(brief.created_at)}` : ""}
            </p>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={pending}
              className="grid size-7 place-items-center rounded-full text-faint transition hover:bg-fill hover:text-text disabled:opacity-40"
              title="Refaire le brief avec les derniers chiffres"
              aria-label="Refaire le brief"
            >
              <RotateCw className={cn("size-3.5", pending && "animate-spin")} />
            </button>
          </div>

          {pending && !brief ? (
            <div className="mt-2 flex flex-col gap-2" aria-busy>
              <span className="h-4 w-3/4 animate-pulse rounded-full bg-fill" />
              <span className="h-3 w-full animate-pulse rounded-full bg-fill" />
              <span className="h-3 w-5/6 animate-pulse rounded-full bg-fill" />
              <p className="text-[12px] text-faint">Je lis tes chiffres…</p>
            </div>
          ) : error && !brief ? (
            <p className="mt-1 text-[14px] text-muted">{error}</p>
          ) : brief ? (
            <div className={cn("transition-opacity", pending && "opacity-50")}>
              <p className="mt-0.5 text-[16px] font-semibold leading-snug tracking-tight">{brief.headline}</p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {brief.points.map((p, i) => (
                  <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-text/90">
                    <span className={cn("mt-[0.55em] size-1.5 shrink-0 rounded-full", TONE[p.tone])} />
                    <span>{p.text}</span>
                  </li>
                ))}
              </ul>
              {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
