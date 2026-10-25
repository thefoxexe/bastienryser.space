import type { ReactNode } from "react";
import type { AccountStatus, PostStatus, TargetStatus } from "@/lib/types";
import { cn } from "./cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  success: "text-success bg-[color-mix(in_oklab,var(--success)_10%,transparent)] border-[color-mix(in_oklab,var(--success)_22%,transparent)]",
  warning: "text-warning bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] border-[color-mix(in_oklab,var(--warning)_22%,transparent)]",
  danger: "text-danger bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] border-[color-mix(in_oklab,var(--danger)_22%,transparent)]",
  info: "text-info bg-[color-mix(in_oklab,var(--info)_10%,transparent)] border-[color-mix(in_oklab,var(--info)_22%,transparent)]",
  accent: "text-text bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] border-[color-mix(in_oklab,var(--accent)_28%,transparent)]",
};

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[12px] font-medium",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const postStatus: Record<PostStatus, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  scheduled: { label: "Programmé", tone: "info" },
  publishing: { label: "En cours", tone: "warning" },
  published: { label: "Publié", tone: "success" },
  partial: { label: "Partiel", tone: "warning" },
  failed: { label: "Échec", tone: "danger" },
};

const targetStatus: Record<TargetStatus, { label: string; tone: Tone }> = {
  pending: { label: "En attente", tone: "neutral" },
  publishing: { label: "En cours", tone: "warning" },
  published: { label: "Publié", tone: "success" },
  failed: { label: "Échec", tone: "danger" },
};

const accountStatus: Record<AccountStatus, { label: string; tone: Tone }> = {
  connected: { label: "Connecté", tone: "success" },
  expiring: { label: "Expire bientôt", tone: "warning" },
  expired: { label: "Expiré", tone: "danger" },
  error: { label: "Erreur", tone: "danger" },
};

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const s = postStatus[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function TargetStatusBadge({ status }: { status: TargetStatus }) {
  const s = targetStatus[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const s = accountStatus[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}
