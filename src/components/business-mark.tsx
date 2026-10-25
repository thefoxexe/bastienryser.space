import { initials, readableOn } from "@/lib/color";
import { cn } from "@/components/ui/cn";

export function BusinessMark({
  name,
  color,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  color: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: "size-6 rounded-md text-[10px]", md: "size-8 rounded-lg text-[12px]", lg: "size-12 rounded-xl text-base" }[size];
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className={cn(dims, "shrink-0 border border-border bg-surface object-cover", className)} />
    );
  }
  return (
    <span
      className={cn(dims, "grid shrink-0 place-items-center font-semibold tracking-tight shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]", className)}
      style={{ background: color, color: readableOn(color) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
