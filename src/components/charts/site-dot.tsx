import { cn } from "@/components/ui/cn";

export function SiteDot({ ok }: { ok: boolean | null }) {
  return (
    <span className="relative flex size-2.5 shrink-0" aria-label={ok === null ? "Pas encore mesuré" : ok ? "En ligne" : "Injoignable"}>
      {ok === false ? <span className="absolute inset-0 animate-ping rounded-full bg-danger opacity-60" /> : null}
      <span className={cn("relative size-2.5 rounded-full", ok === null ? "bg-fill-strong" : ok ? "dot-glow" : "bg-danger")} />
    </span>
  );
}
