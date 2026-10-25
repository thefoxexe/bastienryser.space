import { initials } from "@/lib/color";
import { cn } from "@/components/ui/cn";

export function BusinessMark({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  /** Conservée en base, plus affichée : les monogrammes sont noirs et blancs. */
  color?: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: "size-[22px] rounded-[6px] text-[10px]", md: "size-9 rounded-[10px] text-[13px]", lg: "size-14 rounded-[16px] text-lg" }[size];
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className={cn(dims, "shrink-0 bg-surface object-cover shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)]", className)} />
    );
  }
  return (
    <span
      className={cn(dims, "grid shrink-0 place-items-center font-semibold tracking-[-0.02em] shadow-[inset_0_0_0_0.5px_var(--border-strong)]", className)}
      style={{ background: "var(--ink)", color: "var(--ink-text)" }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
