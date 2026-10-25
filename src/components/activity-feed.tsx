import { AlertTriangle, CheckCircle2, Clock, Link2, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { ActivityEntry } from "@/lib/types";
import { formatRelative } from "@/lib/format";

function iconFor(kind: string) {
  if (kind.endsWith(".failed") || kind.includes("error")) return <AlertTriangle className="text-danger" />;
  if (kind.endsWith(".published")) return <CheckCircle2 className="text-text" />;
  if (kind.endsWith(".scheduled")) return <Clock className="text-muted" />;
  if (kind.includes("refreshed") || kind.includes("retry")) return <RefreshCw className="text-muted" />;
  if (kind.includes("connected")) return <Link2 className="text-muted" />;
  if (kind.includes("deleted") || kind.includes("disconnected")) return <Trash2 className="text-muted" />;
  return <Plus className="text-muted" />;
}

export function ActivityFeed({ entries, businesses }: { entries: ActivityEntry[]; businesses?: Map<string, { name: string; color: string }> }) {
  if (!entries.length) return <p className="text-[13px] text-muted">Aucune activité pour l&apos;instant.</p>;
  return (
    <ol className="relative flex flex-col gap-4 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-fill-strong">
      {entries.map((e) => {
        const b = e.business_id ? businesses?.get(e.business_id) : undefined;
        return (
          <li key={e.id} className="relative flex gap-3">
            <span className="z-10 grid size-6 shrink-0 place-items-center rounded-full bg-surface ring-4 ring-surface [&_svg]:size-3.5">{iconFor(e.kind)}</span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[13px] leading-snug">{e.message}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-faint">
                {b ? (
                  <>
                    <span className="size-1.5 rounded-full" style={{ background: b.color }} />
                    {b.name} ·
                  </>
                ) : null}
                {formatRelative(e.created_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
