import type { SocialNetwork } from "@/lib/types";
import { NETWORKS } from "@/lib/social/networks";
import { cn } from "@/components/ui/cn";

// Pictogrammes simplifiés (pas de logos officiels), en couleur de marque.
const paths: Record<SocialNetwork, React.ReactNode> = {
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
    </>
  ),
  facebook: (
    <path
      fill="currentColor"
      d="M13.4 21v-7.3h2.5l.4-2.9h-2.9V9c0-.8.3-1.4 1.4-1.4h1.6V5.1c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2H8v2.9h2.4V21h3Z"
    />
  ),
  linkedin: (
    <path
      fill="currentColor"
      d="M6.9 8.9H4V20h2.9V8.9ZM5.5 4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4ZM20 13.6c0-3-1.6-4.9-4.2-4.9-1.4 0-2.4.8-2.8 1.5V8.9h-2.8V20H13v-5.8c0-1.5.6-2.6 2-2.6s1.9 1 1.9 2.6V20H20v-6.4Z"
    />
  ),
  linkedin_page: (
    <path
      fill="currentColor"
      d="M6.9 8.9H4V20h2.9V8.9ZM5.5 4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4ZM20 13.6c0-3-1.6-4.9-4.2-4.9-1.4 0-2.4.8-2.8 1.5V8.9h-2.8V20H13v-5.8c0-1.5.6-2.6 2-2.6s1.9 1 1.9 2.6V20H20v-6.4Z"
    />
  ),
  threads: (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      d="M16.5 11.2c-.4-2.3-2-3.5-4.3-3.5-2.6 0-4.4 1.9-4.4 4.4 0 2.6 1.8 4.4 4.4 4.4 2.2 0 3.8-1.3 3.8-3.1 0-1.6-1.3-2.6-3.3-2.6-1.6 0-2.6.8-2.6 1.9 0 1 .8 1.7 2 1.7 2.6 0 3.4-3.1 2.4-6.1M12 21c5 0 8.5-3.6 8.5-9S17 3 12 3 3.5 6.6 3.5 12 7 21 12 21Z"
    />
  ),
};

export function NetworkIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-label={NETWORKS[network].label} role="img" className={cn("size-4", className)} style={{ color: NETWORKS[network].brand }}>
      {paths[network]}
    </svg>
  );
}

export function NetworkChip({ network, className }: { network: SocialNetwork; className?: string }) {
  return (
    <span className={cn("grid size-7 place-items-center rounded-lg border border-border bg-surface", className)}>
      <NetworkIcon network={network} className="size-[15px] dark:[filter:brightness(1.4)]" />
    </span>
  );
}
