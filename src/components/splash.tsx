import type { CSSProperties } from "react";
import { BarChart3, CalendarClock, Globe, Heart, ImageIcon, Search, Send, TrendingUp, Wallet } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { cn } from "@/components/ui/cn";

// Icônes qui s'échappent du logo : ce que fait le panel (publier, mesurer, encaisser, surveiller).
const FLYERS = [
  { Icon: Send, dx: -150, dy: -90, d: 0 },
  { Icon: BarChart3, dx: 160, dy: -70, d: 0.25 },
  { Icon: Wallet, dx: 130, dy: 110, d: 0.5 },
  { Icon: ImageIcon, dx: -140, dy: 100, d: 0.75 },
  { Icon: TrendingUp, dx: 10, dy: -160, d: 1 },
  { Icon: Heart, dx: -190, dy: 10, d: 1.25 },
  { Icon: Globe, dx: 195, dy: 25, d: 1.5 },
  { Icon: Search, dx: -40, dy: 165, d: 1.75 },
  { Icon: CalendarClock, dx: 70, dy: -140, d: 2 },
];

/**
 * Écran de chargement : logo au halo vert, icônes qui s'envolent, barre de progression.
 * `compact` : version pour la zone de contenu (changement de page), sans prendre tout l'écran.
 */
export function Splash({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Chargement"
      className={cn("relative flex flex-col items-center justify-center overflow-hidden", compact ? "min-h-[60vh]" : "min-h-dvh", className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--green-soft), transparent)" }}
      />
      <div className="relative grid size-[360px] max-w-full place-items-center" aria-hidden>
        {FLYERS.map(({ Icon, dx, dy, d }, i) => (
          <span
            key={i}
            className="splash-fly absolute left-1/2 top-1/2 grid size-10 place-items-center rounded-[12px] bg-[color-mix(in_oklab,var(--surface)_80%,transparent)] text-text shadow-pop backdrop-blur-md"
            style={{ "--dx": `${compact ? dx * 0.7 : dx}px`, "--dy": `${compact ? dy * 0.7 : dy}px`, animationDelay: `${d}s` } as CSSProperties}
          >
            <Icon className={cn("size-[18px]", i % 3 === 1 && "text-green")} />
          </span>
        ))}
        <span className="splash-ring absolute size-24 rounded-[28px]" />
        <span className="relative grid size-20 place-items-center rounded-[24px] bg-ink text-ink-text shadow-pop">
          <LogoMark className="size-10" />
        </span>
      </div>
      <div className="relative mt-2 h-[3px] w-40 overflow-hidden rounded-full bg-fill-strong">
        <span className="splash-progress absolute inset-y-0 left-0 w-full origin-left rounded-full bg-green shadow-[0_0_12px_var(--green-glow)]" />
      </div>
      <p className="relative mt-4 text-[13px] text-muted">{compact ? "Chargement…" : "Tes chiffres arrivent…"}</p>
    </div>
  );
}
