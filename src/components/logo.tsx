import { cn } from "@/components/ui/cn";

// Monogramme « br » : le b et le r partagent la même panse.
// Coupe principale (trait 30) et coupe petite taille (trait 40, panse plus ouverte) sous 24 px.
const MAIN = "M58 38 V170 A48 48 0 1 0 154 170 A48 48 0 1 0 58 170 M154 172 A44 44 0 0 1 198 128";
const SMALL = "M56 34 V168 A52 52 0 1 0 160 168 A52 52 0 1 0 56 168 M160 170 A42 42 0 0 1 202 128";

export function LogoMark({ className, small, title }: { className?: string; small?: boolean; title?: string }) {
  return (
    <svg
      viewBox={small ? "14 12 230 230" : "28 18 200 220"}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d={small ? SMALL : MAIN}
        fill="none"
        stroke="currentColor"
        strokeWidth={small ? 40 : 30}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Logo complet : monogramme + nom. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark small className={cn("size-[22px]", markClassName)} />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">
        bastienryser<span className="font-normal text-faint">.space</span>
      </span>
    </span>
  );
}
