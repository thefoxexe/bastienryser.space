import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { PERIODS } from "@/lib/finance";

/** Choix de la période (7 jours, 30 jours, 3 mois, 12 mois), gardé dans l'adresse (?periode=). */
export function PeriodChips({ base, current, extra = {} }: { base: string; current: number; extra?: Record<string, string> }) {
  return (
    <div className="scrollbar-none flex max-w-full shrink-0 gap-1 overflow-x-auto rounded-full bg-fill p-1">
      {PERIODS.map((p) => (
        <Link
          key={p.days}
          href={{ pathname: base, query: { ...extra, periode: String(p.days) } }}
          scroll={false}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] transition",
            p.days === current ? "bg-surface font-medium text-text shadow-card" : "text-muted hover:text-text",
          )}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
