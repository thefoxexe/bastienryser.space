import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { NetworkIcon } from "@/components/network-icon";
import type { PostSummary } from "@/lib/data";
import { formatTime, TIME_ZONE, zurichDayKey } from "@/lib/format";
import { postTitle } from "./post-row";

const WEEKDAYS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

const statusDot: Record<PostSummary["status"], string> = {
  draft: "bg-faint",
  scheduled: "bg-info",
  publishing: "bg-warning",
  published: "bg-success",
  partial: "bg-warning",
  failed: "bg-danger",
};

function postDate(p: PostSummary) {
  return p.status === "published" || p.status === "partial" ? (p.published_at ?? p.scheduled_at) : p.scheduled_at;
}

/** Grille mensuelle (semaines du lundi au dimanche), heure de Zurich. */
export function MonthCalendar({
  year,
  month,
  posts,
  hrefFor,
  colorFor,
}: {
  year: number;
  month: number; // 1-12
  posts: PostSummary[];
  hrefFor: (p: PostSummary) => string;
  colorFor?: (p: PostSummary) => string | undefined;
}) {
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const today = zurichDayKey(new Date());

  const byDay = new Map<string, PostSummary[]>();
  for (const p of posts) {
    const d = postDate(p);
    if (!d) continue;
    const k = zurichDayKey(d);
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1, 1 - startOffset + i, 12));
    return { date, key: date.toISOString().slice(0, 10), inMonth: date.getUTCMonth() === month - 1 };
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-[11px] font-medium uppercase tracking-wide text-faint">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          const list = (byDay.get(c.key) ?? []).sort((a, b) => (postDate(a) ?? "").localeCompare(postDate(b) ?? ""));
          return (
            <div
              key={c.key}
              className={cn(
                "min-h-20 border-border p-1 sm:min-h-28 sm:p-1.5",
                i % 7 !== 6 && "border-r",
                i < totalCells - 7 && "border-b",
                !c.inMonth && "bg-[color-mix(in_oklab,var(--surface-2)_60%,transparent)]",
              )}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[12px] tabular",
                    c.key === today ? "bg-accent font-semibold text-accent-text" : c.inMonth ? "text-muted" : "text-faint",
                  )}
                >
                  {c.date.getUTCDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {list.slice(0, 3).map((p) => (
                  <Link
                    key={p.id}
                    href={hrefFor(p)}
                    className="group flex items-center gap-1 overflow-hidden rounded-md border border-border bg-surface px-1 py-0.5 text-[11px] shadow-card transition hover:border-border-strong sm:px-1.5"
                    style={colorFor?.(p) ? { borderLeft: `3px solid ${colorFor(p)}` } : undefined}
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", statusDot[p.status])} />
                    <span className="hidden shrink-0 tabular text-muted sm:inline">{postDate(p) ? formatTime(postDate(p)!) : ""}</span>
                    <span className="hidden truncate sm:inline">{postTitle(p)}</span>
                    <span className="ml-auto hidden shrink-0 items-center gap-0.5 lg:flex">
                      {[...new Set(p.targets.map((t) => t.network))].map((n) => (
                        <NetworkIcon key={n} network={n} className="size-3" />
                      ))}
                    </span>
                  </Link>
                ))}
                {list.length > 3 ? <span className="px-1 text-[11px] text-muted">+{list.length - 3}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function monthRange(param: string | undefined) {
  const now = new Date();
  const fallback = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit" }).format(now);
  const value = param && /^\d{4}-\d{2}$/.test(param) ? param : fallback.slice(0, 7);
  const [year, month] = value.split("-").map(Number);
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  // Marge d'une semaine de chaque côté pour les cases hors du mois.
  const from = new Date(Date.UTC(year, month - 1, 1) - 8 * 86400_000).toISOString();
  const to = new Date(Date.UTC(year, month, 1) + 8 * 86400_000).toISOString();
  const label = new Intl.DateTimeFormat("fr-CH", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 15)));
  return { year, month, prev, next, from, to, label };
}
