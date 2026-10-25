import type { SocialNetwork } from "@/lib/types";
import { BrandMark, MONO, type Brand } from "@/components/brand-logos";
import { cn } from "@/components/ui/cn";

const BRAND: Record<SocialNetwork, Brand> = {
  instagram: "instagram",
  facebook: "facebook",
  linkedin: "linkedin",
  linkedin_page: "linkedin",
  threads: "threads",
  youtube: "youtube",
  tiktok: "tiktok",
  bluesky: "bluesky",
  pinterest: "pinterest",
  x: "x",
};

/** Logo officiel du réseau. */
export function NetworkIcon({ network, className }: { network: SocialNetwork; className?: string; brand?: boolean }) {
  return <BrandMark brand={BRAND[network]} className={cn("size-4", className)} />;
}

export function NetworkChip({ network, className }: { network: SocialNetwork; className?: string }) {
  return (
    <span className={cn("grid size-7 place-items-center rounded-[8px] bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)]", className)}>
      <BrandMark brand={BRAND[network]} className={cn("size-[15px]", MONO.has(BRAND[network]) && "text-black")} />
    </span>
  );
}
